const appRoot = document.querySelector("#app");
const printRoot = document.querySelector("#print-root");

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const roleLabels = { planner: "플래너", groom: "신랑", bride: "신부" };
const storeKey = "weddingPlanner.store";
const sessionKey = "weddingPlanner.session";
const weddingId = "wedding";
const adminId = "admin";

let state = {
  authUser: null,
  profile: null,
  wedding: null,
  members: [],
  dayNotes: new Map(),
  weekNotes: new Map(),
  selectedDate: null,
  loading: false,
  error: ""
};

let weekTimer;

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

function displayDate(key) {
  const date = parseDate(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return dateKey(start);
}

function defaultWeddingDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return dateKey(date);
}

function defaultStore() {
  return {
    users: {
      [adminId]: {
        id: adminId,
        loginId: "admin",
        password: "admin",
        weddingId,
        role: "planner",
        displayName: "관리자"
      }
    },
    weddings: {
      [weddingId]: {
        id: weddingId,
        groomName: "신랑",
        brideName: "신부",
        weddingDate: defaultWeddingDate(),
        plannerName: "관리자",
        plannerUid: adminId
      }
    },
    members: {
      [weddingId]: {
        [adminId]: {
          role: "planner",
          displayName: "관리자",
          loginId: "admin"
        }
      }
    },
    dayNotes: {
      [weddingId]: {}
    },
    weekNotes: {
      [weddingId]: {}
    }
  };
}

function readStore() {
  const fallback = defaultStore();
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
    return {
      ...fallback,
      ...saved,
      users: { ...fallback.users, ...(saved.users || {}) },
      weddings: { ...fallback.weddings, ...(saved.weddings || {}) },
      members: { ...fallback.members, ...(saved.members || {}) },
      dayNotes: { ...fallback.dayNotes, ...(saved.dayNotes || {}) },
      weekNotes: { ...fallback.weekNotes, ...(saved.weekNotes || {}) }
    };
  } catch {
    return fallback;
  }
}

function writeStore(store) {
  localStorage.setItem(storeKey, JSON.stringify(store));
}

function setSession(userId) {
  const store = readStore();
  const user = store.users[userId];
  if (!user) return false;
  const currentWeddingId = user.weddingId || weddingId;

  state.authUser = { uid: user.id, loginId: user.loginId };
  state.profile = { ...user };
  state.wedding = { id: currentWeddingId, ...store.weddings[currentWeddingId] };
  state.members = Object.entries(store.members[currentWeddingId] || {}).map(([id, member]) => ({ id, ...member }));
  state.dayNotes = new Map(Object.entries(store.dayNotes[currentWeddingId] || {}).map(([id, note]) => [id, { id, ...note }]));
  state.weekNotes = new Map(Object.entries(store.weekNotes[currentWeddingId] || {}).map(([id, note]) => [id, { id, ...note }]));
  state.loading = false;
  state.error = "";
  return true;
}

function loginUser(loginId, password) {
  const normalizedLogin = String(loginId || "").trim();
  const store = readStore();
  const user = Object.values(store.users).find((item) => item.loginId === normalizedLogin && item.password === password);
  if (!user) return false;
  localStorage.setItem(sessionKey, user.id);
  setSession(user.id);
  render();
  return true;
}

function logoutUser() {
  localStorage.removeItem(sessionKey);
  state = {
    authUser: null,
    profile: null,
    wedding: null,
    members: [],
    dayNotes: new Map(),
    weekNotes: new Map(),
    selectedDate: null,
    loading: false,
    error: ""
  };
  render();
}

