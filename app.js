import { createSignupClient, loginEmail, supabase } from "./supabase-client.js";

const appRoot = document.querySelector("#app");
const printRoot = document.querySelector("#print-root");

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const roleLabels = { planner: "플래너", groom: "신랑", bride: "신부" };
const photoBucket = "vendor-media";
const vendorStatuses = ["관심", "상담 예정", "견적 받음", "비교 중", "계약 완료", "보류"];

function freshState() {
  return {
    authUser: null,
    profile: null,
    wedding: null,
    members: [],
    dayNotes: new Map(),
    weekNotes: new Map(),
    categories: [],
    vendors: [],
    photoUrls: new Map(),
    photoRecords: new Map(),
    activeView: "calendar",
    selectedCategory: "all",
    vendorQuery: "",
    selectedDate: null,
    selectedVendorId: null,
    selectedVendorPhotoIndex: 0,
    vendorDetailTab: "overview",
    editingVendorId: null,
    categoryManagerOpen: false,
    issuedAccount: null,
    presentationVendorId: null,
    presentationPhotoIndex: 0,
    pendingPhotoUrls: [],
    loading: false,
    error: ""
  };
}

let state = freshState();
let weekTimer;

function icon(name, className = "") {
  return `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
}

function activateIcons() {
  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#657b74";
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function textLines(value) {
  return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function displayDate(key) {
  const date = parseDate(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateLong(key) {
  const date = parseDate(key);
  if (Number.isNaN(date.getTime())) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
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

function defaultCategories() {
  return [
    { id: "dress", name: "드레스", color: "#c75a6a", icon: "sparkles" },
    { id: "venue", name: "웨딩홀", color: "#39756c", icon: "building-2" },
    { id: "jewelry", name: "예물", color: "#a67b33", icon: "gem" },
    { id: "studio", name: "스튜디오", color: "#5f7094", icon: "camera" },
    { id: "makeup", name: "메이크업", color: "#a76578", icon: "wand-sparkles" },
    { id: "honeymoon", name: "허니문", color: "#3c7f93", icon: "plane" },
    { id: "other", name: "기타", color: "#6f716c", icon: "folder", locked: true }
  ];
}

function defaultVendors() {
  const now = new Date().toISOString();
  return {
    "sample-dress": {
      id: "sample-dress",
      name: "아뜰리에 르블랑 (샘플)",
      categoryId: "dress",
      status: "비교 중",
      price: "본식 280만원부터",
      description: "미카도 실크와 절제된 실루엣 중심의 드레스샵. 상담 때 실제 사진으로 교체해 사용하세요.",
      contact: "02-0000-0000",
      address: "서울 강남구 청담동",
      instagram: "@atelier_sample",
      website: "",
      contractTerms: "피팅 3벌 · 계약금 30% · 일정 변경은 30일 전 협의",
      packages: [
        { name: "본식 스탠다드", price: "280만원", details: "본식 드레스 2벌\n피팅 3벌\n기본 베일·액세서리 포함" },
        { name: "촬영 + 본식", price: "420만원", details: "촬영 드레스 3벌\n본식 드레스 2벌\n촬영 액세서리 포함" }
      ],
      extraFees: [
        { name: "드레스 추가", price: "1벌 22만원" },
        { name: "지정비", price: "담당자별 별도" }
      ],
      discountBenefits: "촬영과 본식을 함께 계약하면 본식 비용 20만원 할인",
      promotionPeriod: "상시 협의",
      updatedAtLabel: "2026-06-04",
      scheduleInfo: "피팅은 예약제로 운영하며 주말 상담은 조기 마감될 수 있습니다.",
      reservationPolicy: "계약금 30% 입금 순으로 일정이 확정됩니다.",
      operationPolicy: "일정 변경과 취소는 계약서 기준으로 처리합니다.",
      requiredMeeting: true,
      commissionRate: "15%",
      commissionTerms: "본식 완료 후 익월 정산 · 추가 판매 항목 제외",
      sourceMemo: "업체 공지, 통화 내용, 카카오톡 안내를 확인해 최신 정보로 갱신",
      plannerNotes: "샘플 데이터입니다. 편집하거나 삭제해도 됩니다.",
      tags: ["실크", "미니멀", "본식"],
      photoIds: [],
      favorite: true,
      sample: true,
      createdAt: now,
      updatedAt: now
    },
    "sample-venue": {
      id: "sample-venue",
      name: "라움 가든홀 (샘플)",
      categoryId: "venue",
      status: "견적 받음",
      price: "식대 8.9만원 · 대관 650만원",
      description: "채광이 좋은 단독홀. 보증 인원과 꽃장식 조건을 함께 비교하기 좋습니다.",
      contact: "02-0000-1000",
      address: "서울 서초구 반포동",
      instagram: "@raum_sample",
      website: "",
      contractTerms: "보증 250명 · 계약금 200만원 · 외부 생화 반입 협의",
      packages: [
        { name: "토요일 점심", price: "식대 8.9만원 · 대관 650만원", details: "보증 인원 250명\n단독홀 90분\n기본 꽃장식 포함" },
        { name: "일요일 저녁", price: "식대 8.2만원 · 대관 500만원", details: "보증 인원 200명\n단독홀 90분" }
      ],
      extraFees: [{ name: "생화 업그레이드", price: "구성별 별도 견적" }],
      discountBenefits: "비수기·잔여 타임 프로모션 별도 확인",
      promotionPeriod: "잔여 타임 한정",
      updatedAtLabel: "2026-06-04",
      scheduleInfo: "예식 간격 90분 · 오전/오후 타임별 보증 인원 상이",
      reservationPolicy: "예약금 200만원 입금 후 확정 · 가예약 불가",
      operationPolicy: "최소 보증 인원과 식대는 예식 30일 전 최종 확정",
      requiredMeeting: true,
      commissionRate: "협의",
      commissionTerms: "예식 완료 기준 정산",
      sourceMemo: "최종 견적서와 통화 기록 기준",
      plannerNotes: "주차 500대, 혼주 대기실 동선 확인 필요.",
      tags: ["단독홀", "채광", "250명"],
      photoIds: [],
      favorite: false,
      sample: true,
      createdAt: now,
      updatedAt: now
    },
    "sample-jewelry": {
      id: "sample-jewelry",
      name: "오르빛 주얼리 (샘플)",
      categoryId: "jewelry",
      status: "관심",
      price: "커플링 220만원부터",
      description: "다이아몬드와 커스텀 밴드 비교용 샘플 업체입니다.",
      contact: "02-0000-2000",
      address: "서울 종로구 봉익동",
      instagram: "@orbit_sample",
      website: "",
      contractTerms: "계약금 20% · 제작 5주 · 1회 사이즈 조정 포함",
      packages: [{ name: "커스텀 커플링", price: "220만원부터", details: "커스텀 밴드 2개\n각인 1회\n사이즈 조정 1회" }],
      extraFees: [{ name: "다이아 업그레이드", price: "등급별 별도" }],
      discountBenefits: "평일 상담 계약 혜택 별도",
      promotionPeriod: "월별 공지",
      updatedAtLabel: "2026-06-04",
      scheduleInfo: "제작 기간 평균 5주",
      reservationPolicy: "계약금 20% 결제 후 제작 시작",
      operationPolicy: "제작 시작 후 디자인 변경 비용 발생",
      requiredMeeting: false,
      commissionRate: "협의",
      commissionTerms: "출고 완료 기준 정산",
      sourceMemo: "업체 가격표 및 상담 기록",
      plannerNotes: "평일 예약 시 상담 여유 있음.",
      tags: ["커스텀", "다이아", "종로"],
      photoIds: [],
      favorite: false,
      sample: true,
      createdAt: now,
      updatedAt: now
    }
  };
}

function revokePhotoUrls() {
  state.photoUrls.clear();
  state.photoRecords.clear();
}

function throwIfError(result) {
  if (result.error) throw new Error(result.error.message || "데이터를 처리하지 못했습니다.");
  return result.data;
}

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

function authPassword(loginId, password) {
  return loginId === "admin" && password === "admin" ? "admin!" : password;
}

function categoryRow(category, currentWeddingId, index = 0) {
  return {
    wedding_id: currentWeddingId,
    id: category.id,
    name: category.name,
    color: safeColor(category.color),
    icon: category.icon || "folder",
    locked: Boolean(category.locked),
    sort_order: index
  };
}

function vendorRow(vendor, currentWeddingId) {
  const {
    id,
    name,
    categoryId,
    status,
    favorite,
    photoIds,
    createdAt,
    updatedAt,
    ...data
  } = vendor;
  return {
    wedding_id: currentWeddingId,
    id,
    category_id: categoryId,
    name,
    status: status || "관심",
    favorite: Boolean(favorite),
    data,
    created_at: createdAt || new Date().toISOString(),
    updated_at: updatedAt || new Date().toISOString()
  };
}

function vendorFromRow(row, photoIds = []) {
  return {
    ...(row.data || {}),
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    status: row.status,
    favorite: row.favorite,
    photoIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function seedDefaultContent(currentWeddingId, categories, vendors) {
  let seededCategories = categories;
  let seededVendors = vendors;
  const firstSetup = !seededCategories.length;
  if (!seededCategories.length) {
    const rows = defaultCategories().map((category, index) => categoryRow(category, currentWeddingId, index));
    throwIfError(await supabase.from("vendor_categories").insert(rows));
    seededCategories = rows;
  }
  if (firstSetup && !seededVendors.length) {
    const rows = Object.values(defaultVendors()).map((vendor) => vendorRow(vendor, currentWeddingId));
    throwIfError(await supabase.from("vendors").insert(rows));
    seededVendors = rows;
  }
  return { categories: seededCategories, vendors: seededVendors };
}

async function hydrateRemoteState(user) {
  const profileResult = await supabase
    .from("profiles")
    .select("id,wedding_id,login_id,role,display_name")
    .eq("id", user.id)
    .single();
  if (profileResult.error?.code === "PGRST116") throw new Error("LOGIN_REVOKED");
  const profile = throwIfError(profileResult);
  const currentWeddingId = profile.wedding_id;
  const [weddingResult, membersResult, dayResult, weekResult, categoryResult, vendorResult, photoResult] = await Promise.all([
    supabase.from("weddings").select("id,groom_name,bride_name,wedding_date,planner_name").eq("id", currentWeddingId).single(),
    supabase.from("profiles").select("id,login_id,role,display_name").eq("wedding_id", currentWeddingId).order("created_at"),
    supabase.from("day_notes").select("note_date,title,body,updated_by,updated_at").eq("wedding_id", currentWeddingId),
    supabase.from("week_notes").select("week_start,body,updated_by,updated_at").eq("wedding_id", currentWeddingId),
    supabase.from("vendor_categories").select("id,name,color,icon,locked,sort_order").eq("wedding_id", currentWeddingId).order("sort_order"),
    supabase.from("vendors").select("id,category_id,name,status,favorite,data,created_at,updated_at").eq("wedding_id", currentWeddingId).order("updated_at", { ascending: false }),
    supabase.from("vendor_photos").select("id,vendor_id,storage_path,file_name,sort_order,created_at").eq("wedding_id", currentWeddingId).order("sort_order")
  ]);
  const wedding = throwIfError(weddingResult);
  const members = throwIfError(membersResult) || [];
  const dayNotes = throwIfError(dayResult) || [];
  const weekNotes = throwIfError(weekResult) || [];
  let categories = throwIfError(categoryResult) || [];
  let vendors = throwIfError(vendorResult) || [];
  const photos = throwIfError(photoResult) || [];

  if (profile.role === "planner" && !categories.length) {
    ({ categories, vendors } = await seedDefaultContent(currentWeddingId, categories, vendors));
  }

  const photosByVendor = new Map();
  photos.forEach((photo) => {
    const list = photosByVendor.get(photo.vendor_id) || [];
    list.push(photo.id);
    photosByVendor.set(photo.vendor_id, list);
  });

  revokePhotoUrls();
  photos.forEach((photo) => state.photoRecords.set(photo.id, {
    id: photo.id,
    weddingId: currentWeddingId,
    vendorId: photo.vendor_id,
    storagePath: photo.storage_path,
    name: photo.file_name,
    sortOrder: photo.sort_order,
    createdAt: photo.created_at
  }));
  if (photos.length) {
    const signed = throwIfError(await supabase.storage.from(photoBucket).createSignedUrls(
      photos.map((photo) => photo.storage_path),
      60 * 60 * 6
    )) || [];
    signed.forEach((item, index) => {
      if (item.signedUrl) state.photoUrls.set(photos[index].id, item.signedUrl);
    });
  }

  state.authUser = { uid: user.id, loginId: profile.login_id };
  state.profile = {
    uid: user.id,
    loginId: profile.login_id,
    weddingId: currentWeddingId,
    role: profile.role,
    displayName: profile.display_name
  };
  state.wedding = {
    id: wedding.id,
    groomName: wedding.groom_name,
    brideName: wedding.bride_name,
    weddingDate: wedding.wedding_date,
    plannerName: wedding.planner_name
  };
  state.members = members.map((member) => ({
    id: member.id,
    loginId: member.login_id,
    role: member.role,
    displayName: member.display_name
  }));
  state.dayNotes = new Map(dayNotes.map((note) => [note.note_date, {
    id: note.note_date,
    date: note.note_date,
    title: note.title,
    text: note.body,
    updatedBy: note.updated_by,
    updatedAt: note.updated_at
  }]));
  state.weekNotes = new Map(weekNotes.map((note) => [note.week_start, {
    id: note.week_start,
    weekStart: note.week_start,
    text: note.body,
    updatedBy: note.updated_by,
    updatedAt: note.updated_at
  }]));
  state.categories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    locked: category.locked
  }));
  state.vendors = vendors.map((vendor) => vendorFromRow(vendor, photosByVendor.get(vendor.id) || []));
  state.loading = false;
  state.error = "";
}

async function loginUser(loginId, password) {
  const normalizedLogin = normalizeLoginId(loginId);
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalizedLogin)) return false;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail(normalizedLogin),
    password: authPassword(normalizedLogin, String(password || ""))
  });
  if (error) return false;
  state.loading = true;
  render();
  try {
    await hydrateRemoteState(data.user);
    render();
  } catch (loadError) {
    await supabase.auth.signOut();
    state = freshState();
    throw loadError;
  }
  return true;
}

async function logoutUser() {
  await supabase.auth.signOut();
  revokePhotoUrls();
  clearPendingPhotoUrls();
  state = freshState();
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

function calendarYearLabel() {
  const months = monthsFromToday();
  const firstYear = months[0].getFullYear();
  const lastYear = months.at(-1).getFullYear();
  return firstYear === lastYear ? `${firstYear}년` : `${firstYear}-${lastYear}`;
}

function getMonthCells(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getMonthRows(monthDate) {
  const cells = getMonthCells(monthDate);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const days = cells.slice(i, i + 7);
    const realDays = days.filter(Boolean);
    if (realDays.length) rows.push({ key: weekKey(realDays[0]), days });
  }
  return rows;
}

function daysToWedding() {
  const target = parseDate(state.wedding?.weddingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return "날짜 미정";
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function categoryFor(id) {
  return state.categories.find((category) => category.id === id) || { id: "other", name: "기타", color: "#6f716c", icon: "folder" };
}

function vendorFor(id) {
  return state.vendors.find((vendor) => vendor.id === id);
}

function notify(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `${icon("check-circle-2")}<span>${escapeHtml(message)}</span>`;
  document.body.append(toast);
  activateIcons();
  setTimeout(() => toast.remove(), 2600);
}

function renderLogin() {
  appRoot.innerHTML = `
    <section class="login-page">
      <div class="login-visual" aria-hidden="true">
        <img src="./assets/calendar-reference.jpg" alt="" />
        <div class="login-visual-label">
          <span>Marryday</span>
          <strong>Wedding planner archive</strong>
        </div>
      </div>
      <form class="login-panel" data-action="login">
        <div class="login-brand">
          <span class="brand-mark">M</span>
          <div>
            <div class="eyebrow">Marryday Planner</div>
            <h1>결혼 준비의 모든 장면</h1>
          </div>
        </div>
        <div class="login-fields">
          <label>아이디<input name="loginId" type="text" autocomplete="username" placeholder="아이디" required /></label>
          <label>비밀번호<input name="password" type="password" autocomplete="current-password" placeholder="비밀번호" required /></label>
        </div>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <button class="primary wide" type="submit">로그인</button>
        <div class="login-foot">
          <span>${icon("cloud-check")} 클라우드 동기화</span>
          <span>최초 계정 <strong>admin / admin</strong></span>
        </div>
      </form>
    </section>
  `;
}

function renderApp() {
  if (!plannerMode()) state.activeView = "calendar";
  const names = `${state.wedding?.groomName || "신랑"} · ${state.wedding?.brideName || "신부"}`;
  const view = state.activeView === "vendors"
    ? renderVendorView()
    : state.activeView === "manage"
      ? renderManageView()
      : renderCalendarView();

  appRoot.innerHTML = `
    <section class="app-shell">
      <header class="app-topbar">
        <button class="brand-button" type="button" data-action="navigate" data-view="calendar" aria-label="캘린더로 이동">
          <span class="brand-mark small">M</span>
          <span><strong>${escapeHtml(names)}</strong><small>${escapeHtml(formatDateLong(state.wedding?.weddingDate))}</small></span>
        </button>
        <div class="topbar-meta">
          <span class="dday">${escapeHtml(daysToWedding())}</span>
          <span class="role-pill">${escapeHtml(roleLabels[state.profile.role])}</span>
          <button class="icon-button" type="button" data-action="logout" aria-label="로그아웃" title="로그아웃">${icon("log-out")}</button>
        </div>
      </header>
      <main class="app-main">${view}</main>
      ${plannerMode() ? renderBottomNav() : ""}
      ${state.selectedDate ? renderDayEditor() : ""}
      ${state.selectedVendorId ? renderVendorDetail() : ""}
      ${state.editingVendorId ? renderVendorEditor() : ""}
      ${state.categoryManagerOpen ? renderCategoryManager() : ""}
      ${state.issuedAccount ? renderIssuedAccount() : ""}
      ${state.presentationVendorId ? renderPresentation() : ""}
    </section>
  `;
  renderPrintSheet();
}

function renderBottomNav() {
  const items = [
    { view: "calendar", label: "캘린더", icon: "calendar-days" },
    { view: "vendors", label: "레퍼런스", icon: "images" },
    { view: "manage", label: "관리", icon: "settings-2" }
  ];
  return `
    <nav class="bottom-nav" aria-label="주요 메뉴">
      ${items.map((item) => `
        <button class="${state.activeView === item.view ? "active" : ""}" type="button" data-action="navigate" data-view="${item.view}">
          ${icon(item.icon)}<span>${item.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderCalendarView() {
  const months = monthsFromToday();
  const first = months[0];
  const last = months.at(-1);
  return `
    <section class="view calendar-view">
      <header class="view-heading">
        <div>
          <div class="eyebrow">12 Month Plan</div>
          <h1>웨딩 캘린더</h1>
          <p>${first.getFullYear()}.${String(first.getMonth() + 1).padStart(2, "0")} - ${last.getFullYear()}.${String(last.getMonth() + 1).padStart(2, "0")}</p>
        </div>
        <div class="heading-actions">
          <button class="tool-button" type="button" data-action="print">${icon("printer")}<span>PDF</span></button>
          <button class="tool-button" type="button" data-action="png">${icon("image-down")}<span>이미지</span></button>
        </div>
      </header>
      <div class="calendar-legend">
        <span><i class="legend-today"></i>오늘</span>
        <span><i class="legend-note"></i>일정 있음</span>
        ${plannerMode() ? `<span class="legend-help">날짜를 누르면 메모</span>` : ""}
      </div>
      <section class="calendar">${months.map(renderMonth).join("")}</section>
      ${renderUpcoming()}
    </section>
  `;
}

function renderMonth(monthDate) {
  const todayKey = dateKey(new Date());
  return `
    <article class="month-card">
      <div class="month-head">
        <div><span class="month-number">${monthDate.getMonth() + 1}</span><span class="month-label">월</span></div>
        <strong>${monthDate.getFullYear()}</strong>
      </div>
      <div class="week-calendar-head">
        <div class="weekday">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
        <span>WEEK NOTE</span>
      </div>
      <div class="week-rows">
        ${getMonthRows(monthDate).map((row) => {
          const value = state.weekNotes.get(row.key)?.text || "";
          const days = row.days.map((date) => {
            if (!date) return `<span class="day empty"></span>`;
            const key = dateKey(date);
            const classes = ["day"];
            if (key === todayKey) classes.push("today");
            if (state.dayNotes.has(key)) classes.push("has-note");
            return `<button class="${classes.join(" ")}" type="button" data-action="select-day" data-date="${key}" aria-label="${key}">${date.getDate()}</button>`;
          }).join("");
          return `
            <div class="week-row">
              <div class="week-days">${days}</div>
              ${plannerMode()
                ? `<textarea class="week-comment" data-action="week-note" data-week="${row.key}" placeholder="메모" aria-label="${row.key} 주간 메모">${escapeHtml(value)}</textarea>`
                : `<div class="week-comment week-read">${escapeHtml(value || "")}</div>`}
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function renderUpcoming() {
  const today = dateKey(new Date());
  const events = [...state.dayNotes.values()]
    .filter((note) => note.id >= today)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 8);
  return `
    <section class="upcoming-section">
      <div class="section-title-row">
        <div><div class="eyebrow">Coming Up</div><h2>다가올 이벤트</h2></div>
        <span>${events.length}건</span>
      </div>
      <div class="event-list">
        ${events.length ? events.map((note) => `
          <button class="event-row" type="button" data-action="select-day" data-date="${note.id}">
            <span class="event-date"><strong>${parseDate(note.id).getDate()}</strong><small>${parseDate(note.id).getMonth() + 1}월</small></span>
            <span class="event-copy"><strong>${escapeHtml(note.title || "일정")}</strong><small>${escapeHtml(note.text || "메모 없음")}</small></span>
            ${icon("chevron-right")}
          </button>
        `).join("") : `<div class="empty-inline">${icon("calendar-check")}<span>다가올 일정이 없습니다.</span></div>`}
      </div>
    </section>
  `;
}

function filteredVendors() {
  const query = state.vendorQuery.trim().toLowerCase();
  return state.vendors.filter((vendor) => {
    const categoryMatch = state.selectedCategory === "all" || vendor.categoryId === state.selectedCategory;
    const haystack = [vendor.name, vendor.description, vendor.price, ...(vendor.tags || [])].join(" ").toLowerCase();
    return categoryMatch && (!query || haystack.includes(query));
  });
}

function renderVendorView() {
  return `
    <section class="view vendor-view">
      <header class="view-heading vendor-heading">
        <div>
          <div class="eyebrow">Planner Library</div>
          <h1>웨딩 레퍼런스</h1>
          <p>업체 ${state.vendors.length}곳 · 사진 ${state.photoRecords.size}장</p>
        </div>
        <button class="primary compact" type="button" data-action="new-vendor">${icon("plus")}<span>업체 등록</span></button>
      </header>
      <div class="vendor-tools">
        <label class="search-field">${icon("search")}<input data-action="vendor-search" type="search" value="${escapeHtml(state.vendorQuery)}" placeholder="업체명, 태그, 가격 검색" aria-label="업체 검색" /></label>
        <button class="icon-button bordered" type="button" data-action="open-category-manager" aria-label="카테고리 관리" title="카테고리 관리">${icon("folder-plus")}</button>
      </div>
      <div class="category-strip" aria-label="업체 카테고리">
        <button class="category-chip ${state.selectedCategory === "all" ? "active" : ""}" type="button" data-action="set-category" data-category="all">
          <span>전체</span><small>${state.vendors.length}</small>
        </button>
        ${state.categories.map((category) => {
          const count = state.vendors.filter((vendor) => vendor.categoryId === category.id).length;
          return `<button class="category-chip ${state.selectedCategory === category.id ? "active" : ""}" style="--category-color:${safeColor(category.color)}" type="button" data-action="set-category" data-category="${escapeHtml(category.id)}"><span>${escapeHtml(category.name)}</span><small>${count}</small></button>`;
        }).join("")}
      </div>
      <div class="vendor-results"><strong data-vendor-result-count>${filteredVendors().length}</strong><span>개의 레퍼런스</span></div>
      <div class="vendor-feed">${renderVendorFeed()}</div>
    </section>
  `;
}

function renderVendorFeed() {
  const vendors = filteredVendors();
  if (!vendors.length) {
    return `
      <div class="empty-state">
        ${icon("images")}
        <strong>표시할 업체가 없습니다</strong>
        <p>검색어나 카테고리를 바꾸거나 새 업체를 등록하세요.</p>
        <button class="secondary" type="button" data-action="new-vendor">${icon("plus")} 업체 등록</button>
      </div>
    `;
  }
  return vendors.map(renderVendorCard).join("");
}

function renderVendorCard(vendor) {
  const category = categoryFor(vendor.categoryId);
  const photoCount = (vendor.photoIds || []).filter((id) => state.photoUrls.has(id)).length;
  return `
    <article class="vendor-card" style="--category-color:${safeColor(category.color)}">
      <div class="vendor-media-wrap">
        <button class="vendor-media" type="button" data-action="open-vendor" data-vendor="${vendor.id}" aria-label="${escapeHtml(vendor.name)} 상세 보기">
          ${renderVendorMedia(vendor)}
        </button>
        <span class="vendor-status">${escapeHtml(vendor.status || "관심")}</span>
        ${photoCount ? `<span class="photo-count">${icon("images")} ${photoCount}</span>` : ""}
        <button class="favorite-button ${vendor.favorite ? "active" : ""}" type="button" data-action="toggle-favorite" data-vendor="${vendor.id}" aria-label="즐겨찾기" title="즐겨찾기">${icon("heart")}</button>
      </div>
      <button class="vendor-card-copy" type="button" data-action="open-vendor" data-vendor="${vendor.id}">
        <span class="vendor-card-meta"><span>${escapeHtml(category.name)}</span>${vendor.sample ? `<em>샘플</em>` : ""}</span>
        <strong>${escapeHtml(vendor.name)}</strong>
        <small>${escapeHtml(vendor.price || "가격 정보 없음")}</small>
      </button>
    </article>
  `;
}

function renderVendorMedia(vendor, extraClass = "") {
  const photoId = (vendor.photoIds || []).find((id) => state.photoUrls.has(id));
  const category = categoryFor(vendor.categoryId);
  if (photoId) {
    return `<img class="vendor-photo ${extraClass}" src="${state.photoUrls.get(photoId)}" alt="${escapeHtml(vendor.name)} 샘플" />`;
  }
  return `
    <span class="vendor-placeholder ${extraClass}" style="--category-color:${safeColor(category.color)}">
      ${icon(category.icon || "camera")}
      <strong>${escapeHtml(category.name)}</strong>
      <small>사진을 등록하세요</small>
    </span>
  `;
}

function renderVendorDetailPanel(vendor, website) {
  if (state.vendorDetailTab === "pricing") {
    const packages = vendor.packages || [];
    const extraFees = vendor.extraFees || [];
    return `
      <section class="detail-panel" role="tabpanel">
        <div class="panel-heading"><div><span class="modal-kicker">Packages</span><h3>상품 구성 및 금액</h3></div><span>${packages.length}개 상품</span></div>
        ${packages.length ? `<div class="package-list">${packages.map((plan) => `
          <article class="package-card">
            <header><strong>${escapeHtml(plan.name || "상품")}</strong><span>${escapeHtml(plan.price || "가격 협의")}</span></header>
            ${textLines(plan.details).length ? `<ul>${textLines(plan.details).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p>포함 항목이 등록되지 않았습니다.</p>`}
          </article>
        `).join("")}</div>` : `<div class="empty-detail">등록된 상품 구성이 없습니다.</div>`}
        ${extraFees.length ? `
          <section class="detail-subsection"><h3>${icon("circle-plus")} 추가 비용</h3><dl class="fee-list">${extraFees.map((fee) => `<div><dt>${escapeHtml(fee.name || "추가 항목")}</dt><dd>${escapeHtml(fee.price || "별도 문의")}</dd></div>`).join("")}</dl></section>
        ` : ""}
        ${vendor.discountBenefits ? `<section class="detail-note-block benefit-note"><h3>${icon("badge-percent")} 할인·혜택</h3><p>${escapeHtml(vendor.discountBenefits)}</p></section>` : ""}
      </section>
    `;
  }

  if (state.vendorDetailTab === "policy") {
    return `
      <section class="detail-panel" role="tabpanel">
        <div class="policy-meta">
          <span><small>업데이트</small><strong>${escapeHtml(vendor.updatedAtLabel || "미입력")}</strong></span>
          <span><small>프로모션</small><strong>${escapeHtml(vendor.promotionPeriod || "없음")}</strong></span>
          <span><small>사전 미팅</small><strong>${vendor.requiredMeeting ? "필수" : "선택"}</strong></span>
        </div>
        ${vendor.scheduleInfo ? `<section class="detail-note-block neutral-note"><h3>${icon("clock-3")} 일정·진행</h3><p>${escapeHtml(vendor.scheduleInfo)}</p></section>` : ""}
        ${vendor.reservationPolicy ? `<section class="detail-note-block"><h3>${icon("calendar-check-2")} 예약 조건</h3><p>${escapeHtml(vendor.reservationPolicy)}</p></section>` : ""}
        ${vendor.operationPolicy ? `<section class="detail-note-block warning-note"><h3>${icon("cloud-sun")} 변경·취소·운영 정책</h3><p>${escapeHtml(vendor.operationPolicy)}</p></section>` : ""}
        <section class="detail-note-block neutral-note"><h3>${icon("file-text")} 계약 조건</h3><p>${escapeHtml(vendor.contractTerms || "등록된 계약 조건이 없습니다.")}</p></section>
      </section>
    `;
  }

  if (state.vendorDetailTab === "planner") {
    return `
      <section class="detail-panel" role="tabpanel">
        <div class="planner-settlement">
          <div><span>플래너 수수료</span><strong>${escapeHtml(vendor.commissionRate || "미입력")}</strong></div>
          <p>${escapeHtml(vendor.commissionTerms || "정산 조건이 등록되지 않았습니다.")}</p>
        </div>
        ${vendor.sourceMemo ? `<section class="detail-note-block neutral-note"><h3>${icon("messages-square")} 자료 출처·상담 기록</h3><p>${escapeHtml(vendor.sourceMemo)}</p></section>` : ""}
        ${vendor.plannerNotes ? `<section class="detail-note-block planner-note"><h3>${icon("notebook-pen")} 플래너 메모</h3><p>${escapeHtml(vendor.plannerNotes)}</p></section>` : ""}
      </section>
    `;
  }

  return `
    <section class="detail-panel" role="tabpanel">
      ${vendor.description ? `<p class="detail-description">${escapeHtml(vendor.description)}</p>` : ""}
      ${(vendor.tags || []).length ? `<div class="tag-list">${vendor.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <dl class="info-list">
        <div><dt>${icon("wallet-cards")} 대표 가격</dt><dd>${escapeHtml(vendor.price || "미입력")}</dd></div>
        <div><dt>${icon("phone")} 연락처</dt><dd>${escapeHtml(vendor.contact || "미입력")}</dd></div>
        <div><dt>${icon("map-pin")} 위치</dt><dd>${escapeHtml(vendor.address || "미입력")}</dd></div>
        <div><dt>${icon("instagram")} 인스타그램</dt><dd>${escapeHtml(vendor.instagram || "미입력")}</dd></div>
        ${website ? `<div><dt>${icon("globe-2")} 웹사이트</dt><dd><a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">사이트 열기 ${icon("arrow-up-right")}</a></dd></div>` : ""}
      </dl>
    </section>
  `;
}

function renderVendorDetail() {
  const vendor = vendorFor(state.selectedVendorId);
  if (!vendor) return "";
  const category = categoryFor(vendor.categoryId);
  const photoIds = (vendor.photoIds || []).filter((id) => state.photoUrls.has(id));
  const index = Math.min(state.selectedVendorPhotoIndex, Math.max(photoIds.length - 1, 0));
  const photoId = photoIds[index];
  const website = safeUrl(vendor.website);
  return `
    <div class="modal-backdrop" data-action="close-vendor-detail"></div>
    <section class="modal-sheet vendor-detail" role="dialog" aria-modal="true" aria-label="업체 상세">
      <header class="modal-header">
        <div><span class="modal-kicker">${escapeHtml(category.name)}</span><strong>${escapeHtml(vendor.name)}</strong></div>
        <button class="icon-button" type="button" data-action="close-vendor-detail" aria-label="닫기" title="닫기">${icon("x")}</button>
      </header>
      <div class="detail-scroll">
        <div class="detail-gallery ${state.vendorDetailTab === "overview" ? "" : "compact"}" style="--category-color:${safeColor(category.color)}">
          <div class="detail-main-photo">
            ${photoId ? `<img src="${state.photoUrls.get(photoId)}" alt="${escapeHtml(vendor.name)} 사진 ${index + 1}" />` : renderVendorMedia(vendor, "detail-placeholder")}
            ${photoIds.length > 1 ? `
              <button class="gallery-arrow prev" type="button" data-action="vendor-photo-prev" aria-label="이전 사진">${icon("chevron-left")}</button>
              <button class="gallery-arrow next" type="button" data-action="vendor-photo-next" aria-label="다음 사진">${icon("chevron-right")}</button>
              <span class="gallery-count">${index + 1} / ${photoIds.length}</span>
            ` : ""}
          </div>
          ${photoIds.length > 1 ? `<div class="thumbnail-strip">${photoIds.map((id, photoIndex) => `<button class="${photoIndex === index ? "active" : ""}" type="button" data-action="select-vendor-photo" data-index="${photoIndex}"><img src="${state.photoUrls.get(id)}" alt="" /></button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-content">
          <div class="detail-title-row">
            <div><span class="status-tag">${escapeHtml(vendor.status || "관심")}</span><h2>${escapeHtml(vendor.name)}</h2></div>
            <button class="favorite-button detail-favorite ${vendor.favorite ? "active" : ""}" type="button" data-action="toggle-favorite" data-vendor="${vendor.id}" aria-label="즐겨찾기">${icon("heart")}</button>
          </div>
          <div class="detail-tabs" role="tablist" aria-label="업체 정보 구분">
            ${[
              ["overview", "grid-2x2", "기본정보"],
              ["pricing", "wallet-cards", "상품·가격"],
              ["policy", "file-check-2", "계약·공지"],
              ["planner", "briefcase-business", "플래너"]
            ].map(([tab, tabIcon, label]) => `<button class="${state.vendorDetailTab === tab ? "active" : ""}" type="button" role="tab" aria-selected="${state.vendorDetailTab === tab}" data-action="set-vendor-detail-tab" data-tab="${tab}">${icon(tabIcon)}<span>${label}</span></button>`).join("")}
          </div>
          ${renderVendorDetailPanel(vendor, website)}
        </div>
      </div>
      <footer class="modal-actions">
        <button class="secondary danger-text" type="button" data-action="delete-vendor" data-vendor="${vendor.id}" aria-label="업체 삭제">${icon("trash-2")}</button>
        <button class="secondary" type="button" data-action="edit-vendor" data-vendor="${vendor.id}">${icon("pencil")} 편집</button>
        <button class="primary grow" type="button" data-action="open-presentation" data-vendor="${vendor.id}">${icon("monitor-up")} 고객에게 보여주기</button>
      </footer>
    </section>
  `;
}

function renderPackageEditorRow(plan = {}) {
  return `
    <div class="repeat-row package-editor-row" data-repeat-row="package">
      <div class="repeat-row-head"><strong>상품안</strong><button class="icon-button" type="button" data-action="remove-repeat-row" aria-label="상품안 삭제">${icon("x")}</button></div>
      <div class="field-grid two-cols">
        <label>상품명<input name="packageName" value="${escapeHtml(plan.name || "")}" placeholder="예: T1 Basic" /></label>
        <label>금액<input name="packagePrice" value="${escapeHtml(plan.price || "")}" placeholder="예: 220만원" /></label>
      </div>
      <label>포함 항목<textarea name="packageDetails" rows="4" placeholder="촬영 시간, 의상 수, 원본·앨범 구성 등을 줄마다 입력">${escapeHtml(plan.details || "")}</textarea></label>
    </div>
  `;
}

function renderExtraFeeEditorRow(fee = {}) {
  return `
    <div class="repeat-row extra-fee-row" data-repeat-row="fee">
      <label>추가 항목<input name="extraFeeName" value="${escapeHtml(fee.name || "")}" placeholder="예: 대표 지정비" /></label>
      <label>금액·조건<input name="extraFeePrice" value="${escapeHtml(fee.price || "")}" placeholder="예: 50만원" /></label>
      <button class="icon-button" type="button" data-action="remove-repeat-row" aria-label="추가 비용 삭제">${icon("x")}</button>
    </div>
  `;
}

function renderVendorEditor() {
  const isNew = state.editingVendorId === "new";
  const vendor = isNew ? {
    name: "", categoryId: state.selectedCategory === "all" ? state.categories[0]?.id : state.selectedCategory,
    status: "관심", price: "", description: "", contact: "", address: "", instagram: "", website: "",
    contractTerms: "", plannerNotes: "", tags: [], photoIds: [], packages: [], extraFees: [],
    discountBenefits: "", promotionPeriod: "", updatedAtLabel: dateKey(new Date()), scheduleInfo: "",
    reservationPolicy: "", operationPolicy: "", requiredMeeting: false, commissionRate: "",
    commissionTerms: "", sourceMemo: ""
  } : vendorFor(state.editingVendorId);
  if (!vendor) return "";
  const existingPhotos = (vendor.photoIds || []).filter((id) => state.photoUrls.has(id));
  return `
    <div class="modal-backdrop" data-action="close-vendor-editor"></div>
    <form class="modal-sheet vendor-editor" data-action="save-vendor" role="dialog" aria-modal="true">
      <header class="modal-header">
        <div><span class="modal-kicker">Planner Library</span><strong>${isNew ? "새 업체 등록" : "업체 정보 편집"}</strong></div>
        <button class="icon-button" type="button" data-action="close-vendor-editor" aria-label="닫기">${icon("x")}</button>
      </header>
      <div class="editor-scroll">
        <section class="photo-uploader">
          <div class="editor-section-title"><strong>샘플 사진</strong><span>최대 20장 · 자동 최적화</span></div>
          ${existingPhotos.length ? `<div class="existing-photo-grid">${existingPhotos.map((id) => `<label class="existing-photo"><img src="${state.photoUrls.get(id)}" alt="" /><input type="checkbox" name="removePhoto" value="${id}" /><span>${icon("trash-2")} 삭제</span></label>`).join("")}</div>` : ""}
          <label class="upload-dropzone">
            ${icon("image-plus")}
            <strong>사진 추가</strong>
            <span>여러 장을 한 번에 선택할 수 있습니다</span>
            <input data-action="vendor-photos" name="photos" type="file" accept="image/*" multiple />
          </label>
          <div class="pending-photo-preview" aria-live="polite"></div>
        </section>
        <section class="editor-fields">
          <div class="field-grid two-cols">
            <label>업체명<input name="name" value="${escapeHtml(vendor.name)}" placeholder="업체명" required /></label>
            <label>카테고리<select name="categoryId" required>${state.categories.map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === vendor.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></label>
          </div>
          <div class="field-grid two-cols">
            <label>진행 상태<select name="status">${vendorStatuses.map((status) => `<option ${status === vendor.status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
            <label>가격 정보<input name="price" value="${escapeHtml(vendor.price)}" placeholder="예: 본식 280만원부터" /></label>
          </div>
          <label>한 줄 소개<textarea name="description" rows="3" placeholder="업체의 분위기와 강점을 적어주세요">${escapeHtml(vendor.description)}</textarea></label>
          <div class="field-grid two-cols">
            <label>연락처<input name="contact" value="${escapeHtml(vendor.contact)}" placeholder="02-0000-0000" /></label>
            <label>인스타그램<input name="instagram" value="${escapeHtml(vendor.instagram)}" placeholder="@account" /></label>
          </div>
          <label>주소<input name="address" value="${escapeHtml(vendor.address)}" placeholder="주소 또는 상담 장소" /></label>
          <label>웹사이트<input name="website" type="url" value="${escapeHtml(vendor.website)}" placeholder="https://" /></label>
          <label>태그<input name="tags" value="${escapeHtml((vendor.tags || []).join(", "))}" placeholder="실크, 채광, 단독홀" /></label>

          <div class="editor-divider"><span>Product & Price</span><strong>상품 구성 및 비용</strong></div>
          <div class="repeat-editor">
            <div class="editor-section-title"><strong>상품안</strong><button class="secondary small-action" type="button" data-action="add-package-row">${icon("plus")} 상품 추가</button></div>
            <div class="repeat-list" data-package-list>${(vendor.packages?.length ? vendor.packages : [{}]).map(renderPackageEditorRow).join("")}</div>
          </div>
          <div class="repeat-editor">
            <div class="editor-section-title"><strong>추가 비용</strong><button class="secondary small-action" type="button" data-action="add-fee-row">${icon("plus")} 항목 추가</button></div>
            <div class="repeat-list" data-fee-list>${(vendor.extraFees?.length ? vendor.extraFees : [{}]).map(renderExtraFeeEditorRow).join("")}</div>
          </div>
          <label>할인·혜택<textarea name="discountBenefits" rows="3" placeholder="동시 계약 할인, 시즌 혜택 등">${escapeHtml(vendor.discountBenefits || "")}</textarea></label>

          <div class="editor-divider"><span>Notice & Policy</span><strong>계약·공지·운영 정보</strong></div>
          <div class="field-grid two-cols">
            <label>정보 업데이트일<input name="updatedAtLabel" type="date" value="${escapeHtml(vendor.updatedAtLabel || "")}" /></label>
            <label>프로모션 기간<input name="promotionPeriod" value="${escapeHtml(vendor.promotionPeriod || "")}" placeholder="예: 7/13 - 8/13" /></label>
          </div>
          <label class="meeting-check"><input name="requiredMeeting" type="checkbox" ${vendor.requiredMeeting ? "checked" : ""} /><span><strong>사전 미팅 필수</strong><small>계약 또는 진행 전 상담이 필요한 업체</small></span></label>
          <label>일정·진행 안내<textarea name="scheduleInfo" rows="3" placeholder="촬영 타임, 상담 시간, 제작 기간 등">${escapeHtml(vendor.scheduleInfo || "")}</textarea></label>
          <label>예약 조건<textarea name="reservationPolicy" rows="3" placeholder="예약금, 가예약 여부, 일정 확정 기준">${escapeHtml(vendor.reservationPolicy || "")}</textarea></label>
          <label>변경·취소·운영 정책<textarea name="operationPolicy" rows="4" placeholder="우천, 일정 변경, 취소, 환불 기준">${escapeHtml(vendor.operationPolicy || "")}</textarea></label>
          <label>계약 조건<textarea name="contractTerms" rows="4" placeholder="계약서의 주요 조건과 포함·제외 항목">${escapeHtml(vendor.contractTerms)}</textarea></label>

          <div class="editor-divider"><span>Planner Only</span><strong>플래너 내부 정보</strong></div>
          <div class="field-grid two-cols">
            <label>수수료율<input name="commissionRate" value="${escapeHtml(vendor.commissionRate || "")}" placeholder="예: 15%" /></label>
            <label>정산 조건<input name="commissionTerms" value="${escapeHtml(vendor.commissionTerms || "")}" placeholder="예: 익월 9일 정산" /></label>
          </div>
          <label>자료 출처·상담 기록<textarea name="sourceMemo" rows="4" placeholder="카카오톡, 통화, 업체 공지의 핵심 내용과 확인일">${escapeHtml(vendor.sourceMemo || "")}</textarea></label>
          <label>플래너 메모<textarea name="plannerNotes" rows="4" placeholder="고객에게는 보이지 않는 내부 메모">${escapeHtml(vendor.plannerNotes)}</textarea></label>
        </section>
      </div>
      <footer class="modal-actions"><button class="secondary" type="button" data-action="close-vendor-editor">취소</button><button class="primary grow" type="submit">${icon("save")} 저장</button></footer>
    </form>
  `;
}

function renderCategoryManager() {
  return `
    <div class="modal-backdrop" data-action="close-category-manager"></div>
    <section class="modal-sheet compact-modal" role="dialog" aria-modal="true" aria-label="카테고리 관리">
      <header class="modal-header"><div><span class="modal-kicker">Library Settings</span><strong>카테고리 관리</strong></div><button class="icon-button" type="button" data-action="close-category-manager" aria-label="닫기">${icon("x")}</button></header>
      <div class="category-manager-list">
        ${state.categories.map((category) => {
          const count = state.vendors.filter((vendor) => vendor.categoryId === category.id).length;
          return `<div class="category-manager-row"><span class="color-swatch" style="background:${safeColor(category.color)}"></span><strong>${escapeHtml(category.name)}</strong><small>${count}곳</small><button class="icon-button" type="button" data-action="delete-category" data-category="${escapeHtml(category.id)}" ${category.locked || count ? "disabled" : ""} aria-label="카테고리 삭제">${icon("trash-2")}</button></div>`;
        }).join("")}
      </div>
      <form class="category-add-form" data-action="add-category">
        <label>새 카테고리<input name="name" placeholder="예: 청첩장" required /></label>
        <label>색상<input name="color" type="color" value="#5f7094" aria-label="카테고리 색상" /></label>
        <button class="primary" type="submit">${icon("plus")} 추가</button>
      </form>
    </section>
  `;
}

function renderPresentation() {
  const vendor = vendorFor(state.presentationVendorId);
  if (!vendor) return "";
  const category = categoryFor(vendor.categoryId);
  const photos = (vendor.photoIds || []).filter((id) => state.photoUrls.has(id));
  const index = Math.min(state.presentationPhotoIndex, Math.max(photos.length - 1, 0));
  return `
    <section class="presentation" role="dialog" aria-modal="true" aria-label="고객 프레젠테이션">
      <header class="presentation-header">
        <div><span>${escapeHtml(category.name)}</span><strong>${escapeHtml(vendor.name)}</strong></div>
        <button class="presentation-close" type="button" data-action="close-presentation" aria-label="닫기">${icon("x")}</button>
      </header>
      <div class="presentation-stage" style="--category-color:${safeColor(category.color)}">
        ${photos.length ? `<img src="${state.photoUrls.get(photos[index])}" alt="${escapeHtml(vendor.name)} 레퍼런스 ${index + 1}" />` : renderVendorMedia(vendor, "presentation-placeholder")}
        ${photos.length > 1 ? `<button class="presentation-arrow prev" type="button" data-action="presentation-prev" aria-label="이전 사진">${icon("chevron-left")}</button><button class="presentation-arrow next" type="button" data-action="presentation-next" aria-label="다음 사진">${icon("chevron-right")}</button>` : ""}
      </div>
      <footer class="presentation-footer">
        <div><strong>${escapeHtml(vendor.price || "가격 협의")}</strong><span>${escapeHtml(vendor.description || vendor.contractTerms || "")}</span></div>
        <span>${photos.length ? `${index + 1} / ${photos.length}` : "사진 준비 중"}</span>
      </footer>
    </section>
  `;
}

function renderManageView() {
  return `
    <section class="view manage-view">
      <header class="view-heading">
        <div><div class="eyebrow">Back Office</div><h1>플래너 관리</h1><p>팀과 실시간으로 동기화되는 웨딩 데이터</p></div>
      </header>
      <div class="stat-strip">
        <div><strong>${state.vendors.length}</strong><span>업체</span></div>
        <div><strong>${state.photoRecords.size}</strong><span>사진</span></div>
        <div><strong>${state.members.length}</strong><span>계정</span></div>
        <div><strong>${state.dayNotes.size}</strong><span>일정</span></div>
      </div>
      <section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Wedding Profile</div><h2>웨딩 기본 정보</h2></div></div>
        <form class="field-grid" data-action="save-wedding">
          <div class="field-grid two-cols"><label>신랑 이름<input name="groomName" value="${escapeHtml(state.wedding?.groomName || "")}" required /></label><label>신부 이름<input name="brideName" value="${escapeHtml(state.wedding?.brideName || "")}" required /></label></div>
          <div class="field-grid two-cols"><label>예식일<input name="weddingDate" type="date" value="${escapeHtml(state.wedding?.weddingDate || "")}" required /></label><label>플래너명<input name="plannerName" value="${escapeHtml(state.wedding?.plannerName || "")}" /></label></div>
          <div class="form-submit-row"><button class="primary" type="submit">${icon("save")} 정보 저장</button></div>
        </form>
      </section>
      <section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Members</div><h2>로그인 계정</h2></div><span>${state.members.length}명</span></div>
        <div class="member-list">
          ${state.members.map((member) => `<div class="member-row"><span class="member-avatar">${escapeHtml((member.displayName || member.loginId || "?").slice(0, 1))}</span><span><strong>${escapeHtml(member.displayName || member.loginId)}</strong><small>${escapeHtml(member.loginId)} · ${escapeHtml(roleLabels[member.role])}</small></span>${member.role !== "planner" ? `<button class="icon-button" type="button" data-action="delete-member" data-member="${member.id}" aria-label="계정 삭제">${icon("trash-2")}</button>` : `<span class="owner-label">OWNER</span>`}</div>`).join("")}
        </div>
        <form class="account-form" data-action="create-account">
          <h3>${icon("user-plus")} 신랑·신부 계정 발급</h3>
          <div class="field-grid two-cols"><label>역할<select name="role"><option value="groom">신랑</option><option value="bride">신부</option></select></label><label>이름<input name="displayName" required /></label></div>
          <div class="field-grid two-cols"><label>로그인 아이디<input name="loginId" required /></label><label>임시 비밀번호<span class="input-with-action"><input name="password" value="${generatePassword()}" required /><button class="icon-button" type="button" data-action="regen-password" aria-label="비밀번호 새로 만들기">${icon("refresh-cw")}</button></span></label></div>
          <div class="form-submit-row"><button class="secondary" type="submit">계정 발급</button></div>
        </form>
      </section>
      <section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Security</div><h2>내 비밀번호</h2></div></div>
        <form class="inline-form" data-action="change-password"><label>새 비밀번호<input name="password" type="password" minlength="6" required /></label><button class="secondary" type="submit">변경</button></form>
      </section>
      <section class="manage-section data-section">
        <div class="section-title-row"><div><div class="eyebrow">Data</div><h2>데이터 백업</h2></div>${icon("database")}</div>
        <p>업체 정보와 사진, 일정을 하나의 백업 파일로 보관합니다. 계정 비밀번호는 포함되지 않습니다.</p>
        <div class="data-actions"><button class="secondary" type="button" data-action="export-data">${icon("download")} 전체 백업</button><button class="secondary" type="button" data-action="import-data">${icon("upload")} 백업 복원</button><input class="visually-hidden" type="file" accept="application/json" data-action="data-import-file" /></div>
      </section>
    </section>
  `;
}

function renderDayEditor() {
  const note = state.dayNotes.get(state.selectedDate);
  const readonly = !plannerMode();
  return `
    <div class="modal-backdrop" data-action="close-day-editor"></div>
    <form class="modal-sheet compact-modal day-editor" data-action="save-day" role="dialog" aria-modal="true">
      <header class="modal-header"><div><span class="modal-kicker">${escapeHtml(formatDateLong(state.selectedDate))}</span><strong>일정 메모</strong></div><button class="icon-button" type="button" data-action="close-day-editor" aria-label="닫기">${icon("x")}</button></header>
      <div class="editor-fields"><label>제목<input name="title" value="${escapeHtml(note?.title || "")}" ${readonly ? "readonly" : ""} placeholder="일정 제목" /></label><label>메모<textarea name="text" rows="5" ${readonly ? "readonly" : ""} placeholder="세부 내용을 적어주세요">${escapeHtml(note?.text || "")}</textarea></label></div>
      ${readonly ? "" : `<footer class="modal-actions"><button class="secondary danger-text" type="button" data-action="delete-day" ${note ? "" : "disabled"}>${icon("trash-2")} 삭제</button><button class="primary grow" type="submit">${icon("save")} 저장</button></footer>`}
    </form>
  `;
}

function renderIssuedAccount() {
  const account = state.issuedAccount;
  return `
    <div class="modal-backdrop" data-action="close-issued-account"></div>
    <section class="modal-sheet compact-modal account-issued" role="dialog" aria-modal="true" aria-label="계정 발급 완료">
      <header class="modal-header"><div><span class="modal-kicker">${escapeHtml(roleLabels[account.role])} Account</span><strong>계정 발급 완료</strong></div><button class="icon-button" type="button" data-action="close-issued-account" aria-label="닫기">${icon("x")}</button></header>
      <div class="editor-fields">
        <label>로그인 아이디<input value="${escapeHtml(account.loginId)}" readonly /></label>
        <label>임시 비밀번호<input value="${escapeHtml(account.password)}" readonly /></label>
      </div>
      <footer class="modal-actions"><button class="primary wide" type="button" data-action="close-issued-account">확인</button></footer>
    </section>
  `;
}

function renderPrintSheet() {
  if (!state.authUser) return;
  const todayKey = dateKey(new Date());
  printRoot.innerHTML = `
    <section class="print-sheet">
      <div class="print-title"><div>WEDDING CALENDAR</div><div>${escapeHtml(calendarYearLabel())}</div></div>
      <div class="print-owner">${escapeHtml(state.wedding?.groomName || "신랑")} · ${escapeHtml(state.wedding?.brideName || "신부")} &nbsp;·&nbsp; 담당 플래너: ${escapeHtml(state.wedding?.plannerName || "")}</div>
      <div class="print-grid">
        ${monthsFromToday().map((month) => `
          <article class="print-month">
            <div class="print-month-head"><h3>${month.getMonth() + 1}</h3><div class="print-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div></div>
            <div class="print-week-rows">
              ${getMonthRows(month).map((row) => `<div class="print-week-row"><div class="print-week-days">${row.days.map((date) => {
                if (!date) return `<span class="print-day"></span>`;
                const key = dateKey(date);
                return `<span class="print-day ${key === todayKey ? "today" : ""} ${state.dayNotes.has(key) ? "has-note" : ""}">${date.getDate()}</span>`;
              }).join("")}</div><div class="print-line">${escapeHtml(state.weekNotes.get(row.key)?.text || "")}</div></div>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function render() {
  if (state.loading) {
    appRoot.innerHTML = `<section class="loading-screen"><span class="brand-mark">M</span><p>불러오는 중</p></section>`;
  } else if (!state.authUser) {
    renderLogin();
  } else {
    renderApp();
  }
  activateIcons();
}

function showLoginError(message) {
  state.error = message;
  render();
}

function generatePassword() {
  return `wed${Math.random().toString(36).slice(2, 8)}!`;
}

async function handleLogin(form) {
  state.error = "";
  const formData = new FormData(form);
  if (!await loginUser(formData.get("loginId"), formData.get("password"))) {
    showLoginError("아이디 또는 비밀번호를 확인하세요. 최초 로그인은 admin / admin 입니다.");
  }
}

async function handleSaveWedding(form) {
  const data = Object.fromEntries(new FormData(form));
  const currentWeddingId = state.profile.weddingId;
  throwIfError(await supabase.from("weddings").update({
    groom_name: data.groomName,
    bride_name: data.brideName,
    wedding_date: data.weddingDate,
    planner_name: data.plannerName || "관리자"
  }).eq("id", currentWeddingId));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("웨딩 정보가 저장되었습니다.");
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handleCreateAccount(form) {
  const data = Object.fromEntries(new FormData(form));
  const loginId = normalizeLoginId(data.loginId);
  const password = String(data.password || "");
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(loginId)) {
    throw new Error("아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3-30자 입력하세요.");
  }
  if (password.length < 6) throw new Error("임시 비밀번호는 6자 이상이어야 합니다.");
  if (state.members.some((member) => member.loginId === loginId)) throw new Error("이미 사용 중인 로그인 아이디입니다.");

  const inviteToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Text(inviteToken);
  const invite = throwIfError(await supabase.from("member_invites").insert({
    wedding_id: state.profile.weddingId,
    login_id: loginId,
    role: data.role,
    display_name: String(data.displayName || "").trim(),
    token_hash: tokenHash,
    created_by: state.authUser.uid
  }).select("id").single());

  const signupClient = createSignupClient();
  try {
    const { data: signupData, error } = await signupClient.auth.signUp({
      email: loginEmail(loginId),
      password,
      options: { data: { invite_token: inviteToken } }
    });
    if (error) throw error;
    if (!signupData.user?.identities?.length) throw new Error("이미 사용된 아이디입니다.");
  } catch (error) {
    await supabase.from("member_invites").delete().eq("id", invite.id);
    throw error;
  } finally {
    await signupClient.auth.signOut().catch(() => {});
  }

  await hydrateRemoteState({ id: state.authUser.uid });
  state.issuedAccount = { role: data.role, loginId, password };
  render();
}

async function handleDeleteMember(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member || member.role === "planner" || !confirm(`${member.displayName || member.loginId} 계정을 삭제할까요?`)) return;
  throwIfError(await supabase.rpc("delete_wedding_member", { target_user_id: memberId }));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("계정이 삭제되었습니다.");
}

async function handleChangePassword(form) {
  const password = String(new FormData(form).get("password") || "");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  form.reset();
  notify("비밀번호가 변경되었습니다.");
}

async function handleSaveDay(form) {
  const data = Object.fromEntries(new FormData(form));
  throwIfError(await supabase.from("day_notes").upsert({
    wedding_id: state.profile.weddingId,
    note_date: state.selectedDate,
    title: String(data.title || "").trim(),
    body: String(data.text || "").trim(),
    updated_by: state.authUser.uid
  }, { onConflict: "wedding_id,note_date" }));
  state.selectedDate = null;
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("일정이 저장되었습니다.");
}

async function handleDeleteDay() {
  throwIfError(await supabase.from("day_notes")
    .delete()
    .eq("wedding_id", state.profile.weddingId)
    .eq("note_date", state.selectedDate));
  state.selectedDate = null;
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("일정이 삭제되었습니다.");
}

function queueWeekSave(textarea) {
  clearTimeout(weekTimer);
  weekTimer = setTimeout(async () => {
    const key = textarea.dataset.week;
    const value = textarea.value;
    state.weekNotes.set(key, { id: key, text: value, weekStart: key, updatedBy: state.authUser.uid });
    try {
      const result = value.trim()
        ? await supabase.from("week_notes").upsert({
          wedding_id: state.profile.weddingId,
          week_start: key,
          body: value,
          updated_by: state.authUser.uid
        }, { onConflict: "wedding_id,week_start" })
        : await supabase.from("week_notes").delete()
          .eq("wedding_id", state.profile.weddingId)
          .eq("week_start", key);
      throwIfError(result);
    } catch {
      notify("주간 메모를 저장하지 못했습니다.");
    }
  }, 600);
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function compressPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 등록할 수 있습니다.");
  const image = await loadImage(file);
  const maxEdge = 1600;
  const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진 변환에 실패했습니다.")), "image/jpeg", 0.84));
}

async function handleSaveVendor(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerHTML = `${icon("loader-circle", "spin")} 저장 중`;
  activateIcons();
  const formData = new FormData(form);
  const isNew = state.editingVendorId === "new";
  const existing = isNew ? null : vendorFor(state.editingVendorId);
  const vendorId = existing?.id || `vendor-${crypto.randomUUID()}`;
  const removeIds = formData.getAll("removePhoto");
  const files = [...(form.querySelector('[name="photos"]')?.files || [])];
  const retainedPhotoIds = (existing?.photoIds || []).filter((id) => !removeIds.includes(id));
  if (retainedPhotoIds.length + files.length > 20) throw new Error("업체당 사진은 최대 20장까지 등록할 수 있습니다.");
  const createdPhotos = [];
  try {
    for (const [index, file] of files.entries()) {
      const id = `photo-${crypto.randomUUID()}`;
      const blob = await compressPhoto(file);
      const storagePath = `${state.profile.weddingId}/${vendorId}/${id}.jpg`;
      throwIfError(await supabase.storage.from(photoBucket).upload(storagePath, blob, {
        contentType: "image/jpeg",
        upsert: false
      }));
      createdPhotos.push({
        wedding_id: state.profile.weddingId,
        id,
        vendor_id: vendorId,
        storage_path: storagePath,
        file_name: file.name || "photo.jpg",
        sort_order: retainedPhotoIds.length + index
      });
    }
    const now = new Date().toISOString();
    const tags = String(formData.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    const packageNames = formData.getAll("packageName");
    const packagePrices = formData.getAll("packagePrice");
    const packageDetails = formData.getAll("packageDetails");
    const packages = packageNames.map((name, index) => ({
      name: String(name || "").trim(),
      price: String(packagePrices[index] || "").trim(),
      details: String(packageDetails[index] || "").trim()
    })).filter((plan) => plan.name || plan.price || plan.details);
    const extraFeeNames = formData.getAll("extraFeeName");
    const extraFeePrices = formData.getAll("extraFeePrice");
    const extraFees = extraFeeNames.map((name, index) => ({
      name: String(name || "").trim(),
      price: String(extraFeePrices[index] || "").trim()
    })).filter((fee) => fee.name || fee.price);
    const nextVendor = {
      ...existing,
      id: vendorId,
      name: String(formData.get("name") || "").trim(),
      categoryId: formData.get("categoryId"),
      status: formData.get("status"),
      price: String(formData.get("price") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      contact: String(formData.get("contact") || "").trim(),
      address: String(formData.get("address") || "").trim(),
      instagram: String(formData.get("instagram") || "").trim(),
      website: String(formData.get("website") || "").trim(),
      contractTerms: String(formData.get("contractTerms") || "").trim(),
      packages,
      extraFees,
      discountBenefits: String(formData.get("discountBenefits") || "").trim(),
      promotionPeriod: String(formData.get("promotionPeriod") || "").trim(),
      updatedAtLabel: String(formData.get("updatedAtLabel") || "").trim(),
      scheduleInfo: String(formData.get("scheduleInfo") || "").trim(),
      reservationPolicy: String(formData.get("reservationPolicy") || "").trim(),
      operationPolicy: String(formData.get("operationPolicy") || "").trim(),
      requiredMeeting: formData.has("requiredMeeting"),
      commissionRate: String(formData.get("commissionRate") || "").trim(),
      commissionTerms: String(formData.get("commissionTerms") || "").trim(),
      sourceMemo: String(formData.get("sourceMemo") || "").trim(),
      plannerNotes: String(formData.get("plannerNotes") || "").trim(),
      tags,
      photoIds: [...retainedPhotoIds, ...createdPhotos.map((photo) => photo.id)],
      favorite: existing?.favorite || false,
      sample: false,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    throwIfError(await supabase.from("vendors").upsert(
      vendorRow(nextVendor, state.profile.weddingId),
      { onConflict: "wedding_id,id" }
    ));
    if (createdPhotos.length) throwIfError(await supabase.from("vendor_photos").insert(createdPhotos));
    if (removeIds.length) {
      const removePaths = removeIds.map((id) => state.photoRecords.get(id)?.storagePath).filter(Boolean);
      if (removePaths.length) throwIfError(await supabase.storage.from(photoBucket).remove(removePaths));
      throwIfError(await supabase.from("vendor_photos")
        .delete()
        .eq("wedding_id", state.profile.weddingId)
        .in("id", removeIds));
    }
    clearPendingPhotoUrls();
    state.editingVendorId = null;
    state.selectedVendorId = vendorId;
    state.selectedVendorPhotoIndex = 0;
    state.vendorDetailTab = "overview";
    await hydrateRemoteState({ id: state.authUser.uid });
    render();
    notify(isNew ? "업체가 등록되었습니다." : "업체 정보가 저장되었습니다.");
  } catch (error) {
    const paths = createdPhotos.map((photo) => photo.storage_path);
    if (paths.length) await supabase.storage.from(photoBucket).remove(paths).catch(() => {});
    throw error;
  }
}

async function handleDeleteVendor(vendorId) {
  const vendor = vendorFor(vendorId);
  if (!vendor || !confirm(`${vendor.name} 업체와 등록 사진을 모두 삭제할까요?`)) return;
  const paths = (vendor.photoIds || []).map((id) => state.photoRecords.get(id)?.storagePath).filter(Boolean);
  if (paths.length) throwIfError(await supabase.storage.from(photoBucket).remove(paths));
  throwIfError(await supabase.from("vendors")
    .delete()
    .eq("wedding_id", state.profile.weddingId)
    .eq("id", vendorId));
  state.selectedVendorId = null;
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("업체가 삭제되었습니다.");
}

async function toggleFavorite(vendorId) {
  const vendor = vendorFor(vendorId);
  if (!vendor) return;
  throwIfError(await supabase.from("vendors").update({ favorite: !vendor.favorite })
    .eq("wedding_id", state.profile.weddingId)
    .eq("id", vendorId));
  vendor.favorite = !vendor.favorite;
  render();
}

async function handleAddCategory(form) {
  const data = Object.fromEntries(new FormData(form));
  const name = String(data.name || "").trim();
  if (state.categories.some((category) => category.name === name)) throw new Error("같은 이름의 카테고리가 있습니다.");
  throwIfError(await supabase.from("vendor_categories").insert({
    wedding_id: state.profile.weddingId,
    id: `category-${crypto.randomUUID()}`,
    name,
    color: safeColor(data.color),
    icon: "folder",
    sort_order: state.categories.length
  }));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("카테고리가 추가되었습니다.");
}

async function handleDeleteCategory(categoryId) {
  const category = categoryFor(categoryId);
  const count = state.vendors.filter((vendor) => vendor.categoryId === categoryId).length;
  if (category.locked || count || !confirm(`${category.name} 카테고리를 삭제할까요?`)) return;
  throwIfError(await supabase.from("vendor_categories")
    .delete()
    .eq("wedding_id", state.profile.weddingId)
    .eq("id", categoryId));
  if (state.selectedCategory === categoryId) state.selectedCategory = "all";
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
}

function clearPendingPhotoUrls() {
  state.pendingPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  state.pendingPhotoUrls = [];
}

function previewSelectedPhotos(input) {
  clearPendingPhotoUrls();
  const files = [...input.files].slice(0, 20);
  const container = input.closest(".photo-uploader").querySelector(".pending-photo-preview");
  state.pendingPhotoUrls = files.map((file) => URL.createObjectURL(file));
  container.innerHTML = state.pendingPhotoUrls.map((url, index) => `<span><img src="${url}" alt="추가할 사진 ${index + 1}" /></span>`).join("");
}

function updateVendorFeed() {
  const feed = document.querySelector(".vendor-feed");
  const count = document.querySelector("[data-vendor-result-count]");
  if (!feed || !count) return;
  feed.innerHTML = renderVendorFeed();
  count.textContent = filteredVendors().length;
  activateIcons();
}

function moveVendorPhoto(direction) {
  const vendor = vendorFor(state.selectedVendorId);
  const count = (vendor?.photoIds || []).filter((id) => state.photoUrls.has(id)).length;
  if (!count) return;
  state.selectedVendorPhotoIndex = (state.selectedVendorPhotoIndex + direction + count) % count;
  render();
}

function movePresentationPhoto(direction) {
  const vendor = vendorFor(state.presentationVendorId);
  const count = (vendor?.photoIds || []).filter((id) => state.photoUrls.has(id)).length;
  if (!count) return;
  state.presentationPhotoIndex = (state.presentationPhotoIndex + direction + count) % count;
  render();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportAllData() {
  const photos = [];
  for (const record of state.photoRecords.values()) {
    const photoUrl = state.photoUrls.get(record.id);
    if (!photoUrl) continue;
    const response = await fetch(photoUrl);
    if (!response.ok) throw new Error("백업할 사진을 불러오지 못했습니다.");
    photos.push({
      id: record.id,
      vendorId: record.vendorId,
      name: record.name,
      createdAt: record.createdAt,
      dataUrl: await blobToDataUrl(await response.blob())
    });
  }
  const payload = {
    app: "Marryday Planner",
    version: 4,
    exportedAt: new Date().toISOString(),
    data: {
      wedding: state.wedding,
      dayNotes: [...state.dayNotes.values()],
      weekNotes: [...state.weekNotes.values()],
      categories: state.categories,
      vendors: state.vendors,
      photos
    }
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `marryday-backup-${dateKey(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  notify("전체 데이터 백업을 만들었습니다.");
}

function normalizeBackupPayload(payload) {
  if (payload?.version === 4 && payload.data) return payload.data;
  if (!payload?.store?.weddings) throw new Error("Marryday 백업 파일 형식이 아닙니다.");
  const legacyWeddingId = payload.store.weddings.wedding ? "wedding" : Object.keys(payload.store.weddings)[0];
  if (!legacyWeddingId) throw new Error("백업 파일에 웨딩 정보가 없습니다.");
  return {
    wedding: payload.store.weddings[legacyWeddingId],
    dayNotes: Object.entries(payload.store.dayNotes?.[legacyWeddingId] || {}).map(([id, note]) => ({ id, ...note })),
    weekNotes: Object.entries(payload.store.weekNotes?.[legacyWeddingId] || {}).map(([id, note]) => ({ id, ...note })),
    categories: payload.store.categories?.[legacyWeddingId] || [],
    vendors: Object.values(payload.store.vendors?.[legacyWeddingId] || {}),
    photos: (payload.photos || []).map((photo) => ({ ...photo, vendorId: photo.vendorId }))
  };
}

async function importAllData(file) {
  const payload = JSON.parse(await file.text());
  const backup = normalizeBackupPayload(payload);
  if (!confirm("현재 데이터를 백업 파일의 내용으로 교체할까요?")) return;
  const currentWeddingId = state.profile.weddingId;
  const oldPaths = [...state.photoRecords.values()].map((record) => record.storagePath).filter(Boolean);
  if (oldPaths.length) throwIfError(await supabase.storage.from(photoBucket).remove(oldPaths));

  throwIfError(await supabase.from("vendors").delete().eq("wedding_id", currentWeddingId));
  throwIfError(await supabase.from("vendor_categories").delete().eq("wedding_id", currentWeddingId));
  throwIfError(await supabase.from("day_notes").delete().eq("wedding_id", currentWeddingId));
  throwIfError(await supabase.from("week_notes").delete().eq("wedding_id", currentWeddingId));
  throwIfError(await supabase.from("weddings").update({
    groom_name: backup.wedding?.groomName || "신랑",
    bride_name: backup.wedding?.brideName || "신부",
    wedding_date: backup.wedding?.weddingDate || defaultWeddingDate(),
    planner_name: backup.wedding?.plannerName || "관리자"
  }).eq("id", currentWeddingId));

  const categories = backup.categories?.length ? backup.categories : defaultCategories();
  throwIfError(await supabase.from("vendor_categories").insert(
    categories.map((category, index) => categoryRow(category, currentWeddingId, index))
  ));
  if (backup.vendors?.length) {
    throwIfError(await supabase.from("vendors").insert(
      backup.vendors.map((vendor) => vendorRow(vendor, currentWeddingId))
    ));
  }
  if (backup.dayNotes?.length) {
    throwIfError(await supabase.from("day_notes").insert(backup.dayNotes.map((note) => ({
      wedding_id: currentWeddingId,
      note_date: note.id || note.date,
      title: note.title || "",
      body: note.text || "",
      updated_by: state.authUser.uid
    }))));
  }
  if (backup.weekNotes?.length) {
    throwIfError(await supabase.from("week_notes").insert(backup.weekNotes.map((note) => ({
      wedding_id: currentWeddingId,
      week_start: note.id || note.weekStart,
      body: note.text || "",
      updated_by: state.authUser.uid
    }))));
  }

  const vendorIds = new Set((backup.vendors || []).map((vendor) => vendor.id));
  const photoRows = [];
  const photoOrder = new Map();
  for (const photo of backup.photos || []) {
    if (!photo.dataUrl || !photo.id || !vendorIds.has(photo.vendorId)) continue;
    const order = photoOrder.get(photo.vendorId) || 0;
    photoOrder.set(photo.vendorId, order + 1);
    const storagePath = `${currentWeddingId}/${photo.vendorId}/${photo.id}.jpg`;
    const blob = await fetch(photo.dataUrl).then((response) => response.blob());
    throwIfError(await supabase.storage.from(photoBucket).upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert: true
    }));
    photoRows.push({
      wedding_id: currentWeddingId,
      id: photo.id,
      vendor_id: photo.vendorId,
      storage_path: storagePath,
      file_name: photo.name || "photo.jpg",
      sort_order: order,
      created_at: photo.createdAt || new Date().toISOString()
    });
  }
  if (photoRows.length) throwIfError(await supabase.from("vendor_photos").insert(photoRows));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("백업 데이터가 복원되었습니다.");
}

function buildPosterSvg() {
  const width = 1200;
  const height = 1700;
  const margin = 54;
  const colWidth = 342;
  const rowHeight = 300;
  const todayKey = dateKey(new Date());
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;
  svg += `<text x="${margin}" y="58" font-size="34" font-weight="800" font-family="Arial, sans-serif" fill="#171916">WEDDING CALENDAR</text>`;
  svg += `<text x="${width - margin}" y="58" text-anchor="end" font-size="30" font-weight="800" font-family="Arial, sans-serif" fill="#171916">${escapeHtml(calendarYearLabel())}</text>`;
  svg += `<text x="${width - margin}" y="102" text-anchor="end" font-size="18" font-family="Arial, sans-serif" fill="#171916">${escapeHtml(state.wedding?.groomName || "신랑")} · ${escapeHtml(state.wedding?.brideName || "신부")} / ${escapeHtml(state.wedding?.plannerName || "")}</text>`;
  svg += `<line x1="${margin}" y1="116" x2="${width - margin}" y2="116" stroke="#c9cbc6"/>`;
  monthsFromToday().forEach((month, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (colWidth + 33);
    const y = 155 + row * rowHeight;
    svg += `<text x="${x}" y="${y}" font-size="26" font-weight="800" font-family="Arial, sans-serif" fill="#171916">${month.getMonth() + 1}</text>`;
    weekdays.forEach((day, dayIndex) => { svg += `<text x="${x + 48 + dayIndex * 25}" y="${y}" text-anchor="middle" font-size="12" font-weight="800" font-family="Arial, sans-serif" fill="#171916">${day}</text>`; });
    getMonthRows(month).forEach((week, weekIndex) => {
      const cy = y + 28 + weekIndex * 34;
      week.days.forEach((date, dayIndex) => {
        if (!date) return;
        const cx = x + 48 + dayIndex * 25;
        const key = dateKey(date);
        if (key === todayKey) svg += `<circle cx="${cx}" cy="${cy - 4}" r="12" fill="#c44958"/>`;
        svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" font-weight="${state.dayNotes.has(key) ? "800" : "500"}" font-family="Arial, sans-serif" fill="${key === todayKey ? "#ffffff" : state.dayNotes.has(key) ? "#167d75" : "#171916"}">${date.getDate()}</text>`;
      });
      const lineY = cy - 1;
      const text = state.weekNotes.get(week.key)?.text || "";
      svg += `<line x1="${x + 218}" y1="${lineY}" x2="${x + colWidth}" y2="${lineY}" stroke="#9da19a" stroke-dasharray="2 4"/>`;
      if (text) svg += `<text x="${x + colWidth - 4}" y="${lineY - 5}" text-anchor="end" font-size="16" font-family="Arial, sans-serif" fill="#171916">${escapeHtml(text)}</text>`;
    });
  });
  return `${svg}</svg>`;
}

async function downloadPng() {
  const blob = new Blob([buildPosterSvg()], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1700;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = `wedding-calendar-${dateKey(new Date())}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.append(link);
    link.click();
    link.remove();
    notify("캘린더 이미지를 만들었습니다.");
  };
  image.onerror = () => { URL.revokeObjectURL(url); notify("이미지를 만들지 못했습니다."); };
  image.src = url;
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  try {
    const action = form.dataset.action;
    if (action === "login") await handleLogin(form);
    if (action === "save-wedding") await handleSaveWedding(form);
    if (action === "create-account") await handleCreateAccount(form);
    if (action === "change-password") await handleChangePassword(form);
    if (action === "save-day") await handleSaveDay(form);
    if (action === "save-vendor") await handleSaveVendor(form);
    if (action === "add-category") await handleAddCategory(form);
  } catch (error) {
    if (form.dataset.action === "login") showLoginError(error.message);
    else {
      alert(error.message || "처리 중 오류가 발생했습니다.");
      const button = form.querySelector('button[type="submit"]');
      if (button) { button.disabled = false; button.textContent = "저장"; }
    }
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  try {
  if (action === "logout") await logoutUser();
  if (action === "navigate") {
    state.activeView = target.dataset.view;
    state.selectedVendorId = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (action === "select-day") { state.selectedDate = target.dataset.date; render(); }
  if (action === "close-day-editor") { state.selectedDate = null; render(); }
  if (action === "delete-day") await handleDeleteDay();
  if (action === "regen-password") target.closest("form").querySelector('[name="password"]').value = generatePassword();
  if (action === "print") { renderPrintSheet(); window.print(); }
  if (action === "png") await downloadPng();
  if (action === "set-category") { state.selectedCategory = target.dataset.category; render(); }
  if (action === "new-vendor") { state.editingVendorId = "new"; state.selectedVendorId = null; render(); }
  if (action === "open-vendor") { state.selectedVendorId = target.dataset.vendor; state.selectedVendorPhotoIndex = 0; state.vendorDetailTab = "overview"; render(); }
  if (action === "close-vendor-detail") { state.selectedVendorId = null; render(); }
  if (action === "set-vendor-detail-tab") { state.vendorDetailTab = target.dataset.tab; render(); }
  if (action === "edit-vendor") { state.editingVendorId = target.dataset.vendor; state.selectedVendorId = null; render(); }
  if (action === "close-vendor-editor") { clearPendingPhotoUrls(); state.editingVendorId = null; render(); }
  if (action === "add-package-row") {
    target.closest("form").querySelector("[data-package-list]").insertAdjacentHTML("beforeend", renderPackageEditorRow());
    activateIcons();
  }
  if (action === "add-fee-row") {
    target.closest("form").querySelector("[data-fee-list]").insertAdjacentHTML("beforeend", renderExtraFeeEditorRow());
    activateIcons();
  }
  if (action === "remove-repeat-row") target.closest("[data-repeat-row]")?.remove();
  if (action === "toggle-favorite") await toggleFavorite(target.dataset.vendor);
  if (action === "vendor-photo-prev") moveVendorPhoto(-1);
  if (action === "vendor-photo-next") moveVendorPhoto(1);
  if (action === "select-vendor-photo") { state.selectedVendorPhotoIndex = Number(target.dataset.index); render(); }
  if (action === "delete-vendor") await handleDeleteVendor(target.dataset.vendor);
  if (action === "open-category-manager") { state.categoryManagerOpen = true; render(); }
  if (action === "close-category-manager") { state.categoryManagerOpen = false; render(); }
  if (action === "close-issued-account") { state.issuedAccount = null; render(); }
  if (action === "delete-category") await handleDeleteCategory(target.dataset.category);
  if (action === "open-presentation") { state.presentationVendorId = target.dataset.vendor; state.presentationPhotoIndex = state.selectedVendorPhotoIndex; state.selectedVendorId = null; render(); }
  if (action === "close-presentation") { state.presentationVendorId = null; render(); }
  if (action === "presentation-prev") movePresentationPhoto(-1);
  if (action === "presentation-next") movePresentationPhoto(1);
  if (action === "delete-member") await handleDeleteMember(target.dataset.member);
  if (action === "export-data") await exportAllData();
  if (action === "import-data") document.querySelector('[data-action="data-import-file"]').click();
  } catch (error) {
    alert(error.message || "처리 중 오류가 발생했습니다.");
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target?.dataset?.action === "week-note" && plannerMode()) queueWeekSave(target);
  if (target?.dataset?.action === "vendor-search") { state.vendorQuery = target.value; updateVendorFeed(); }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  try {
    if (target?.dataset?.action === "vendor-photos") previewSelectedPhotos(target);
    if (target?.dataset?.action === "data-import-file" && target.files?.[0]) await importAllData(target.files[0]);
  } catch (error) {
    alert(error.message || "파일을 처리하지 못했습니다.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (state.presentationVendorId) state.presentationVendorId = null;
    else if (state.editingVendorId) { clearPendingPhotoUrls(); state.editingVendorId = null; }
    else if (state.selectedVendorId) state.selectedVendorId = null;
    else if (state.categoryManagerOpen) state.categoryManagerOpen = false;
    else if (state.selectedDate) state.selectedDate = null;
    else return;
    render();
  }
  if (state.presentationVendorId && event.key === "ArrowLeft") movePresentationPhoto(-1);
  if (state.presentationVendorId && event.key === "ArrowRight") movePresentationPhoto(1);
});

async function boot() {
  state.loading = true;
  render();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await hydrateRemoteState(data.session.user);
    else state = freshState();
  } catch (error) {
    await supabase.auth.signOut().catch(() => {});
    state = freshState();
    state.error = error.message === "LOGIN_REVOKED"
      ? "로그인 권한이 만료되었습니다. 관리자에게 문의하세요."
      : "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
  } finally {
    render();
  }
}

boot();
