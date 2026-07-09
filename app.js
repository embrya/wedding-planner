import { firebaseConfig } from "./firebase-config.js";

const appRoot = document.querySelector("#app");
const printRoot = document.querySelector("#print-root");
const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const roleLabels = { planner: "플래너", groom: "신랑", bride: "신부" };
const localStoreKey = "weddingPlanner.localStore";
const localSessionKey = "weddingPlanner.localSession";
const localWeddingId = "local-wedding";
const localAdminId = "admin";

const firebaseReady = firebaseConfig?.apiKey && !firebaseConfig.apiKey.includes("YOUR_");

let getAuth;
let onAuthStateChanged;
let signInWithEmailAndPassword;
let signOut;
let initializeFirestore;
let persistentLocalCache;
let collection;
let doc;
let getDoc;
let setDoc;
let updateDoc;
let deleteDoc;
let onSnapshot;
let serverTimestamp;
let writeBatch;
let auth = null;
let db = null;

if (firebaseReady) {
  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");
  const firebaseApp = appModule.initializeApp(firebaseConfig);
  ({
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
  } = authModule);
  ({
    initializeFirestore,
    persistentLocalCache,
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    writeBatch
  } = firestoreModule);
  auth = getAuth(firebaseApp);
  db = initializeFirestore(firebaseApp, { localCache: persistentLocalCache() });
}

let state = {
  authUser: null,
  profile: null,
  wedding: null,
  members: [],
  dayNotes: new Map(),
  weekNotes: new Map(),
  selectedDate: null,
  localMode: false,
  loading: true,
  error: ""
};

let unsubscribers = [];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return dateKey(start);
}

function monthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function displayDate(key) {
  const date = parseDate(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function defaultWeddingDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return dateKey(date);
}

function createDefaultLocalStore() {
  return {
    users: {
      [localAdminId]: {
        id: localAdminId,
        loginId: "admin",
        password: "admin",
        weddingId: localWeddingId,
        role: "planner",
        displayName: "관리자",
        email: "admin"
      }
    },
    weddings: {
      [localWeddingId]: {
        id: localWeddingId,
        groomName: "신랑",
        brideName: "신부",
        weddingDate: defaultWeddingDate(),
        plannerName: "관리자",
        plannerUid: localAdminId
      }
    },
    members: {
      [localWeddingId]: {
        [localAdminId]: {
          role: "planner",
          displayName: "관리자",
          email: "admin"
        }
      }
    },
    dayNotes: {
      [localWeddingId]: {}
    },
    weekNotes: {
      [localWeddingId]: {}
    }
  };
}

function getLocalStore() {
  const defaults = createDefaultLocalStore();
  try {
    const stored = JSON.parse(localStorage.getItem(localStoreKey) || "{}");
    return {
      ...defaults,
      ...stored,
      users: { ...defaults.users, ...(stored.users || {}) },
      weddings: { ...defaults.weddings, ...(stored.weddings || {}) },
      members: { ...defaults.members, ...(stored.members || {}) },
      dayNotes: { ...defaults.dayNotes, ...(stored.dayNotes || {}) },
      weekNotes: { ...defaults.weekNotes, ...(stored.weekNotes || {}) }
    };
  } catch {
    return defaults;
  }
}

function saveLocalStore(store) {
  localStorage.setItem(localStoreKey, JSON.stringify(store));
}

function setLocalState(userId) {
  const store = getLocalStore();
  const user = store.users[userId];
  if (!user) return false;
  const weddingId = user.weddingId;
  state.authUser = { uid: user.id, email: user.email || user.loginId };
  state.profile = { ...user };
  state.wedding = { id: weddingId, ...store.weddings[weddingId] };
  state.members = Object.entries(store.members[weddingId] || {}).map(([id, member]) => ({ id, ...member }));
  state.dayNotes = new Map(Object.entries(store.dayNotes[weddingId] || {}).map(([id, note]) => [id, { id, ...note }]));
  state.weekNotes = new Map(Object.entries(store.weekNotes[weddingId] || {}).map(([id, note]) => [id, { id, ...note }]));
  state.localMode = true;
  state.loading = false;
  state.error = "";
  return true;
}

function loginLocalUser(loginId, password) {
  const normalizedLogin = String(loginId || "").trim();
  const store = getLocalStore();
  const user = Object.values(store.users).find((item) => (
    item.loginId === normalizedLogin || item.email === normalizedLogin
  ) && item.password === password);
  if (!user) return false;
  localStorage.setItem(localSessionKey, user.id);
  setLocalState(user.id);
  render();
  return true;
}

function logoutLocalUser() {
  localStorage.removeItem(localSessionKey);
  state.authUser = null;
  state.profile = null;
  state.wedding = null;
  state.members = [];
  state.dayNotes = new Map();
  state.weekNotes = new Map();
  state.selectedDate = null;
  state.localMode = false;
  state.loading = false;
  render();
}

function monthsFromToday() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return Array.from({ length: 12 }, (_, index) => new Date(first.getFullYear(), first.getMonth() + index, 1));
}