function plannerMode() {
  return state.profile?.role === "planner";
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

function showError(message) {
  state.error = message;
  render();
}

function renderLogin() {
  appRoot.innerHTML = `
    <section class="login">
      <form class="login-panel" data-action="login">
        <div class="brand">
          <div class="eyebrow">Wedding Calendar</div>
          <h1>결혼 준비 일정을 한 장으로 관리</h1>
          <p class="muted">플래너 계정으로 신랑/신부 계정을 발급하고, 모바일 달력과 인쇄용 연간표로 확인합니다.</p>
        </div>
        <p class="muted">최초 관리자 로그인: <strong>admin / admin</strong></p>
        <label>아이디<input name="loginId" type="text" autocomplete="username" required /></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required /></label>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <button type="submit">로그인</button>
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
        <label>로그인 아이디<input name="loginId" type="text" required /></label>
        <div class="form-grid two">
          <label>임시 비밀번호<input name="password" minlength="1" value="${generatePassword()}" required /></label>
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
  renderApp();
}

function generatePassword() {
  return `wed${Math.random().toString(36).slice(2, 8)}!`;
}

async function handleLogin(form) {
  state.error = "";
  const formData = new FormData(form);
  const loginId = formData.get("loginId");
  const password = formData.get("password");
  if (!loginUser(loginId, password)) {
    showError("아이디 또는 비밀번호를 확인하세요. 최초 로그인은 admin / admin 입니다.");
  }
}

function handleSaveWedding(form) {
  const data = Object.fromEntries(new FormData(form));
  const store = readStore();
  store.weddings[state.profile.weddingId] = {
    ...store.weddings[state.profile.weddingId],
    groomName: data.groomName,
    brideName: data.brideName,
    weddingDate: data.weddingDate,
    plannerName: data.plannerName
  };
  store.users[state.wedding.plannerUid || adminId].displayName = data.plannerName || "관리자";
  store.members[state.profile.weddingId][state.wedding.plannerUid || adminId].displayName = data.plannerName || "관리자";
  writeStore(store);
  setSession(state.authUser.uid);
  render();
}

function handleCreateAccount(form) {
  const data = Object.fromEntries(new FormData(form));
  const loginId = String(data.loginId || "").trim();
  const store = readStore();
  const duplicate = Object.values(store.users).some((user) => user.loginId === loginId);
  if (duplicate) throw new Error("이미 사용 중인 로그인 아이디입니다.");

  const userId = `user-${crypto.randomUUID()}`;
  store.users[userId] = {
    id: userId,
    loginId,
    password: data.password,
    weddingId: state.profile.weddingId,
    role: data.role,
    displayName: data.displayName
  };
  store.members[state.profile.weddingId] = {
    ...(store.members[state.profile.weddingId] || {}),
    [userId]: {
      role: data.role,
      displayName: data.displayName,
      loginId
    }
  };
  writeStore(store);
  setSession(state.authUser.uid);
  alert(`${roleLabels[data.role]} 계정이 발급되었습니다.\n아이디: ${loginId}\n임시 비밀번호: ${data.password}`);
  form.reset();
  form.querySelector('[name="password"]').value = generatePassword();
  render();
}

function handleSaveDay(form) {
  const data = Object.fromEntries(new FormData(form));
  const store = readStore();
  store.dayNotes[state.profile.weddingId] = {
    ...(store.dayNotes[state.profile.weddingId] || {}),
    [state.selectedDate]: {
      title: data.title,
      text: data.text,
      date: state.selectedDate,
      updatedBy: state.authUser.uid
    }
  };
  writeStore(store);
  state.selectedDate = null;
  setSession(state.authUser.uid);
  render();
}

function handleDeleteDay() {
  const store = readStore();
  delete store.dayNotes[state.profile.weddingId]?.[state.selectedDate];
  writeStore(store);
  state.selectedDate = null;
  setSession(state.authUser.uid);
  render();
}

function queueWeekSave(textarea) {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(() => {
    const key = textarea.dataset.week;
    const store = readStore();
    store.weekNotes[state.profile.weddingId] = {
      ...(store.weekNotes[state.profile.weddingId] || {}),
      [key]: {
        text: textarea.value,
        weekStart: key,
        updatedBy: state.authUser.uid
      }
    };
    writeStore(store);
    state.weekNotes.set(key, {
      id: key,
      text: textarea.value,
      weekStart: key,
      updatedBy: state.authUser.uid
    });
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

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  try {
    const action = form.dataset.action;
    if (action === "login") await handleLogin(form);
    if (action === "save-wedding") handleSaveWedding(form);
    if (action === "create-account") handleCreateAccount(form);
    if (action === "save-day") handleSaveDay(form);
  } catch (error) {
    showError(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "logout") logoutUser();
  if (action === "select-day") {
    state.selectedDate = target.dataset.date;
    render();
  }
  if (action === "close-editor") {
    state.selectedDate = null;
    render();
  }
  if (action === "delete-day") handleDeleteDay();
  if (action === "regen-password") {
    target.closest("form").querySelector('[name="password"]').value = generatePassword();
  }
  if (action === "print") {
    renderPrintSheet();
    window.print();
  }
  if (action === "png") await downloadPng();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target?.dataset?.action === "week-note" && plannerMode()) {
    queueWeekSave(target);
  }
});

const savedSession = localStorage.getItem(sessionKey);
if (savedSession && setSession(savedSession)) {
  render();
} else {
  if (savedSession) localStorage.removeItem(sessionKey);
  render();
}