function getMonthCells(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getMonthWeeks(monthDate) {
  const cells = getMonthCells(monthDate);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const realDays = cells.slice(i, i + 7).filter(Boolean);
    if (realDays.length) weeks.push(weekKey(realDays[0]));
  }
  return [...new Set(weeks)];
}

function plannerMode() {
  return state.profile?.role === "planner";
}

function showError(message) {
  state.error = message;
  render();
}

function clearSubscriptions() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}

async function loadProfile(user) {
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) {
    state.profile = null;
    state.wedding = null;
    state.members = [];
    state.dayNotes = new Map();
    state.weekNotes = new Map();
    state.loading = false;
    render();
    return;
  }

  state.profile = { id: profileSnap.id, ...profileSnap.data() };
  subscribeWedding(state.profile.weddingId);
}

function subscribeWedding(weddingId) {
  clearSubscriptions();
  unsubscribers.push(onSnapshot(doc(db, "weddings", weddingId), (snap) => {
    state.wedding = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    state.loading = false;
    render();
  }));
  unsubscribers.push(onSnapshot(collection(db, "weddings", weddingId, "members"), (snap) => {
    state.members = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }));
  unsubscribers.push(onSnapshot(collection(db, "weddings", weddingId, "dayNotes"), (snap) => {
    state.dayNotes = new Map(snap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
    render();
  }));
  unsubscribers.push(onSnapshot(collection(db, "weddings", weddingId, "weekNotes"), (snap) => {
    state.weekNotes = new Map(snap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
    render();
  }));
}

function renderLogin() {
  appRoot.innerHTML = `
    <section class="login">
      <form class="login-panel" data-action="login">
        <div class="brand">
          <div class="eyebrow">Wedding Calendar</div>
          <h1>결혼 준비 일정을 한 장으로 관리</h1>
          <p class="muted">플래너 계정으로 신랑/신부 계정을 발급하고, 모든 일정은 모바일과 인쇄용 연간표로 확인합니다.</p>
        </div>
        <p class="muted">최초 관리자 로그인: <strong>admin / admin</strong></p>
        ${firebaseReady ? "" : `<p class="muted">Firebase 설정 전에는 이 브라우저에 저장되는 로컬 모드로 동작합니다.</p>`}
        <label>아이디 또는 이메일<input name="email" type="text" autocomplete="username" required /></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required /></label>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <button type="submit">로그인</button>
      </form>
    </section>
  `;
}

function renderSetup() {
  appRoot.innerHTML = `
    <section class="login">
      <form class="login-panel" data-action="setup">
        <div class="brand">
          <div class="eyebrow">Initial Setup</div>
          <h1>플래너 초기 설정</h1>
          <p class="muted">현재 로그인한 계정을 플래너로 등록하고 첫 웨딩 캘린더를 만듭니다.</p>
        </div>
        <label>플래너명<input name="plannerName" required placeholder="예: 한인주 실장" /></label>
        <div class="form-grid two">
          <label>신랑 이름<input name="groomName" required /></label>
          <label>신부 이름<input name="brideName" required /></label>
        </div>
        <label>예식일<input name="weddingDate" type="date" required /></label>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <div class="row">
          <button type="submit">웨딩 생성</button>
          <button class="secondary" type="button" data-action="logout">로그아웃</button>
        </div>
      </form>
    </section>
  `;
}

function renderApp() {
  const names = state.wedding ? `${state.wedding.groomName || "신랑"} · ${state.wedding.brideName || "신부"}` : "";
  appRoot.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div class="topline">
          <div>
            <div class="eyebrow">Wedding Calendar</div>
            <h2>${escapeHtml(names)}</h2>
          </div>
          <span class="role-pill">${roleLabels[state.profile.role]}</span>
        </div>
        <div class="actions">
          <button type="button" data-action="print">PDF 인쇄</button>
          <button class="secondary" type="button" data-action="png">이미지 저장</button>
          <button class="ghost" type="button" data-action="logout">로그아웃</button>
        </div>
      </header>
      <div class="grid">
        ${plannerMode() ? renderPlannerPanel() : ""}
        <section class="calendar">${monthsFromToday().map(renderMonth).join("")}</section>
        ${renderUpcoming()}
      </div>
      ${state.selectedDate ? renderDayEditor() : ""}
    </section>
  `;
  renderPrintSheet();
}

function renderPlannerPanel() {
  return `
    <section class="panel">
      <h3>관리</h3>
      <form class="form-grid" data-action="save-wedding">
        <div class="form-grid two">
          <label>신랑 이름<input name="groomName" value="${escapeHtml(state.wedding?.groomName || "")}" required /></label>
          <label>신부 이름<input name="brideName" value="${escapeHtml(state.wedding?.brideName || "")}" required /></label>
        </div>
        <div class="form-grid two">
          <label>예식일<input name="weddingDate" type="date" value="${escapeHtml(state.wedding?.weddingDate || "")}" required /></label>
          <label>플래너명<input name="plannerName" value="${escapeHtml(state.wedding?.plannerName || "")}" /></label>
        </div>
        <button type="submit">저장</button>
      </form>
      <form class="form-grid" data-action="create-account">
        <h3>신랑/신부 로그인 발급</h3>
        <div class="form-grid two">
          <label>역할
            <select name="role">
              <option value="groom">신랑</option>
              <option value="bride">신부</option>
            </select>
          </label>
          <label>이름<input name="displayName" required /></label>
        </div>
        <label>${state.localMode ? "로그인 아이디" : "로그인 이메일"}<input name="email" type="${state.localMode ? "text" : "email"}" required /></label>
        <div class="form-grid two">
          <label>임시 비밀번호<input name="password" minlength="${state.localMode ? "1" : "6"}" value="${generatePassword()}" required /></label>
          <button class="secondary" type="button" data-action="regen-password">비번 새로</button>
        </div>
        <button type="submit">계정 발급</button>
      </form>
    </section>
  `;
}

function renderMonth(monthDate) {
  const cells = getMonthCells(monthDate);
  const todayKey = dateKey(new Date());
  return `
    <article class="month-card">
      <div class="month-head">
        <div class="month-name">${monthDate.getMonth() + 1}</div>
        <strong>${monthDate.getFullYear()}</strong>
      </div>
      <div class="weekday">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="days">
        ${cells.map((date) => {
          if (!date) return `<div class="day empty"></div>`;
          const key = dateKey(date);
          const classes = ["day"];
          if (key === todayKey) classes.push("today");
          if (state.dayNotes.has(key)) classes.push("has-note");
          return `<button class="${classes.join(" ")}" type="button" data-action="select-day" data-date="${key}">${date.getDate()}</button>`;
        }).join("")}
      </div>
      <div class="week-notes">
        ${getMonthWeeks(monthDate).map((key) => {
          const value = state.weekNotes.get(key)?.text || "";
          if (plannerMode()) {
            return `<label class="week-line"><span>${displayDate(key)} 주</span><textarea data-action="week-note" data-week="${key}" placeholder="주별 메모">${escapeHtml(value)}</textarea></label>`;
          }
          return `<div class="week-line"><span>${displayDate(key)} 주</span><div class="week-read">${escapeHtml(value || "-")}</div></div>`;
        }).join("")}
      </div>
    </article>
  `;
}

function renderDayEditor() {
  const note = state.dayNotes.get(state.selectedDate);
  const readonly = !plannerMode();
  return `
    <div class="backdrop" data-action="close-editor"></div>
    <form class="day-editor" data-action="save-day">
      <div class="topline">
        <h3>${escapeHtml(state.selectedDate)} 일정</h3>
        <button class="ghost" type="button" data-action="close-editor">닫기</button>
      </div>
      <label>제목<input name="title" value="${escapeHtml(note?.title || "")}" ${readonly ? "readonly" : ""} /></label>
      <label>메모<textarea name="text" ${readonly ? "readonly" : ""}>${escapeHtml(note?.text || "")}</textarea></label>
      ${readonly ? "" : `
        <div class="row">
          <button type="submit">저장</button>
          <button class="secondary" type="button" data-action="delete-day" ${note ? "" : "disabled"}>삭제</button>
        </div>
      `}
    </form>
  `;
}

function renderUpcoming() {
  const today = dateKey(new Date());
  const events = [...state.dayNotes.values()]
    .filter((note) => note.id >= today)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 8);
  return `
    <section class="event-list">
      <h3>다가올 이벤트</h3>
      ${events.length ? events.map((note) => `
        <button class="event ghost" type="button" data-action="select-day" data-date="${note.id}">
          <span class="event-date">${displayDate(note.id)}</span>
          <span><strong>${escapeHtml(note.title || "일정")}</strong><br><span class="muted">${escapeHtml(note.text || "")}</span></span>
        </button>
      `).join("") : `<p class="muted">다가올 일정이 없습니다.</p>`}
    </section>
  `;
}

function renderPrintSheet() {
  const todayKey = dateKey(new Date());
  printRoot.innerHTML = `
    <section class="print-sheet">
      <div class="print-title">
        <div>WEDDING CALENDAR</div>
        <div>${escapeHtml(state.wedding?.weddingDate?.slice(0, 4) || new Date().getFullYear())}년</div>
      </div>
      <div style="text-align:right;font-size:10px;margin-top:-5mm;margin-bottom:5mm;">
        담당플래너: ${escapeHtml(state.wedding?.plannerName || "")}
      </div>
      <div class="print-grid">
        ${monthsFromToday().map((month) => {
          const cells = getMonthCells(month);
          const notes = [...state.dayNotes.values()].filter((note) => note.id.startsWith(monthKey(month))).slice(0, 5);
          return `
            <article class="print-month">
              <h3>${month.getMonth() + 1}</h3>
              <div class="print-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
              <div class="print-days">
                ${cells.map((date) => {
                  if (!date) return `<span class="print-day"></span>`;
                  const key = dateKey(date);
                  const classes = ["print-day"];
                  if (key === todayKey) classes.push("today");
                  if (state.dayNotes.has(key)) classes.push("has-note");
                  return `<span class="${classes.join(" ")}">${date.getDate()}</span>`;
                }).join("")}
              </div>
              <div class="print-lines">
                ${Array.from({ length: 5 }, (_, index) => `<div class="print-line">${escapeHtml(notes[index]?.title || "")}</div>`).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function render() {
  if (state.loading) {
    appRoot.innerHTML = `<section class="login"><div class="login-panel"><p class="muted">불러오는 중...</p></div></section>`;
    return;
  }
  if (!state.authUser) {
    renderLogin();
    return;
  }
  if (!state.profile) {
    renderSetup();
    return;
  }
  renderApp();
}

function generatePassword() {
  return `wed${Math.random().toString(36).slice(2, 8)}!`;
}

async function handleLogin(form) {
  state.error = "";
  const formData = new FormData(form);
  const loginId = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (loginLocalUser(loginId, password)) return;
  if (!firebaseReady) {
    showError("아이디 또는 비밀번호를 확인하세요. 최초 로그인은 admin / admin 입니다.");
    return;
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, loginId, password);
    state.loading = true;
    render();
    await loadProfile(credential.user);
  } catch (error) {
    showError(error.message);
  }
}

async function handleSetup(form) {
  const data = Object.fromEntries(new FormData(form));
  if (state.localMode) {
    const store = getLocalStore();
    store.weddings[state.profile.weddingId] = {
      id: state.profile.weddingId,
      groomName: data.groomName,
      brideName: data.brideName,
      weddingDate: data.weddingDate,
      plannerName: data.plannerName,
      plannerUid: state.authUser.uid
    };
    store.users[state.authUser.uid] = {
      ...store.users[state.authUser.uid],
      displayName: data.plannerName
    };
    store.members[state.profile.weddingId][state.authUser.uid] = {
      role: "planner",
      displayName: data.plannerName,
      email: state.authUser.email
    };
    saveLocalStore(store);
    setLocalState(state.authUser.uid);
    render();
    return;
  }
  const weddingId = crypto.randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, "weddings", weddingId), {
    groomName: data.groomName,
    brideName: data.brideName,
    weddingDate: data.weddingDate,
    plannerName: data.plannerName,
    plannerUid: state.authUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", state.authUser.uid), {
    weddingId,
    role: "planner",
    displayName: data.plannerName,
    email: state.authUser.email,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, "weddings", weddingId, "members", state.authUser.uid), {
    role: "planner",
    displayName: data.plannerName,
    email: state.authUser.email,
    createdAt: serverTimestamp()
  });
  await batch.commit();
  await loadProfile(state.authUser);
}

async function handleSaveWedding(form) {
  const data = Object.fromEntries(new FormData(form));
  if (state.localMode) {
    const store = getLocalStore();
    store.weddings[state.profile.weddingId] = {
      ...store.weddings[state.profile.weddingId],
      groomName: data.groomName,
      brideName: data.brideName,
      weddingDate: data.weddingDate,
      plannerName: data.plannerName
    };
    const planner = store.users[state.wedding.plannerUid || localAdminId];
    if (planner) planner.displayName = data.plannerName || planner.displayName;
    saveLocalStore(store);
    setLocalState(state.authUser.uid);
    render();
    return;
  }
  await updateDoc(doc(db, "weddings", state.profile.weddingId), {
    groomName: data.groomName,
    brideName: data.brideName,
    weddingDate: data.weddingDate,
    plannerName: data.plannerName,
    updatedAt: serverTimestamp()
  });
}

async function handleCreateAccount(form) {
  const data = Object.fromEntries(new FormData(form));
  if (state.localMode) {
    const loginId = String(data.email || "").trim();
    const store = getLocalStore();
    const duplicate = Object.values(store.users).some((user) => user.loginId === loginId || user.email === loginId);
    if (duplicate) throw new Error("이미 사용 중인 로그인 아이디입니다.");
    const userId = `local-${crypto.randomUUID()}`;
    store.users[userId] = {
      id: userId,
      loginId,
      password: data.password,
      weddingId: state.profile.weddingId,
      role: data.role,
      displayName: data.displayName,
      email: loginId
    };
    store.members[state.profile.weddingId] = {
      ...(store.members[state.profile.weddingId] || {}),
      [userId]: {
        role: data.role,
        displayName: data.displayName,
        email: loginId
      }
    };
    saveLocalStore(store);
    setLocalState(state.authUser.uid);
    alert(`${roleLabels[data.role]} 계정이 발급되었습니다.\n아이디: ${loginId}\n임시 비밀번호: ${data.password}`);
    form.reset();
    form.querySelector('[name="password"]').value = generatePassword();
    render();
    return;
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      returnSecureToken: false
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "계정 발급에 실패했습니다.");

  const batch = writeBatch(db);
  batch.set(doc(db, "users", payload.localId), {
    weddingId: state.profile.weddingId,
    role: data.role,
    displayName: data.displayName,
    email: data.email,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, "weddings", state.profile.weddingId, "members", payload.localId), {
    role: data.role,
    displayName: data.displayName,
    email: data.email,
    createdAt: serverTimestamp()
  });
  await batch.commit();
  alert(`${roleLabels[data.role]} 계정이 발급되었습니다.\n이메일: ${data.email}\n임시 비밀번호: ${data.password}`);
  form.reset();
  form.querySelector('[name="password"]').value = generatePassword();
}

async function handleSaveDay(form) {
  const data = Object.fromEntries(new FormData(form));
  if (state.localMode) {
    const store = getLocalStore();
    store.dayNotes[state.profile.weddingId] = {
      ...(store.dayNotes[state.profile.weddingId] || {}),
      [state.selectedDate]: {
        title: data.title,
        text: data.text,
        date: state.selectedDate,
        updatedBy: state.authUser.uid
      }
    };
    saveLocalStore(store);
    state.selectedDate = null;
    setLocalState(state.authUser.uid);
    render();
    return;
  }
  const ref = doc(db, "weddings", state.profile.weddingId, "dayNotes", state.selectedDate);
  await setDoc(ref, {
    title: data.title,
    text: data.text,
    date: state.selectedDate,
    updatedAt: serverTimestamp(),
    updatedBy: state.authUser.uid
  }, { merge: true });
  state.selectedDate = null;
  render();
}

async function handleDeleteDay() {
  if (state.localMode) {
    const store = getLocalStore();
    delete store.dayNotes[state.profile.weddingId]?.[state.selectedDate];
    saveLocalStore(store);
    state.selectedDate = null;
    setLocalState(state.authUser.uid);
    render();
    return;
  }
  await deleteDoc(doc(db, "weddings", state.profile.weddingId, "dayNotes", state.selectedDate));
  state.selectedDate = null;
  render();
}

let weekTimer;
function queueWeekSave(textarea) {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(async () => {
    const key = textarea.dataset.week;
    if (state.localMode) {
      const store = getLocalStore();
      store.weekNotes[state.profile.weddingId] = {
        ...(store.weekNotes[state.profile.weddingId] || {}),
        [key]: {
          text: textarea.value,
          weekStart: key,
          updatedBy: state.authUser.uid
        }
      };
      saveLocalStore(store);
      state.weekNotes.set(key, {
        id: key,
        text: textarea.value,
        weekStart: key,
        updatedBy: state.authUser.uid
      });
      return;
    }
    await setDoc(doc(db, "weddings", state.profile.weddingId, "weekNotes", key), {
      text: textarea.value,
      weekStart: key,
      updatedAt: serverTimestamp(),
      updatedBy: state.authUser.uid
    }, { merge: true });
  }, 500);
}

function buildPosterSvg() {
  const width = 1200;
  const height = 1700;
  const margin = 54;
  const colWidth = 342;
  const rowHeight = 300;
  const todayKey = dateKey(new Date());
  const months = monthsFromToday();
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="100%" height="100%" fill="#fffdf8"/>`;
  svg += `<text x="${margin}" y="58" font-size="34" font-weight="800" font-family="Arial, sans-serif" fill="#22201d">WEDDING CALENDAR</text>`;
  svg += `<text x="${width - margin}" y="58" text-anchor="end" font-size="30" font-weight="800" font-family="Arial, sans-serif" fill="#22201d">${escapeHtml(state.wedding?.weddingDate?.slice(0, 4) || new Date().getFullYear())}년</text>`;
  svg += `<text x="${width - margin}" y="102" text-anchor="end" font-size="18" font-family="Arial, sans-serif" fill="#22201d">담당플래너: ${escapeHtml(state.wedding?.plannerName || "")}</text>`;
  svg += `<line x1="${margin}" y1="116" x2="${width - margin}" y2="116" stroke="#c8bfb3"/>`;

  months.forEach((month, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (colWidth + 33);
    const y = 155 + row * rowHeight;
    svg += `<text x="${x}" y="${y}" font-size="26" font-weight="800" font-family="Arial, sans-serif" fill="#22201d">${month.getMonth() + 1}</text>`;
    weekdays.forEach((day, dayIndex) => {
      svg += `<text x="${x + 34 + dayIndex * 27}" y="${y}" text-anchor="middle" font-size="12" font-weight="800" font-family="Arial, sans-serif" fill="#22201d">${day}</text>`;
    });
    getMonthCells(month).forEach((date, cellIndex) => {
      if (!date) return;
      const cx = x + 34 + (cellIndex % 7) * 27;
      const cy = y + 28 + Math.floor(cellIndex / 7) * 26;
      const key = dateKey(date);
      if (key === todayKey) {
        svg += `<circle cx="${cx}" cy="${cy - 4}" r="12" fill="#b83e4b"/>`;
      }
      svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" font-weight="${state.dayNotes.has(key) ? "800" : "500"}" font-family="Arial, sans-serif" fill="${key === todayKey ? "#ffffff" : state.dayNotes.has(key) ? "#0f8b8d" : "#22201d"}">${date.getDate()}</text>`;
    });
    const notes = [...state.dayNotes.values()].filter((note) => note.id.startsWith(monthKey(month))).slice(0, 5);
    for (let i = 0; i < 5; i += 1) {
      const ly = y + 46 + i * 36;
      svg += `<line x1="${x + 158}" y1="${ly}" x2="${x + colWidth}" y2="${ly}" stroke="#aaa" stroke-dasharray="2 4"/>`;
      if (notes[i]) {
        svg += `<text x="${x + colWidth - 4}" y="${ly - 5}" text-anchor="end" font-size="25" font-family="Arial, sans-serif" fill="#22201d">${escapeHtml(notes[i].title || "")}</text>`;
      }
    }
  });
  svg += `</svg>`;
  return svg;
}

async function downloadPng() {
  const svg = buildPosterSvg();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1700;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = `wedding-calendar-${dateKey(new Date())}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = url;
}

async function handleLogout() {
  if (state.localMode) {
    logoutLocalUser();
    return;
  }
  if (auth) await signOut(auth);
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  try {
    const action = form.dataset.action;
    if (action === "login") await handleLogin(form);
    if (action === "setup") await handleSetup(form);
    if (action === "save-wedding") await handleSaveWedding(form);
    if (action === "create-account") await handleCreateAccount(form);
    if (action === "save-day") await handleSaveDay(form);
  } catch (error) {
    showError(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "logout") {
    await handleLogout();
  }
  if (action === "select-day") {
    state.selectedDate = target.dataset.date;
    render();
  }
  if (action === "close-editor") {
    state.selectedDate = null;
    render();
  }
  if (action === "delete-day") {
    await handleDeleteDay();
  }
  if (action === "regen-password") {
    target.closest("form").querySelector('[name="password"]').value = generatePassword();
  }
  if (action === "print") {
    renderPrintSheet();
    window.print();
  }
  if (action === "png") {
    await downloadPng();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target?.dataset?.action === "week-note" && plannerMode()) {
    queueWeekSave(target);
  }
});

const localSession = localStorage.getItem(localSessionKey);
if (localSession && setLocalState(localSession)) {
  render();
} else if (!firebaseReady) {
  if (localSession) localStorage.removeItem(localSessionKey);
  state.loading = false;
  render();
} else {
  if (localSession) localStorage.removeItem(localSessionKey);
  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    state.authUser = user;
    state.profile = null;
    state.wedding = null;
    state.loading = false;
    state.error = "";
    if (user) {
      state.loading = true;
      render();
      await loadProfile(user);
    } else {
      render();
    }
  });
}
