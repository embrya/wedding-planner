import { createSignupClient, loginEmail, supabase } from "./supabase-client.js";

const appRoot = document.querySelector("#app");
const printRoot = document.querySelector("#print-root");

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const roleLabels = { planner: "플래너", groom: "신랑", bride: "신부" };
const photoBucket = "vendor-media";
const photoOptimization = {
  maxEdge: 1920,
  minEdge: 1440,
  targetBytes: 1.2 * 1024 * 1024,
  maxSourceBytes: 30 * 1024 * 1024,
  qualitySteps: [0.88, 0.84, 0.8, 0.76]
};
const vendorStatuses = ["관심", "상담 예정", "견적 받음", "비교 중", "계약 완료", "보류"];
const plannerNavItems = [
  { view: "overview", label: "일정", icon: "calendar-range" },
  { view: "couples", label: "웨딩", icon: "users-round" },
  { view: "vendors", label: "레퍼런스", icon: "images" },
  { view: "settings", label: "설정", icon: "settings-2" }
];
const sampleVendorImages = {
  "sample-dress": "./assets/vendor-dress-sample.jpg",
  "sample-venue": "./assets/vendor-venue-sample.jpg",
  "sample-jewelry": "./assets/vendor-jewelry-sample.jpg"
};
const spreadsheetLibraryUrl = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
const spreadsheetLibraryIntegrity = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
const importedCategoryPalette = ["#39756c", "#c75a6a", "#5f7094", "#a67b33", "#8a6074", "#3c7f93"];
const vendorImportColumns = [
  { key: "name", label: "업체명", aliases: ["업체", "상호명", "vendorname"], required: true },
  { key: "category", label: "카테고리", aliases: ["분류", "업종", "category"], required: true },
  { key: "status", label: "진행상태", aliases: ["상태", "status"] },
  { key: "price", label: "대표가격", aliases: ["기본가격", "가격", "price"] },
  { key: "description", label: "한줄소개", aliases: ["소개", "설명", "description"] },
  { key: "contact", label: "연락처", aliases: ["전화번호", "전화", "contact"] },
  { key: "address", label: "주소", aliases: ["위치", "address"] },
  { key: "instagram", label: "인스타그램", aliases: ["인스타", "instagram"] },
  { key: "website", label: "웹사이트", aliases: ["홈페이지", "url", "website"] },
  { key: "tags", label: "태그", aliases: ["키워드", "tags"] },
  ...Array.from({ length: 3 }, (_, index) => {
    const number = index + 1;
    return [
      { key: `package${number}Name`, label: `상품${number} 이름` },
      { key: `package${number}Price`, label: `상품${number} 금액` },
      { key: `package${number}Details`, label: `상품${number} 포함항목` }
    ];
  }).flat(),
  ...Array.from({ length: 3 }, (_, index) => {
    const number = index + 1;
    return [
      { key: `fee${number}Name`, label: `추가비용${number} 항목` },
      { key: `fee${number}Price`, label: `추가비용${number} 금액` }
    ];
  }).flat(),
  { key: "discountBenefits", label: "할인혜택", aliases: ["할인", "혜택"] },
  { key: "promotionPeriod", label: "프로모션기간", aliases: ["프로모션"] },
  { key: "updatedAtLabel", label: "정보업데이트일", aliases: ["업데이트일", "확인일"] },
  { key: "requiredMeeting", label: "사전미팅필수", aliases: ["미팅필수"] },
  { key: "scheduleInfo", label: "일정진행안내", aliases: ["일정안내", "진행안내"] },
  { key: "reservationPolicy", label: "예약조건", aliases: ["예약정책"] },
  { key: "operationPolicy", label: "변경취소운영정책", aliases: ["변경취소정책", "운영정책"] },
  { key: "contractTerms", label: "계약조건", aliases: ["계약정책"] },
  { key: "commissionRate", label: "수수료율", aliases: ["수수료"] },
  { key: "commissionTerms", label: "정산조건", aliases: ["정산"] },
  { key: "sourceMemo", label: "자료출처상담기록", aliases: ["자료출처", "상담기록"] },
  { key: "plannerNotes", label: "플래너메모", aliases: ["내부메모"] },
  { key: "favorite", label: "즐겨찾기", aliases: ["저장", "favorite"] }
];

function freshState() {
  return {
    authUser: null,
    profile: null,
    weddings: [],
    currentWeddingId: null,
    wedding: null,
    members: [],
    memberCounts: new Map(),
    dayNotes: new Map(),
    weekNotes: new Map(),
    aggregateDayNotes: [],
    aggregateWeekNotes: [],
    categories: [],
    vendors: [],
    vendorSelections: [],
    photoUrls: new Map(),
    photoRecords: new Map(),
    activeView: "overview",
    coupleStatus: "active",
    coupleQuery: "",
    coupleQuickFilter: "all",
    coupleSort: "next",
    weddingSwitcherOpen: false,
    weddingSwitchQuery: "",
    recentWeddingIds: [],
    selectedCategory: "all",
    vendorQuery: "",
    vendorFavoriteOnly: false,
    vendorSort: "recent",
    selectedDate: null,
    aggregateDate: null,
    aggregateWeekKey: null,
    selectedVendorId: null,
    selectedVendorPhotoIndex: 0,
    vendorDetailTab: "overview",
    editingVendorId: null,
    vendorImportOpen: false,
    vendorImportPreview: null,
    vendorImportBusy: false,
    categoryManagerOpen: false,
    weddingCreatorOpen: false,
    selectionEditor: null,
    issuedAccount: null,
    presentationPreviewVendorId: null,
    presentationShowPrice: true,
    presentationShowTerms: true,
    presentationVendorId: null,
    presentationPhotoIndex: 0,
    pendingPhotoUrls: [],
    pendingPhotoOptimizations: new Map(),
    pendingPhotoGeneration: 0,
    loading: false,
    error: ""
  };
}

let state = freshState();
let weekTimer;
let modalReturnSelector = "";
let spreadsheetLibraryPromise;

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

function ensureSpreadsheetLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!spreadsheetLibraryPromise) {
    spreadsheetLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = spreadsheetLibraryUrl;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.integrity = spreadsheetLibraryIntegrity;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("엑셀 모듈을 초기화하지 못했습니다."));
      script.onerror = () => reject(new Error("엑셀 모듈을 불러오지 못했습니다. 네트워크를 확인하세요."));
      document.head.append(script);
    }).catch((error) => {
      spreadsheetLibraryPromise = null;
      throw error;
    });
  }
  return spreadsheetLibraryPromise;
}

function normalizeSpreadsheetKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9가-힣]/gi, "");
}

function spreadsheetText(value) {
  return String(value ?? "").trim();
}

function hasSpreadsheetValue(row, key) {
  return spreadsheetText(row[key]) !== "";
}

function parseSpreadsheetBoolean(value) {
  const normalized = normalizeSpreadsheetKey(value);
  if (!normalized) return { present: false, value: false, error: "" };
  if (["y", "yes", "true", "1", "예", "필수", "사용", "o"].includes(normalized)) return { present: true, value: true, error: "" };
  if (["n", "no", "false", "0", "아니오", "선택", "미사용", "x"].includes(normalized)) return { present: true, value: false, error: "" };
  return { present: true, value: false, error: "Y 또는 N으로 입력하세요." };
}

function parseSpreadsheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { present: true, value: dateKey(value), error: "" };
  const text = spreadsheetText(value);
  if (!text) return { present: false, value: "", error: "" };
  const parts = text.match(/\d+/g) || [];
  if (parts.length !== 3) return { present: true, value: "", error: "YYYY-MM-DD 형식으로 입력하세요." };
  let year;
  let month;
  let day;
  if (parts[0].length === 4) [year, month, day] = parts.map(Number);
  else if (parts[2].length === 4) [month, day, year] = parts.map(Number);
  else if (parts[2].length === 2) {
    [month, day] = parts.map(Number);
    year = 2000 + Number(parts[2]);
  }
  const date = new Date(year, month - 1, day);
  if (!year || year < 1900 || !month || !day || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { present: true, value: "", error: "유효한 날짜가 아닙니다." };
  }
  return { present: true, value: dateKey(date), error: "" };
}

function vendorImportHeaderLookup() {
  const lookup = new Map();
  vendorImportColumns.forEach((column) => {
    [column.label, column.key, ...(column.aliases || [])].forEach((alias) => lookup.set(normalizeSpreadsheetKey(alias), column.key));
  });
  return lookup;
}

function categoryForImport(value) {
  const normalized = normalizeSpreadsheetKey(value);
  return state.categories.find((category) => normalizeSpreadsheetKey(category.name) === normalized || normalizeSpreadsheetKey(category.id) === normalized);
}

function vendorForImportName(value) {
  const normalized = normalizeSpreadsheetKey(value);
  return state.vendors.find((vendor) => normalizeSpreadsheetKey(vendor.name) === normalized);
}

async function readVendorSpreadsheet(file) {
  if (!file) throw new Error("업로드할 파일을 선택하세요.");
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("XLSX, XLS 또는 CSV 파일만 업로드할 수 있습니다.");
  if (file.size > 10 * 1024 * 1024) throw new Error("파일은 10MB 이하로 준비하세요.");
  const XLSX = await ensureSpreadsheetLibrary();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => name.includes("업체 일괄등록")) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("읽을 수 있는 시트가 없습니다.");
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true, dateNF: "yyyy-mm-dd" });
  const lookup = vendorImportHeaderLookup();
  const requiredKeys = vendorImportColumns.filter((column) => column.required).map((column) => column.key);
  const headerIndex = matrix.slice(0, 10).findIndex((row) => {
    const keys = new Set((row || []).map((value) => lookup.get(normalizeSpreadsheetKey(value))).filter(Boolean));
    return requiredKeys.every((key) => keys.has(key));
  });
  if (headerIndex < 0) throw new Error("첫 10행 안에 업체명과 카테고리 열이 필요합니다.");
  const mappedHeaders = matrix[headerIndex].map((value) => lookup.get(normalizeSpreadsheetKey(value)) || "");
  const duplicateHeaders = mappedHeaders.filter((key, index) => key && mappedHeaders.indexOf(key) !== index);
  if (duplicateHeaders.length) throw new Error("같은 의미의 열이 중복되어 있습니다.");
  const rows = matrix.slice(headerIndex + 1).map((values, index) => {
    const cells = Array.isArray(values) ? values : [];
    const row = { rowNumber: headerIndex + index + 2 };
    mappedHeaders.forEach((key, columnIndex) => { if (key) row[key] = cells[columnIndex]; });
    return row;
  }).filter((row) => Object.entries(row).some(([key, value]) => key !== "rowNumber" && spreadsheetText(value)));
  if (!rows.length) throw new Error("등록할 업체 행이 없습니다.");
  if (rows.length > 2000) throw new Error("한 번에 최대 2,000개 업체까지 등록할 수 있습니다.");
  return { sheetName, rows };
}

function buildVendorImportPreview(fileName, sheetName, sourceRows) {
  const nameCounts = new Map();
  sourceRows.forEach((row) => {
    const key = normalizeSpreadsheetKey(row.name);
    if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  });
  const simpleFields = [
    "price", "description", "contact", "address", "instagram", "website", "discountBenefits", "promotionPeriod",
    "scheduleInfo", "reservationPolicy", "operationPolicy", "contractTerms", "commissionRate", "commissionTerms", "sourceMemo", "plannerNotes"
  ];
  const rows = sourceRows.map((source) => {
    const errors = [];
    const name = spreadsheetText(source.name);
    const categoryInput = spreadsheetText(source.category);
    if (!name) errors.push("업체명이 없습니다.");
    if (!categoryInput) errors.push("카테고리가 없습니다.");
    if (name && nameCounts.get(normalizeSpreadsheetKey(name)) > 1) errors.push("파일 안에 같은 업체명이 중복되었습니다.");
    const existing = name ? vendorForImportName(name) : null;
    const category = categoryInput ? categoryForImport(categoryInput) : null;
    const patch = {};
    simpleFields.forEach((key) => { if (hasSpreadsheetValue(source, key)) patch[key] = spreadsheetText(source[key]); });
    if (patch.website && !safeUrl(patch.website)) errors.push("웹사이트 주소가 올바르지 않습니다.");
    if (hasSpreadsheetValue(source, "status")) {
      const status = spreadsheetText(source.status);
      if (!vendorStatuses.includes(status)) errors.push(`진행상태는 ${vendorStatuses.join(", ")} 중 하나여야 합니다.`);
      else patch.status = status;
    }
    if (hasSpreadsheetValue(source, "tags")) patch.tags = spreadsheetText(source.tags).split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    const updatedDate = parseSpreadsheetDate(source.updatedAtLabel);
    if (updatedDate.error) errors.push(`정보업데이트일: ${updatedDate.error}`);
    else if (updatedDate.present) patch.updatedAtLabel = updatedDate.value;
    [["requiredMeeting", "사전미팅필수"], ["favorite", "즐겨찾기"]].forEach(([key, label]) => {
      const parsed = parseSpreadsheetBoolean(source[key]);
      if (parsed.error) errors.push(`${label}: ${parsed.error}`);
      else if (parsed.present) patch[key] = parsed.value;
    });
    const packages = [];
    let packagesTouched = false;
    for (let index = 1; index <= 3; index += 1) {
      const values = {
        name: spreadsheetText(source[`package${index}Name`]),
        price: spreadsheetText(source[`package${index}Price`]),
        details: spreadsheetText(source[`package${index}Details`])
      };
      if (Object.values(values).some(Boolean)) {
        packagesTouched = true;
        packages.push({ ...values, name: values.name || `상품 ${index}` });
      }
    }
    if (packagesTouched) patch.packages = packages;
    const extraFees = [];
    let feesTouched = false;
    for (let index = 1; index <= 3; index += 1) {
      const values = { name: spreadsheetText(source[`fee${index}Name`]), price: spreadsheetText(source[`fee${index}Price`]) };
      if (Object.values(values).some(Boolean)) {
        feesTouched = true;
        extraFees.push({ ...values, name: values.name || `추가 비용 ${index}` });
      }
    }
    if (feesTouched) patch.extraFees = extraFees;
    return {
      rowNumber: source.rowNumber,
      name,
      categoryInput,
      categoryId: category?.id || "",
      categoryName: category?.name || categoryInput,
      newCategory: Boolean(categoryInput && !category),
      mode: existing ? "update" : "new",
      existingId: existing?.id || "",
      patch,
      errors
    };
  });
  const validRows = rows.filter((row) => !row.errors.length);
  return {
    fileName,
    sheetName,
    rows,
    validCount: validRows.length,
    invalidCount: rows.length - validRows.length,
    newCount: validRows.filter((row) => row.mode === "new").length,
    updateCount: validRows.filter((row) => row.mode === "update").length,
    newCategories: [...new Set(validRows.filter((row) => row.newCategory).map((row) => row.categoryName))]
  };
}

async function handleVendorSpreadsheet(file) {
  state.vendorImportBusy = true;
  state.vendorImportPreview = null;
  render();
  try {
    const { sheetName, rows } = await readVendorSpreadsheet(file);
    state.vendorImportPreview = buildVendorImportPreview(file.name, sheetName, rows);
  } finally {
    state.vendorImportBusy = false;
    render();
    focusActiveDialog('[data-action="vendor-import-file"]');
  }
}

async function downloadVendorImportTemplate() {
  const XLSX = await ensureSpreadsheetLibrary();
  const headers = vendorImportColumns.map((column) => column.label);
  const workbook = XLSX.utils.book_new();
  const inputSheet = XLSX.utils.aoa_to_sheet([headers]);
  inputSheet["!cols"] = vendorImportColumns.map((column) => ({ wch: column.key.includes("Details") || ["description", "contractTerms", "plannerNotes", "sourceMemo"].includes(column.key) ? 28 : Math.max(12, column.label.length + 4) }));
  inputSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  XLSX.utils.book_append_sheet(workbook, inputSheet, "업체 일괄등록");
  const example = {
    name: "라온 가든홀", category: "웨딩홀", status: "견적 받음", price: "식대 9만원 · 대관 600만원",
    description: "채광이 좋은 단독홀", contact: "02-0000-0000", address: "서울 강남구", instagram: "@sample",
    tags: "단독홀, 채광, 250명", package1Name: "토요일 점심", package1Price: "식대 9만원", package1Details: "보증 250명\n기본 꽃장식 포함",
    fee1Name: "생화 업그레이드", fee1Price: "별도 견적", requiredMeeting: "Y", favorite: "N", updatedAtLabel: dateKey(new Date())
  };
  const exampleSheet = XLSX.utils.aoa_to_sheet([headers, vendorImportColumns.map((column) => example[column.key] || "")]);
  exampleSheet["!cols"] = inputSheet["!cols"];
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "입력 예시");
  const guideSheet = XLSX.utils.aoa_to_sheet([
    ["항목", "입력값"],
    ["필수 열", "업체명, 카테고리"],
    ["진행상태", vendorStatuses.join(", ")],
    ["Y/N 열", "사전미팅필수, 즐겨찾기"],
    ["기존 업체", "같은 업체명은 입력된 셀만 업데이트"],
    ["새 카테고리", "카테고리명으로 자동 생성"],
    ["태그", "쉼표로 구분, 최대 12개"],
    ["사진", "업체 등록 후 레퍼런스 화면에서 추가"]
  ]);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, "코드표");
  XLSX.writeFile(workbook, "marryday-vendor-import-template.xlsx", { compression: true });
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

const photoObjectStore = {
  async signedUrls(paths, expiresIn = 60 * 60 * 6) {
    return throwIfError(await supabase.storage.from(photoBucket).createSignedUrls(paths, expiresIn));
  },
  async upload(path, blob, options = {}) {
    return throwIfError(await supabase.storage.from(photoBucket).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: Boolean(options.upsert)
    }));
  },
  async remove(paths) {
    if (!paths.length) return [];
    return throwIfError(await supabase.storage.from(photoBucket).remove(paths));
  }
};

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

function authPassword(loginId, password) {
  return loginId === "admin" && password === "admin" ? "admin!" : password;
}

function categoryRow(category, plannerId, legacyWeddingId, index = 0) {
  return {
    planner_id: plannerId,
    wedding_id: legacyWeddingId || null,
    id: category.id,
    name: category.name,
    color: safeColor(category.color),
    icon: category.icon || "folder",
    locked: Boolean(category.locked),
    sort_order: index
  };
}

function vendorRow(vendor, plannerId, legacyWeddingId) {
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
    planner_id: plannerId,
    wedding_id: legacyWeddingId || null,
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

async function seedDefaultContent(plannerId, legacyWeddingId, categories, vendors) {
  let seededCategories = categories;
  let seededVendors = vendors;
  const firstSetup = !seededCategories.length;
  if (!seededCategories.length) {
    const rows = defaultCategories().map((category, index) => categoryRow(category, plannerId, legacyWeddingId, index));
    throwIfError(await supabase.from("vendor_categories").insert(rows));
    seededCategories = rows;
  }
  if (firstSetup && !seededVendors.length) {
    const rows = Object.values(defaultVendors()).map((vendor) => vendorRow(vendor, plannerId, legacyWeddingId));
    throwIfError(await supabase.from("vendors").insert(rows));
    seededVendors = rows;
  }
  return { categories: seededCategories, vendors: seededVendors };
}

function weddingFromRow(row) {
  return {
    id: row.id,
    groomName: row.groom_name,
    brideName: row.bride_name,
    weddingDate: row.wedding_date,
    plannerName: row.planner_name,
    plannerId: row.planner_id,
    color: safeColor(row.color),
    status: row.status || "active",
    completedAt: row.completed_at
  };
}

function dayNoteFromRow(row) {
  return {
    id: row.note_date,
    date: row.note_date,
    weddingId: row.wedding_id,
    title: row.title,
    text: row.body,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

function weekNoteFromRow(row) {
  return {
    id: row.week_start,
    weekStart: row.week_start,
    weddingId: row.wedding_id,
    text: row.body,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

function calendarRange() {
  const months = monthsFromToday();
  return {
    start: dateKey(months[0]),
    end: dateKey(new Date(months.at(-1).getFullYear(), months.at(-1).getMonth() + 1, 0))
  };
}

async function hydrateRemoteState(user, options = {}) {
  const profileResult = await supabase
    .from("profiles")
    .select("id,wedding_id,login_id,role,display_name")
    .eq("id", user.id)
    .single();
  if (profileResult.error?.code === "PGRST116") throw new Error("LOGIN_REVOKED");
  const profile = throwIfError(profileResult);
  const range = calendarRange();
  const planner = profile.role === "planner";
  let weddings = [];
  let memberships = [];
  let memberProfiles = [];
  let dayNotes = [];
  let weekNotes = [];
  let categories = [];
  let vendors = [];
  let photos = [];
  let selections = [];
  let currentWeddingId = null;
  let accountRole = profile.role;

  if (planner) {
    const [weddingResult, membershipResult, profilesResult, dayResult, weekResult, categoryResult, vendorResult, photoResult, selectionResult] = await Promise.all([
      supabase.from("weddings").select("id,groom_name,bride_name,wedding_date,planner_name,planner_id,color,status,completed_at").order("wedding_date"),
      supabase.from("wedding_members").select("wedding_id,user_id,role,created_at"),
      supabase.from("profiles").select("id,login_id,role,display_name,created_at").order("created_at"),
      supabase.from("day_notes").select("wedding_id,note_date,title,body,updated_by,updated_at").gte("note_date", range.start).lte("note_date", range.end),
      supabase.from("week_notes").select("wedding_id,week_start,body,updated_by,updated_at").gte("week_start", range.start).lte("week_start", range.end),
      supabase.from("vendor_categories").select("id,name,color,icon,locked,sort_order").order("sort_order"),
      supabase.from("vendors").select("id,category_id,name,status,favorite,data,created_at,updated_at").order("updated_at", { ascending: false }),
      supabase.from("vendor_photos").select("id,vendor_id,storage_path,file_name,sort_order,created_at").order("sort_order"),
      supabase.from("wedding_vendor_selections").select("wedding_id,vendor_id,status,quoted_price,contract_terms,planner_note,created_at,updated_at").order("updated_at", { ascending: false })
    ]);
    weddings = (throwIfError(weddingResult) || []).map(weddingFromRow);
    memberships = throwIfError(membershipResult) || [];
    memberProfiles = throwIfError(profilesResult) || [];
    dayNotes = (throwIfError(dayResult) || []).map(dayNoteFromRow);
    weekNotes = (throwIfError(weekResult) || []).map(weekNoteFromRow);
    categories = throwIfError(categoryResult) || [];
    vendors = throwIfError(vendorResult) || [];
    photos = throwIfError(photoResult) || [];
    selections = throwIfError(selectionResult) || [];

    if (!categories.length) {
      ({ categories, vendors } = await seedDefaultContent(user.id, weddings[0]?.id, categories, vendors));
    }

    const requestedWeddingId = Object.prototype.hasOwnProperty.call(options, "weddingId")
      ? options.weddingId
      : state.currentWeddingId;
    currentWeddingId = weddings.some((wedding) => wedding.id === requestedWeddingId)
      ? requestedWeddingId
      : null;
  } else {
    const membershipResult = await supabase
      .from("wedding_members")
      .select("wedding_id,user_id,role,created_at")
      .eq("user_id", user.id)
      .single();
    if (membershipResult.error?.code === "PGRST116") throw new Error("LOGIN_REVOKED");
    const membership = throwIfError(membershipResult);
    currentWeddingId = membership.wedding_id;
    accountRole = membership.role;
    const [weddingResult, dayResult, weekResult] = await Promise.all([
      supabase.from("weddings").select("id,groom_name,bride_name,wedding_date,planner_name,planner_id,color,status,completed_at").eq("id", currentWeddingId).single(),
      supabase.from("day_notes").select("wedding_id,note_date,title,body,updated_by,updated_at").eq("wedding_id", currentWeddingId).gte("note_date", range.start).lte("note_date", range.end),
      supabase.from("week_notes").select("wedding_id,week_start,body,updated_by,updated_at").eq("wedding_id", currentWeddingId).gte("week_start", range.start).lte("week_start", range.end)
    ]);
    weddings = [weddingFromRow(throwIfError(weddingResult))];
    dayNotes = (throwIfError(dayResult) || []).map(dayNoteFromRow);
    weekNotes = (throwIfError(weekResult) || []).map(weekNoteFromRow);
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
    plannerId: user.id,
    vendorId: photo.vendor_id,
    storagePath: photo.storage_path,
    name: photo.file_name,
    sortOrder: photo.sort_order,
    createdAt: photo.created_at
  }));
  if (photos.length) {
    const signed = await photoObjectStore.signedUrls(photos.map((photo) => photo.storage_path)) || [];
    signed.forEach((item, index) => {
      if (item.signedUrl) state.photoUrls.set(photos[index].id, item.signedUrl);
    });
  }

  state.authUser = { uid: user.id, loginId: profile.login_id };
  state.profile = {
    uid: user.id,
    loginId: profile.login_id,
    weddingId: currentWeddingId,
    role: accountRole,
    displayName: profile.display_name
  };
  state.weddings = weddings;
  state.currentWeddingId = currentWeddingId;
  state.wedding = weddings.find((wedding) => wedding.id === currentWeddingId) || null;
  const profilesById = new Map(memberProfiles.map((member) => [member.id, member]));
  state.members = memberships
    .filter((member) => member.wedding_id === currentWeddingId)
    .map((member) => {
      const memberProfile = profilesById.get(member.user_id) || {};
      return {
        id: member.user_id,
        loginId: memberProfile.login_id || "",
        role: member.role,
        displayName: memberProfile.display_name || roleLabels[member.role]
      };
    });
  state.memberCounts = new Map(weddings.map((wedding) => [
    wedding.id,
    memberships.filter((member) => member.wedding_id === wedding.id).length
  ]));
  state.aggregateDayNotes = dayNotes;
  state.aggregateWeekNotes = weekNotes;
  state.dayNotes = new Map(dayNotes.filter((note) => note.weddingId === currentWeddingId).map((note) => [note.id, note]));
  state.weekNotes = new Map(weekNotes.filter((note) => note.weddingId === currentWeddingId).map((note) => [note.id, note]));
  state.categories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    locked: category.locked
  }));
  state.vendors = vendors.map((vendor) => vendorFromRow(vendor, photosByVendor.get(vendor.id) || []));
  state.vendorSelections = selections.map((selection) => ({
    weddingId: selection.wedding_id,
    vendorId: selection.vendor_id,
    status: selection.status,
    quotedPrice: selection.quoted_price,
    contractTerms: selection.contract_terms,
    plannerNote: selection.planner_note,
    createdAt: selection.created_at,
    updatedAt: selection.updated_at
  }));
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

function canEditWedding() {
  return plannerMode() && state.wedding?.status === "active";
}

function weddingName(wedding) {
  return `${wedding?.groomName || "신랑"} · ${wedding?.brideName || "신부"}`;
}

function weddingFor(id) {
  return state.weddings.find((wedding) => wedding.id === id);
}

function selectionFor(weddingId, vendorId) {
  return state.vendorSelections.find((selection) => selection.weddingId === weddingId && selection.vendorId === vendorId);
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

function weekEventSummary(row) {
  const events = row.days
    .filter(Boolean)
    .map((date) => state.dayNotes.get(dateKey(date)))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  const labels = events.slice(0, 2).map((note) => `${parseDate(note.id).getDate()} ${note.title || "일정"}`);
  if (events.length > 2) labels.push(`+${events.length - 2}`);
  return labels.join(" · ");
}

function weekDisplayText(row) {
  return state.weekNotes.get(row.key)?.text || weekEventSummary(row);
}

function daysToWedding(wedding = state.wedding) {
  const target = parseDate(wedding?.weddingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return "날짜 미정";
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function noteCountForWedding(weddingId) {
  return state.aggregateDayNotes.filter((note) => note.weddingId === weddingId).length;
}

function categoryFor(id) {
  return state.categories.find((category) => category.id === id) || { id: "other", name: "기타", color: "#6f716c", icon: "folder" };
}

function vendorFor(id) {
  return state.vendors.find((vendor) => vendor.id === id);
}

function vendorPhotoSources(vendor) {
  const uploaded = (vendor?.photoIds || [])
    .filter((id) => state.photoUrls.has(id))
    .map((id) => state.photoUrls.get(id));
  if (uploaded.length) return uploaded;
  const sample = sampleVendorImages[vendor?.id];
  return sample ? [sample] : [];
}

function presentationPrice(vendor, selection) {
  return selection?.quotedPrice || vendor?.price || "가격 협의";
}

function presentationTerms(vendor, selection) {
  return selection?.contractTerms || vendor?.contractTerms || vendor?.description || "";
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

function setModalReturn(selector) {
  modalReturnSelector = selector;
}

function restoreModalFocus() {
  const selector = modalReturnSelector;
  modalReturnSelector = "";
  if (!selector) return;
  requestAnimationFrame(() => document.querySelector(selector)?.focus());
}

function focusActiveDialog(preferredSelector = "") {
  requestAnimationFrame(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
    const dialog = dialogs.at(-1);
    if (!dialog) return;
    const target = preferredSelector ? dialog.querySelector(preferredSelector) : null;
    (target || dialog.querySelector('[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))?.focus();
  });
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
  const names = state.wedding ? weddingName(state.wedding) : "모든 웨딩";
  let view = renderAggregateCalendarView();
  if (state.activeView === "calendar" && state.wedding) view = renderCalendarView();
  if (state.activeView === "couples") view = renderCouplesView();
  if (state.activeView === "vendors") view = renderVendorView();
  if (state.activeView === "settings") view = renderManageView();

  appRoot.innerHTML = `
    <section class="app-shell">
      <header class="app-topbar">
        <button class="brand-button ${plannerMode() ? "planner-brand" : ""}" type="button" data-action="navigate" data-view="${plannerMode() ? "overview" : "calendar"}" aria-label="캘린더로 이동">
          <span class="brand-mark small">M</span>
          ${plannerMode() ? "" : `<span><strong>${escapeHtml(names)}</strong><small>${escapeHtml(formatDateLong(state.wedding?.weddingDate))}</small></span>`}
        </button>
        ${plannerMode() ? `
          <button class="wedding-switcher" type="button" data-action="open-wedding-switcher" aria-label="웨딩 전환">
            ${icon("chevrons-up-down")}
            <span><strong>${escapeHtml(names)}</strong><small>${state.wedding ? escapeHtml(formatDateLong(state.wedding.weddingDate)) : `진행 ${state.weddings.filter((wedding) => wedding.status === "active").length}건`}</small></span>
            ${icon("chevron-down")}
          </button>
        ` : ""}
        ${plannerMode() ? renderDesktopNav() : ""}
        <div class="topbar-meta">
          ${state.wedding ? `<span class="dday">${escapeHtml(daysToWedding())}</span>` : ""}
          <span class="role-pill">${escapeHtml(roleLabels[state.profile.role])}</span>
          <button class="icon-button" type="button" data-action="logout" aria-label="로그아웃" title="로그아웃">${icon("log-out")}</button>
        </div>
      </header>
      <main class="app-main">${view}</main>
      ${plannerMode() ? renderBottomNav() : ""}
      ${state.selectedDate ? renderDayEditor() : ""}
      ${state.vendorImportOpen ? renderVendorImport() : ""}
      ${state.selectedVendorId ? renderVendorDetail() : ""}
      ${state.editingVendorId ? renderVendorEditor() : ""}
      ${state.categoryManagerOpen ? renderCategoryManager() : ""}
      ${state.weddingCreatorOpen ? renderWeddingCreator() : ""}
      ${state.weddingSwitcherOpen ? renderWeddingSwitcher() : ""}
      ${state.selectionEditor ? renderSelectionEditor() : ""}
      ${state.aggregateDate || state.aggregateWeekKey ? renderAggregateList() : ""}
      ${state.issuedAccount ? renderIssuedAccount() : ""}
      ${state.presentationPreviewVendorId ? renderPresentationPreview() : ""}
      ${state.presentationVendorId ? renderPresentation() : ""}
    </section>
  `;
  renderPrintSheet();
}

function renderBottomNav() {
  const activeView = state.activeView === "calendar" ? "couples" : state.activeView;
  return `
    <nav class="bottom-nav" aria-label="주요 메뉴">
      ${plannerNavItems.map((item) => `
        <button class="${activeView === item.view ? "active" : ""}" type="button" data-action="navigate" data-view="${item.view}">
          ${icon(item.icon)}<span>${item.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderDesktopNav() {
  const activeView = state.activeView === "calendar" ? "couples" : state.activeView;
  return `<nav class="desktop-nav" aria-label="주요 메뉴">${plannerNavItems.map((item) => `<button class="${activeView === item.view ? "active" : ""}" type="button" data-action="navigate" data-view="${item.view}">${icon(item.icon)}<span>${item.label}</span></button>`).join("")}</nav>`;
}

function aggregateItemsForWeek(weekStart) {
  const start = parseDate(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endKey = dateKey(end);
  const activeIds = new Set(state.weddings.filter((wedding) => wedding.status === "active").map((wedding) => wedding.id));
  const dayItems = state.aggregateDayNotes
    .filter((note) => activeIds.has(note.weddingId) && note.id >= weekStart && note.id <= endKey)
    .map((note) => ({ ...note, type: "day", sortKey: note.id }));
  const weekItems = state.aggregateWeekNotes
    .filter((note) => activeIds.has(note.weddingId) && note.id === weekStart && note.text)
    .map((note) => ({ ...note, title: note.text, type: "week", sortKey: weekStart }));
  return [...dayItems, ...weekItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function renderAggregateCalendarView() {
  const activeWeddings = state.weddings.filter((wedding) => wedding.status === "active");
  const dueCount = activeWeddings.filter((wedding) => wedding.weddingDate < dateKey(new Date())).length;
  const today = dateKey(new Date());
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = dateKey(weekEndDate);
  const todayCount = state.aggregateDayNotes.filter((note) => note.id === today && weddingFor(note.weddingId)?.status === "active").length;
  const weekCount = state.aggregateDayNotes.filter((note) => note.id >= today && note.id <= weekEnd && weddingFor(note.weddingId)?.status === "active").length;
  const noNextCount = activeWeddings.filter((wedding) => !nextEventForWedding(wedding.id)).length;
  return `
    <section class="view calendar-view aggregate-view">
      <header class="view-heading">
        <div><div class="eyebrow">Planner Overview</div><h1>전체 일정</h1><p>활성 ${activeWeddings.length}건 · 일정 ${state.aggregateDayNotes.filter((note) => activeWeddings.some((wedding) => wedding.id === note.weddingId)).length}건</p></div>
        <button class="primary compact" type="button" data-action="new-wedding">${icon("plus")}<span>새 웨딩</span></button>
      </header>
      <div class="operations-strip" aria-label="운영 현황">
        <button type="button" data-action="open-operation-filter" data-filter="today"><span>오늘</span><strong>${todayCount}</strong></button>
        <button type="button" data-action="open-operation-filter" data-filter="week"><span>7일 이내</span><strong>${weekCount}</strong></button>
        <button type="button" data-action="open-operation-filter" data-filter="none"><span>다음 일정 없음</span><strong>${noNextCount}</strong></button>
        <button class="${dueCount ? "attention" : ""}" type="button" data-action="open-operation-filter" data-filter="overdue"><span>예식일 지남</span><strong>${dueCount}</strong></button>
      </div>
      ${dueCount ? `<button class="overdue-banner" type="button" data-action="set-couple-status" data-status="active">${icon("circle-alert")} 예식일이 지난 진행 웨딩 ${dueCount}건을 확인하세요.${icon("chevron-right")}</button>` : ""}
      <div class="calendar-legend aggregate-legend">
        <span><i class="legend-today"></i>오늘</span>
        ${activeWeddings.slice(0, 6).map((wedding) => `<span><i style="background:${safeColor(wedding.color)}"></i>${escapeHtml(weddingName(wedding))}</span>`).join("")}
        ${activeWeddings.length > 6 ? `<span>+${activeWeddings.length - 6}</span>` : ""}
      </div>
      <section class="calendar aggregate-calendar">${monthsFromToday().map(renderAggregateMonth).join("")}</section>
      ${renderAggregateUpcoming()}
    </section>
  `;
}

function renderAggregateMonth(monthDate) {
  const todayKey = dateKey(new Date());
  return `
    <article class="month-card aggregate-month">
      <div class="month-head"><div><span class="month-number">${monthDate.getMonth() + 1}</span><span class="month-label">월</span></div><strong>${monthDate.getFullYear()}</strong></div>
      <div class="week-calendar-head"><div class="weekday">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div><span>전체 커플 메모</span></div>
      <div class="week-rows">
        ${getMonthRows(monthDate).map((row) => {
          const items = aggregateItemsForWeek(row.key);
          const days = row.days.map((date) => {
            if (!date) return `<span class="day empty"></span>`;
            const key = dateKey(date);
            const events = state.aggregateDayNotes.filter((note) => note.id === key && weddingFor(note.weddingId)?.status === "active");
            return `<button class="day aggregate-day ${key === todayKey ? "today" : ""} ${events.length ? "has-events" : ""}" type="button" ${events.length ? `data-action="open-aggregate-day" data-date="${key}"` : "disabled"} aria-label="${key}"><span>${date.getDate()}</span>${events.length ? `<i class="event-dots">${events.slice(0, 3).map((event) => `<b style="background:${safeColor(weddingFor(event.weddingId)?.color)}"></b>`).join("")}</i>` : ""}</button>`;
          }).join("");
          return `<div class="week-row aggregate-week-row"><div class="week-days">${days}</div><div class="aggregate-week-notes" aria-label="${escapeHtml(formatDateLong(row.key))} 시작 주의 전체 커플 일정">${items.slice(0, 3).map((item) => {
            const wedding = weddingFor(item.weddingId);
            return `<button type="button" data-action="open-aggregate-item" data-wedding="${item.weddingId}" data-date="${item.type === "day" ? item.id : ""}" style="--wedding-color:${safeColor(wedding?.color)}"><i></i><span>${item.type === "day" ? displayDate(item.id) : "주"}</span><strong>${escapeHtml(weddingName(wedding))}</strong><em>${escapeHtml(item.title || item.text || "일정")}</em></button>`;
          }).join("")}${items.length > 3 ? `<button class="aggregate-more" type="button" data-action="open-aggregate-week" data-week="${row.key}">+${items.length - 3}</button>` : ""}</div></div>`;
        }).join("")}
      </div>
    </article>
  `;
}

function renderAggregateUpcoming() {
  const today = dateKey(new Date());
  const events = state.aggregateDayNotes
    .filter((note) => note.id >= today && weddingFor(note.weddingId)?.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 10);
  return `<section class="upcoming-section"><div class="section-title-row"><div><div class="eyebrow">Across Weddings</div><h2>다가올 전체 일정</h2></div><span>${events.length}건</span></div><div class="event-list">${events.length ? events.map((note) => {
    const wedding = weddingFor(note.weddingId);
    return `<button class="event-row aggregate-event" type="button" data-action="open-aggregate-item" data-wedding="${note.weddingId}" data-date="${note.id}" style="--wedding-color:${safeColor(wedding?.color)}"><span class="event-date"><strong>${parseDate(note.id).getDate()}</strong><small>${parseDate(note.id).getMonth() + 1}월</small></span><i></i><span class="event-copy"><strong>${escapeHtml(note.title || "일정")}</strong><small>${escapeHtml(weddingName(wedding))} · ${escapeHtml(note.text || "메모 없음")}</small></span>${icon("chevron-right")}</button>`;
  }).join("") : `<div class="empty-inline">${icon("calendar-check")}<span>다가올 일정이 없습니다.</span></div>`}</div></section>`;
}

function filteredWeddings() {
  const query = state.coupleQuery.trim().toLowerCase();
  const today = dateKey(new Date());
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = dateKey(weekEndDate);
  const result = state.weddings.filter((wedding) => {
    const statusMatch = wedding.status === state.coupleStatus;
    const selectedVendorNames = state.vendorSelections
      .filter((selection) => selection.weddingId === wedding.id)
      .map((selection) => vendorFor(selection.vendorId)?.name || "")
      .join(" ");
    const text = `${wedding.groomName} ${wedding.brideName} ${wedding.plannerName} ${selectedVendorNames}`.toLowerCase();
    const nextEvent = nextEventForWedding(wedding.id);
    const quickMatch = state.coupleQuickFilter === "all"
      || (state.coupleQuickFilter === "today" && nextEvent?.id === today)
      || (state.coupleQuickFilter === "week" && nextEvent?.id >= today && nextEvent?.id <= weekEnd)
      || (state.coupleQuickFilter === "none" && !nextEvent)
      || (state.coupleQuickFilter === "accounts" && (state.memberCounts.get(wedding.id) || 0) < 2)
      || (state.coupleQuickFilter === "overdue" && wedding.weddingDate < today);
    return statusMatch && quickMatch && (!query || text.includes(query));
  });
  return result.sort((a, b) => {
    if (state.coupleSort === "name") return weddingName(a).localeCompare(weddingName(b), "ko");
    if (state.coupleSort === "date") return a.weddingDate.localeCompare(b.weddingDate);
    return (nextEventForWedding(a.id)?.id || "9999-12-31").localeCompare(nextEventForWedding(b.id)?.id || "9999-12-31")
      || a.weddingDate.localeCompare(b.weddingDate);
  });
}

function nextEventForWedding(weddingId) {
  const today = dateKey(new Date());
  return state.aggregateDayNotes
    .filter((note) => note.weddingId === weddingId && note.id >= today)
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}

function renderCouplesView() {
  const weddings = filteredWeddings();
  const today = dateKey(new Date());
  return `
    <section class="view couples-view">
      <header class="view-heading"><div><div class="eyebrow">Wedding Portfolio</div><h1>커플 관리</h1><p>전체 ${state.weddings.length}커플 · 보관 ${state.weddings.filter((wedding) => wedding.status === "completed").length}건</p></div><button class="primary compact" type="button" data-action="new-wedding">${icon("plus")}<span>새 웨딩</span></button></header>
      <div class="couple-tools"><label class="search-field">${icon("search")}<input data-action="couple-search" type="search" value="${escapeHtml(state.coupleQuery)}" placeholder="커플명, 담당자, 업체 검색" /></label><div class="segment-control"><button class="${state.coupleStatus === "active" ? "active" : ""}" type="button" data-action="set-couple-status" data-status="active">진행</button><button class="${state.coupleStatus === "completed" ? "active" : ""}" type="button" data-action="set-couple-status" data-status="completed">보관</button></div></div>
      <div class="portfolio-filters">
        <div class="filter-chips">${[
          ["all", "전체"], ["today", "오늘"], ["week", "이번 주"], ["none", "일정 없음"], ["accounts", "계정 미완료"], ["overdue", "예식일 지남"]
        ].map(([value, label]) => `<button class="${state.coupleQuickFilter === value ? "active" : ""}" type="button" data-action="set-couple-filter" data-filter="${value}">${label}</button>`).join("")}</div>
        <label class="sort-select">${icon("arrow-up-down")}<select data-action="couple-sort" aria-label="웨딩 정렬"><option value="next" ${state.coupleSort === "next" ? "selected" : ""}>다음 일정순</option><option value="date" ${state.coupleSort === "date" ? "selected" : ""}>예식일순</option><option value="name" ${state.coupleSort === "name" ? "selected" : ""}>이름순</option></select></label>
      </div>
      <div class="couple-grid">${weddings.length ? weddings.map((wedding) => {
        const overdue = wedding.status === "active" && wedding.weddingDate < today;
        const nextEvent = nextEventForWedding(wedding.id);
        return `<article class="couple-card" style="--wedding-color:${safeColor(wedding.color)}"><button type="button" data-action="open-wedding" data-wedding="${wedding.id}"><span class="couple-color"></span><div class="couple-card-head"><span>${wedding.status === "completed" ? "보관" : overdue ? "예식일 지남" : daysToWedding(wedding)}</span><small>${escapeHtml(formatDateLong(wedding.weddingDate))}</small></div><strong>${escapeHtml(weddingName(wedding))}</strong><p class="couple-next ${nextEvent ? "" : "empty"}">${nextEvent ? `<b>다음 ${displayDate(nextEvent.id)}</b> ${escapeHtml(nextEvent.title || "일정")}` : "다음 일정 없음"}</p><div class="couple-card-stats"><span>${icon("user-round")} 계정 ${state.memberCounts.get(wedding.id) || 0}/2</span><span>담당 ${escapeHtml(wedding.plannerName)}</span>${icon("arrow-up-right")}</div></button></article>`;
      }).join("") : `<div class="empty-state">${icon(state.coupleStatus === "active" ? "users-round" : "archive")}<strong>${state.coupleStatus === "active" ? "진행 중인 커플이 없습니다" : "보관된 웨딩이 없습니다"}</strong><p>검색 조건을 바꾸거나 새 웨딩을 등록하세요.</p></div>`}</div>
    </section>
  `;
}

function renderWeddingCreator() {
  const palette = ["#39756c", "#c75a6a", "#5f7094", "#a67b33", "#8a6074", "#3c7f93"];
  return `<div class="modal-backdrop" data-action="close-wedding-creator"></div><form class="modal-sheet compact-modal" data-action="create-wedding" role="dialog" aria-modal="true"><header class="modal-header"><div><span class="modal-kicker">New Wedding</span><strong>새 웨딩 등록</strong></div><button class="icon-button" type="button" data-action="close-wedding-creator" aria-label="닫기">${icon("x")}</button></header><div class="editor-fields"><div class="field-grid two-cols"><label>신랑 이름<input name="groomName" required /></label><label>신부 이름<input name="brideName" required /></label></div><div class="field-grid two-cols"><label>예식일<input name="weddingDate" type="date" value="${defaultWeddingDate()}" required /></label><label>담당 플래너<input name="plannerName" value="${escapeHtml(state.profile?.displayName || "관리자")}" /></label></div><fieldset class="color-picker"><legend>구분 색상</legend>${palette.map((color, index) => `<label style="--swatch:${color}"><input type="radio" name="color" value="${color}" ${index === state.weddings.length % palette.length ? "checked" : ""} /><span></span></label>`).join("")}</fieldset></div><footer class="modal-actions"><button class="secondary" type="button" data-action="close-wedding-creator">취소</button><button class="primary grow" type="submit">${icon("plus")} 등록</button></footer></form>`;
}

function weddingSwitcherRows() {
  const query = state.weddingSwitchQuery.trim().toLowerCase();
  const matches = state.weddings.filter((wedding) => !query || `${wedding.groomName} ${wedding.brideName} ${wedding.plannerName}`.toLowerCase().includes(query));
  const recentOrder = new Map(state.recentWeddingIds.map((id, index) => [id, index]));
  return matches.sort((a, b) => {
    const aRecent = recentOrder.has(a.id) ? recentOrder.get(a.id) : 99;
    const bRecent = recentOrder.has(b.id) ? recentOrder.get(b.id) : 99;
    return aRecent - bRecent || Number(a.status === "completed") - Number(b.status === "completed") || a.weddingDate.localeCompare(b.weddingDate);
  });
}

function renderWeddingSwitcherRows() {
  const weddings = weddingSwitcherRows();
  return `<button class="context-option all ${!state.currentWeddingId ? "active" : ""}" type="button" data-action="switch-wedding" data-wedding=""><span>${icon("calendar-range")}</span><span><strong>모든 웨딩</strong><small>전체 일정과 운영 현황</small></span>${!state.currentWeddingId ? icon("check") : ""}</button>${weddings.map((wedding) => `<button class="context-option ${wedding.id === state.currentWeddingId ? "active" : ""}" type="button" data-action="switch-wedding" data-wedding="${wedding.id}" style="--wedding-color:${safeColor(wedding.color)}"><i></i><span><strong>${escapeHtml(weddingName(wedding))}</strong><small>${escapeHtml(formatDateLong(wedding.weddingDate))} · ${wedding.status === "completed" ? "보관" : daysToWedding(wedding)}</small></span>${wedding.id === state.currentWeddingId ? icon("check") : ""}</button>`).join("") || `<div class="empty-inline">${icon("search-x")}<span>검색 결과가 없습니다.</span></div>`}`;
}

function renderWeddingSwitcher() {
  return `<div class="modal-backdrop" data-action="close-wedding-switcher"></div><section class="modal-sheet compact-modal context-switcher" role="dialog" aria-modal="true" aria-label="웨딩 전환"><header class="modal-header"><div><span class="modal-kicker">Workspace</span><strong>웨딩 전환</strong></div><button class="icon-button" type="button" data-action="close-wedding-switcher" aria-label="닫기">${icon("x")}</button></header><div class="context-search"><label class="search-field">${icon("search")}<input data-action="wedding-switch-search" type="search" value="${escapeHtml(state.weddingSwitchQuery)}" placeholder="신랑·신부 또는 담당자 검색" autofocus /></label></div><div class="context-options">${renderWeddingSwitcherRows()}</div></section>`;
}

function renderAggregateList() {
  const items = state.aggregateDate
    ? state.aggregateDayNotes.filter((note) => note.id === state.aggregateDate && weddingFor(note.weddingId)?.status === "active").map((note) => ({ ...note, type: "day" }))
    : aggregateItemsForWeek(state.aggregateWeekKey);
  const title = state.aggregateDate ? formatDateLong(state.aggregateDate) : `${displayDate(state.aggregateWeekKey)} 주간`;
  return `<div class="modal-backdrop" data-action="close-aggregate-list"></div><section class="modal-sheet compact-modal aggregate-list-modal" role="dialog" aria-modal="true"><header class="modal-header"><div><span class="modal-kicker">All Couples</span><strong>${escapeHtml(title)} 일정</strong></div><button class="icon-button" type="button" data-action="close-aggregate-list">${icon("x")}</button></header><div class="aggregate-list">${items.map((item) => {
    const wedding = weddingFor(item.weddingId);
    return `<button type="button" data-action="open-aggregate-item" data-wedding="${item.weddingId}" data-date="${item.type === "day" ? item.id : ""}" style="--wedding-color:${safeColor(wedding?.color)}"><i></i><span><strong>${escapeHtml(item.title || item.text || "일정")}</strong><small>${escapeHtml(weddingName(wedding))}${item.type === "day" ? ` · ${displayDate(item.id)}` : " · 주간 메모"}</small></span>${icon("chevron-right")}</button>`;
  }).join("")}</div></section>`;
}

function renderCalendarView() {
  if (!state.wedding) return renderAggregateCalendarView();
  const months = monthsFromToday();
  const first = months[0];
  const last = months.at(-1);
  return `
    <section class="view calendar-view">
      <header class="view-heading">
        <div>
          <div class="eyebrow">${state.wedding.status === "completed" ? "Archived Wedding" : "12 Month Plan"}</div>
          <h1>12개월 일정</h1>
          <p>${first.getFullYear()}.${String(first.getMonth() + 1).padStart(2, "0")} - ${last.getFullYear()}.${String(last.getMonth() + 1).padStart(2, "0")}</p>
        </div>
        <div class="heading-actions">
          <button class="tool-button" type="button" data-action="print">${icon("printer")}<span>인쇄/PDF</span></button>
          <button class="tool-button" type="button" data-action="png">${icon("image-down")}<span>PNG</span></button>
        </div>
      </header>
      ${state.wedding.status === "completed" ? `<div class="archive-banner">${icon("archive")}<span><strong>보관된 웨딩입니다.</strong><small>일정은 읽기 전용이며 설정에서 다시 활성화할 수 있습니다.</small></span><button type="button" data-action="navigate" data-view="settings">관리</button></div>` : ""}
      <div class="calendar-legend">
        <span><i class="legend-today"></i>오늘</span>
        <span><i class="legend-note"></i>일정 있음</span>
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
        <span>주간 메모</span>
      </div>
      <div class="week-rows">
        ${getMonthRows(monthDate).map((row) => {
          const value = state.weekNotes.get(row.key)?.text || "";
          const eventSummary = weekEventSummary(row);
          const days = row.days.map((date) => {
            if (!date) return `<span class="day empty"></span>`;
            const key = dateKey(date);
            const note = state.dayNotes.get(key);
            const classes = ["day"];
            if (key === todayKey) classes.push("today");
            if (note) classes.push("has-note");
            const ariaLabel = `${formatDateLong(key)}${key === todayKey ? ", 오늘" : ""}${note ? `, ${note.title || "일정 있음"}` : ""}`;
            return `<button class="${classes.join(" ")}" type="button" data-action="select-day" data-date="${key}" aria-label="${escapeHtml(ariaLabel)}">${date.getDate()}</button>`;
          }).join("");
          return `
            <div class="week-row">
              <div class="week-days">${days}</div>
              ${canEditWedding()
                ? `<textarea class="week-comment ${eventSummary && !value ? "event-preview" : ""}" data-action="week-note" data-week="${row.key}" placeholder="${escapeHtml(eventSummary)}" aria-label="${escapeHtml(formatDateLong(row.key))} 시작 주의 주간 메모">${escapeHtml(value)}</textarea>`
                : `<div class="week-comment week-read ${eventSummary && !value ? "event-preview" : ""}" role="note" aria-label="${escapeHtml(formatDateLong(row.key))} 시작 주의 주간 메모">${escapeHtml(value || eventSummary)}</div>`}
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
  const vendors = state.vendors.filter((vendor) => {
    const categoryMatch = state.selectedCategory === "all" || vendor.categoryId === state.selectedCategory;
    const haystack = [vendor.name, vendor.description, vendor.price, ...(vendor.tags || [])].join(" ").toLowerCase();
    return categoryMatch && (!state.vendorFavoriteOnly || vendor.favorite) && (!query || haystack.includes(query));
  });
  if (state.vendorSort === "name") return vendors.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  if (state.vendorSort === "favorite") return vendors.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "ko"));
  return vendors.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || a.name.localeCompare(b.name, "ko"));
}

function renderVendorView() {
  const photoCount = state.vendors.reduce((total, vendor) => total + vendorPhotoSources(vendor).length, 0);
  return `
    <section class="view vendor-view">
      <header class="view-heading vendor-heading">
        <div>
          <div class="eyebrow">Planner Library</div>
          <h1>웨딩 레퍼런스</h1>
          <p>업체 ${state.vendors.length}곳 · 사진 ${photoCount}장</p>
        </div>
        <div class="heading-actions"><button class="secondary compact" type="button" data-action="open-vendor-import">${icon("file-spreadsheet")}<span>엑셀 등록</span></button><button class="primary compact" type="button" data-action="new-vendor">${icon("plus")}<span>업체 등록</span></button></div>
      </header>
      <div class="vendor-filter-bar">
        <div class="vendor-tools">
          <label class="search-field">${icon("search")}<input data-action="vendor-search" type="search" value="${escapeHtml(state.vendorQuery)}" placeholder="업체명, 태그, 가격 검색" aria-label="업체 검색" /></label>
          <button class="secondary category-manage-button" type="button" data-action="open-category-manager" title="카테고리 추가 및 관리">${icon("folder-plus")}<span>카테고리</span></button>
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
      </div>
      <div class="vendor-result-bar">
        <div class="vendor-results"><strong data-vendor-result-count>${filteredVendors().length}</strong><span>개의 레퍼런스</span></div>
        <div class="vendor-list-actions">
          <button class="vendor-save-filter ${state.vendorFavoriteOnly ? "active" : ""}" type="button" data-action="toggle-vendor-favorites" aria-pressed="${state.vendorFavoriteOnly}">${icon("heart")}<span>저장</span></button>
          <label class="vendor-sort">${icon("arrow-up-down")}<select data-action="vendor-sort" aria-label="업체 정렬"><option value="recent" ${state.vendorSort === "recent" ? "selected" : ""}>최근 수정순</option><option value="favorite" ${state.vendorSort === "favorite" ? "selected" : ""}>저장 우선</option><option value="name" ${state.vendorSort === "name" ? "selected" : ""}>이름순</option></select></label>
        </div>
      </div>
      <div class="vendor-feed ${filteredVendors().length <= 3 ? "sparse" : ""}">${renderVendorFeed()}</div>
    </section>
  `;
}

function renderVendorImport() {
  const preview = state.vendorImportPreview;
  const rows = preview?.rows.slice(0, 200) || [];
  const canImport = Boolean(preview?.validCount && !preview.invalidCount && !state.vendorImportBusy);
  const submitLabel = state.vendorImportBusy
    ? `${icon("loader-circle", "spin")} 처리 중`
    : preview?.invalidCount
      ? `${icon("triangle-alert")} 오류 ${preview.invalidCount}건`
      : preview
        ? `${icon("database")} 신규 ${preview.newCount} · 수정 ${preview.updateCount} 저장`
        : `${icon("database")} 업체 일괄 저장`;
  return `
    <div class="modal-backdrop" data-action="close-vendor-import"></div>
    <section class="modal-sheet vendor-import" role="dialog" aria-modal="true" aria-label="업체 엑셀 일괄 등록">
      <header class="modal-header"><div><span class="modal-kicker">Bulk Import</span><strong>업체 엑셀 일괄 등록</strong></div><button class="icon-button" type="button" data-action="close-vendor-import" aria-label="닫기">${icon("x")}</button></header>
      <div class="vendor-import-body" aria-live="polite">
        <div class="vendor-import-controls">
          <button class="secondary" type="button" data-action="download-vendor-template">${icon("file-down")} 엑셀 양식</button>
          <label class="vendor-import-picker ${state.vendorImportBusy ? "disabled" : ""}">${icon("file-up")}<span><strong>${preview?.fileName ? escapeHtml(preview.fileName) : "엑셀·CSV 파일 선택"}</strong><small>.xlsx · .xls · .csv · 최대 10MB</small></span><input data-action="vendor-import-file" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" ${state.vendorImportBusy ? "disabled" : ""} /></label>
        </div>
        ${state.vendorImportBusy ? `<div class="vendor-import-loading">${icon("loader-circle", "spin")}<strong>파일을 처리하고 있습니다</strong></div>` : preview ? `
          <div class="import-summary">
            <div><strong>${preview.rows.length}</strong><span>전체 행</span></div>
            <div><strong>${preview.newCount}</strong><span>신규</span></div>
            <div><strong>${preview.updateCount}</strong><span>업데이트</span></div>
            <div class="${preview.invalidCount ? "error" : ""}"><strong>${preview.invalidCount}</strong><span>오류</span></div>
          </div>
          ${preview.newCategories.length ? `<div class="import-categories"><span>새 카테고리</span>${preview.newCategories.map((name) => `<em>${icon("folder-plus")}${escapeHtml(name)}</em>`).join("")}</div>` : ""}
          <div class="import-table-wrap">
            <table class="import-table"><thead><tr><th>행</th><th>업체</th><th>카테고리</th><th>처리</th></tr></thead><tbody>${rows.map((row) => `<tr class="${row.errors.length ? "invalid" : ""}"><td>${row.rowNumber}</td><td><strong>${escapeHtml(row.name || "업체명 없음")}</strong>${row.errors.length ? `<small>${escapeHtml(row.errors.join(" · "))}</small>` : ""}</td><td>${escapeHtml(row.categoryName || "-")}${row.newCategory && !row.errors.length ? `<small>새로 생성</small>` : ""}</td><td><span class="import-mode ${row.errors.length ? "error" : row.mode}">${row.errors.length ? "오류" : row.mode === "update" ? "업데이트" : "신규"}</span></td></tr>`).join("")}</tbody></table>
          </div>
          ${preview.rows.length > rows.length ? `<div class="import-row-limit">외 ${preview.rows.length - rows.length}행</div>` : ""}
        ` : `<div class="vendor-import-empty">${icon("file-spreadsheet")}<strong>선택한 파일이 없습니다</strong></div>`}
      </div>
      <footer class="modal-actions"><button class="secondary" type="button" data-action="close-vendor-import" ${state.vendorImportBusy ? "disabled" : ""}>취소</button><button class="primary grow" type="button" data-action="import-vendors" ${canImport ? "" : "disabled"}>${submitLabel}</button></footer>
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
  const photoCount = vendorPhotoSources(vendor).length;
  const assignmentCount = state.vendorSelections.filter((selection) => selection.vendorId === vendor.id).length;
  const currentSelection = state.currentWeddingId ? selectionFor(state.currentWeddingId, vendor.id) : null;
  const mediaStatus = state.currentWeddingId
    ? currentSelection ? `${currentSelection.status} · 배정됨` : "현재 커플 미배정"
    : assignmentCount ? `${assignmentCount}커플 배정` : "공용 자료";
  const assignmentLabel = currentSelection ? "배정됨 · 변경" : state.currentWeddingId ? "현재 커플에 추가" : "커플에 추가";
  return `
    <article class="vendor-card" style="--category-color:${safeColor(category.color)}">
      <div class="vendor-media-wrap">
        <button class="vendor-media" type="button" data-action="open-vendor" data-vendor="${vendor.id}" aria-label="${escapeHtml(vendor.name)} 상세 보기">
          ${renderVendorMedia(vendor)}
        </button>
        <span class="vendor-status ${currentSelection ? "assigned" : ""}">${escapeHtml(mediaStatus)}</span>
        ${photoCount ? `<span class="photo-count">${icon("images")} ${photoCount}</span>` : ""}
        <button class="favorite-button ${vendor.favorite ? "active" : ""}" type="button" data-action="toggle-favorite" data-vendor="${vendor.id}" aria-label="즐겨찾기" title="즐겨찾기">${icon("heart")}</button>
      </div>
      <div class="vendor-card-copy">
        <button class="vendor-card-open" type="button" data-action="open-vendor" data-vendor="${vendor.id}">
          <span class="vendor-card-meta"><span>${escapeHtml(category.name)}</span>${vendor.sample ? `<em>샘플</em>` : ""}</span>
          <strong>${escapeHtml(vendor.name)}</strong>
          <small>${escapeHtml(vendor.price || "가격 정보 없음")}</small>
        </button>
        <button class="vendor-assign-action ${currentSelection ? "assigned" : ""}" type="button" data-action="assign-vendor" data-vendor="${vendor.id}" aria-label="${escapeHtml(vendor.name)} ${escapeHtml(assignmentLabel)}">${icon(currentSelection ? "circle-check" : "user-round-plus")}<span>${escapeHtml(assignmentLabel)}</span></button>
      </div>
    </article>
  `;
}

function renderVendorMedia(vendor, extraClass = "") {
  const source = vendorPhotoSources(vendor)[0];
  const category = categoryFor(vendor.categoryId);
  if (source) {
    return `<img class="vendor-photo ${extraClass}" src="${source}" alt="${escapeHtml(vendor.name)} 레퍼런스" />`;
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
  const photos = vendorPhotoSources(vendor);
  const index = Math.min(state.selectedVendorPhotoIndex, Math.max(photos.length - 1, 0));
  const currentSelection = state.currentWeddingId ? selectionFor(state.currentWeddingId, vendor.id) : null;
  const assignmentLabel = currentSelection ? "배정 정보 변경" : state.currentWeddingId ? "현재 커플에 배정" : "커플 선택해 배정";
  const website = safeUrl(vendor.website);
  return `
    <div class="modal-backdrop" data-action="close-vendor-detail"></div>
    <section class="modal-sheet vendor-detail" role="dialog" aria-modal="true" aria-label="업체 상세">
      <header class="modal-header">
        <div><span class="modal-kicker">Vendor Library</span><strong>${escapeHtml(category.name)} 레퍼런스</strong></div>
        <button class="icon-button" type="button" data-action="close-vendor-detail" aria-label="닫기" title="닫기">${icon("x")}</button>
      </header>
      <div class="detail-scroll">
        <div class="detail-gallery ${state.vendorDetailTab === "overview" ? "" : "compact"}" style="--category-color:${safeColor(category.color)}">
          <div class="detail-main-photo">
            ${photos.length ? `<img src="${photos[index]}" alt="${escapeHtml(vendor.name)} 사진 ${index + 1}" />` : renderVendorMedia(vendor, "detail-placeholder")}
            ${photos.length > 1 ? `
              <button class="gallery-arrow prev" type="button" data-action="vendor-photo-prev" aria-label="이전 사진">${icon("chevron-left")}</button>
              <button class="gallery-arrow next" type="button" data-action="vendor-photo-next" aria-label="다음 사진">${icon("chevron-right")}</button>
              <span class="gallery-count">${index + 1} / ${photos.length}</span>
            ` : ""}
          </div>
          ${photos.length > 1 ? `<div class="thumbnail-strip">${photos.map((source, photoIndex) => `<button class="${photoIndex === index ? "active" : ""}" type="button" data-action="select-vendor-photo" data-index="${photoIndex}"><img src="${source}" alt="" /></button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-content">
          <div class="detail-title-row">
            <div><span class="status-tag">${escapeHtml(vendor.status || "관심")}</span><h2>${escapeHtml(vendor.name)}</h2>${currentSelection ? `<span class="assignment-chip">${icon("circle-check")} ${escapeHtml(weddingName(state.wedding))} · ${escapeHtml(currentSelection.status)}</span>` : ""}</div>
            <button class="favorite-button detail-favorite ${vendor.favorite ? "active" : ""}" type="button" data-action="toggle-favorite" data-vendor="${vendor.id}" aria-label="즐겨찾기">${icon("heart")}</button>
          </div>
          <div class="detail-quick-facts">
            <div class="price-fact"><small>대표 금액</small><strong>${escapeHtml(presentationPrice(vendor, currentSelection))}</strong></div>
            <div><small>상품 구성</small><strong>${(vendor.packages || []).length}개</strong></div>
            <div><small>사전 미팅</small><strong>${vendor.requiredMeeting ? "필수" : "선택"}</strong></div>
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
      <footer class="modal-actions vendor-detail-actions">
        <button class="secondary danger-text detail-icon-action" type="button" data-action="delete-vendor" data-vendor="${vendor.id}" aria-label="업체 삭제" title="업체 삭제">${icon("trash-2")}</button>
        <button class="secondary detail-icon-action" type="button" data-action="edit-vendor" data-vendor="${vendor.id}" aria-label="업체 편집" title="업체 편집">${icon("pencil")}</button>
        <button class="secondary assign-detail-action ${currentSelection ? "assigned" : ""}" type="button" data-action="assign-vendor" data-vendor="${vendor.id}">${icon(currentSelection ? "circle-check" : "user-round-plus")} ${escapeHtml(assignmentLabel)}</button>
        <button class="primary presentation-action" type="button" data-action="open-presentation" data-vendor="${vendor.id}">${icon("monitor-up")} 고객 보기</button>
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
          <div class="editor-section-title"><strong>샘플 사진</strong><span>최대 20장 · 1,920px 고화질 최적화</span></div>
          ${existingPhotos.length ? `<div class="existing-photo-grid">${existingPhotos.map((id) => `<label class="existing-photo"><img src="${state.photoUrls.get(id)}" alt="" /><input type="checkbox" name="removePhoto" value="${id}" /><span>${icon("trash-2")} 삭제</span></label>`).join("")}</div>` : ""}
          <label class="upload-dropzone">
            ${icon("image-plus")}
            <strong>사진 추가</strong>
            <span>원본 용량은 저장 전 자동으로 줄어듭니다</span>
            <input data-action="vendor-photos" name="photos" type="file" accept="image/*" multiple />
          </label>
          <div class="pending-photo-preview" aria-live="polite"></div>
          <div class="pending-photo-summary" aria-live="polite" hidden></div>
        </section>
        <section class="editor-fields">
          <div class="field-grid two-cols">
            <label>업체명<input name="name" value="${escapeHtml(vendor.name)}" placeholder="업체명" required /></label>
            <label>카테고리<select name="categoryId" required>${state.categories.map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === vendor.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></label>
          </div>
          <label>기본 가격 정보<input name="price" value="${escapeHtml(vendor.price)}" placeholder="예: 본식 280만원부터" /></label>
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

function renderPresentationPreview() {
  const vendor = vendorFor(state.presentationPreviewVendorId);
  if (!vendor) return "";
  const category = categoryFor(vendor.categoryId);
  const selection = state.currentWeddingId ? selectionFor(state.currentWeddingId, vendor.id) : null;
  return `
    <div class="modal-backdrop" data-action="close-presentation-preview"></div>
    <section class="modal-sheet compact-modal presentation-preview" role="dialog" aria-modal="true" aria-label="고객 보기 설정">
      <header class="modal-header"><div><span class="modal-kicker">Customer View</span><strong>고객 보기 설정</strong></div><button class="icon-button" type="button" data-action="close-presentation-preview" aria-label="닫기">${icon("x")}</button></header>
      <div class="presentation-preview-body">
        <div class="presentation-preview-vendor" style="--category-color:${safeColor(category.color)}">
          <div>${renderVendorMedia(vendor)}</div>
          <span><small>${escapeHtml(category.name)}</small><strong>${escapeHtml(vendor.name)}</strong></span>
        </div>
        <div class="presentation-options" aria-label="고객에게 표시할 정보">
          <label><input data-action="presentation-show-price" type="checkbox" ${state.presentationShowPrice ? "checked" : ""} /><span>${icon("wallet-cards")}<strong>금액 표시</strong></span></label>
          <label><input data-action="presentation-show-terms" type="checkbox" ${state.presentationShowTerms ? "checked" : ""} /><span>${icon("file-check-2")}<strong>계약 조건 표시</strong></span></label>
        </div>
        <div class="presentation-preview-data">
          ${state.presentationShowPrice ? `<div><small>고객 안내 금액</small><strong>${escapeHtml(presentationPrice(vendor, selection))}</strong></div>` : ""}
          ${state.presentationShowTerms ? `<p>${escapeHtml(presentationTerms(vendor, selection))}</p>` : ""}
        </div>
      </div>
      <footer class="modal-actions"><button class="secondary" type="button" data-action="close-presentation-preview">취소</button><button class="primary grow" type="button" data-action="start-presentation" data-vendor="${vendor.id}">${icon("monitor-up")} 전체 화면 시작</button></footer>
    </section>
  `;
}

function renderPresentation() {
  const vendor = vendorFor(state.presentationVendorId);
  if (!vendor) return "";
  const category = categoryFor(vendor.categoryId);
  const selection = state.currentWeddingId ? selectionFor(state.currentWeddingId, vendor.id) : null;
  const photos = vendorPhotoSources(vendor);
  const index = Math.min(state.presentationPhotoIndex, Math.max(photos.length - 1, 0));
  return `
    <section class="presentation" role="dialog" aria-modal="true" aria-label="고객 프레젠테이션">
      <header class="presentation-header">
        <div><span>${escapeHtml(category.name)}</span><strong>${escapeHtml(vendor.name)}</strong></div>
        <button class="presentation-close" type="button" data-action="close-presentation" aria-label="고객 보기 종료" title="고객 보기 종료">${icon("x")}</button>
      </header>
      <div class="presentation-stage" style="--category-color:${safeColor(category.color)}">
        ${photos.length ? `<img src="${photos[index]}" alt="${escapeHtml(vendor.name)} 레퍼런스 ${index + 1}" />` : renderVendorMedia(vendor, "presentation-placeholder")}
        ${photos.length > 1 ? `<button class="presentation-arrow prev" type="button" data-action="presentation-prev" aria-label="이전 사진">${icon("chevron-left")}</button><button class="presentation-arrow next" type="button" data-action="presentation-next" aria-label="다음 사진">${icon("chevron-right")}</button>` : ""}
      </div>
      <footer class="presentation-footer">
        <div class="presentation-summary">
          ${state.presentationShowPrice ? `<div class="presentation-price"><small>안내 금액</small><strong>${escapeHtml(presentationPrice(vendor, selection))}</strong></div>` : ""}
          ${state.presentationShowTerms ? `<div class="presentation-terms"><small>계약 조건</small><p>${escapeHtml(presentationTerms(vendor, selection))}</p></div>` : ""}
        </div>
        <span class="presentation-counter">${photos.length ? `${index + 1} / ${photos.length}` : "사진 준비 중"}</span>
      </footer>
    </section>
  `;
}

function renderManageView() {
  const assigned = state.wedding
    ? state.vendorSelections.filter((selection) => selection.weddingId === state.wedding.id)
    : [];
  const availableRoles = ["groom", "bride"].filter((role) => !state.members.some((member) => member.role === role));
  const readonly = state.wedding?.status === "completed";
  return `
    <section class="view manage-view">
      <header class="view-heading">
        <div><div class="eyebrow">Back Office</div><h1>${state.wedding ? escapeHtml(weddingName(state.wedding)) : "플래너 설정"}</h1><p>${state.wedding ? "선택한 웨딩의 기본 정보와 계정, 제안 업체를 관리합니다." : "모든 웨딩과 공용 레퍼런스가 실시간으로 동기화됩니다."}</p></div>
      </header>
      <div class="stat-strip">
        ${state.wedding ? `
          <div><strong>${escapeHtml(daysToWedding())}</strong><span>예식일</span></div>
          <div><strong>${state.dayNotes.size}</strong><span>일정</span></div>
          <div><strong>${assigned.length}</strong><span>제안 업체</span></div>
          <div><strong>${state.members.length}/2</strong><span>계정</span></div>
        ` : `
          <div><strong>${state.weddings.filter((wedding) => wedding.status === "active").length}</strong><span>진행 웨딩</span></div>
          <div><strong>${state.vendors.length}</strong><span>업체</span></div>
          <div><strong>${state.photoRecords.size}</strong><span>사진</span></div>
          <div><strong>${state.aggregateDayNotes.length}</strong><span>일정</span></div>
        `}
      </div>
      ${state.wedding ? `<section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Wedding Profile</div><h2>웨딩 기본 정보</h2></div></div>
        <form class="field-grid" data-action="save-wedding">
          <div class="field-grid two-cols"><label>신랑 이름<input name="groomName" value="${escapeHtml(state.wedding.groomName)}" ${readonly ? "disabled" : ""} required /></label><label>신부 이름<input name="brideName" value="${escapeHtml(state.wedding.brideName)}" ${readonly ? "disabled" : ""} required /></label></div>
          <div class="field-grid two-cols"><label>예식일<input name="weddingDate" type="date" value="${escapeHtml(state.wedding.weddingDate)}" ${readonly ? "disabled" : ""} required /></label><label>플래너명<input name="plannerName" value="${escapeHtml(state.wedding.plannerName)}" ${readonly ? "disabled" : ""} /></label></div>
          ${readonly ? "" : `<div class="form-submit-row"><button class="primary" type="submit">${icon("save")} 정보 저장</button></div>`}
        </form>
        <div class="wedding-status-action"><span><strong>${readonly ? "보관 중" : state.wedding.weddingDate < dateKey(new Date()) ? "예식일 지남" : "준비 진행 중"}</strong><small>${readonly ? "수정하려면 다시 활성화하세요." : "모든 준비가 끝나면 보관 처리하세요."}</small></span><button class="${readonly ? "secondary" : "primary"}" type="button" data-action="toggle-wedding-status">${icon(readonly ? "rotate-ccw" : "archive-check")} ${readonly ? "다시 활성화" : "준비 완료"}</button></div>
      </section>
      <section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Members</div><h2>로그인 계정</h2></div><span>${state.members.length}명</span></div>
        <div class="member-list">
          ${state.members.length ? state.members.map((member) => `<div class="member-row"><span class="member-avatar">${escapeHtml((member.displayName || member.loginId || "?").slice(0, 1))}</span><span><strong>${escapeHtml(member.displayName || member.loginId)}</strong><small>${escapeHtml(member.loginId)} · ${escapeHtml(roleLabels[member.role])}</small></span>${readonly ? "" : `<button class="icon-button" type="button" data-action="delete-member" data-member="${member.id}" aria-label="계정 삭제">${icon("trash-2")}</button>`}</div>`).join("") : `<div class="empty-inline">${icon("user-plus")}<span>발급된 커플 계정이 없습니다.</span></div>`}
        </div>
        ${!readonly && availableRoles.length ? `<form class="account-form" data-action="create-account">
          <h3>${icon("user-plus")} 신랑·신부 계정 발급</h3>
          <div class="field-grid two-cols"><label>역할<select name="role">${availableRoles.map((role) => `<option value="${role}">${roleLabels[role]}</option>`).join("")}</select></label><label>이름<input name="displayName" required /></label></div>
          <div class="field-grid two-cols"><label>로그인 아이디<input name="loginId" required /></label><label>임시 비밀번호<span class="input-with-action"><input name="password" value="${generatePassword()}" required /><button class="icon-button" type="button" data-action="regen-password" aria-label="비밀번호 새로 만들기">${icon("refresh-cw")}</button></span></label></div>
          <div class="form-submit-row"><button class="secondary" type="submit">계정 발급</button></div>
        </form>` : ""}
      </section>
      <section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Selected Vendors</div><h2>제안·계약 업체</h2></div><span>${assigned.length}곳</span></div>
        <div class="assigned-vendor-list">${assigned.length ? assigned.map((selection) => {
          const vendor = vendorFor(selection.vendorId);
          if (!vendor) return "";
          return `<div class="assigned-vendor"><span style="--category-color:${safeColor(categoryFor(vendor.categoryId).color)}">${icon(categoryFor(vendor.categoryId).icon)}</span><span><strong>${escapeHtml(vendor.name)}</strong><small>${escapeHtml(selection.status)} · ${escapeHtml(selection.quotedPrice || vendor.price || "가격 협의")}</small></span>${readonly ? "" : `<button class="icon-button" type="button" data-action="edit-selection" data-vendor="${vendor.id}" data-wedding="${state.wedding.id}" aria-label="배정 정보 편집">${icon("pencil")}</button><button class="icon-button danger-text" type="button" data-action="remove-selection" data-vendor="${vendor.id}" data-wedding="${state.wedding.id}" aria-label="업체 배정 해제">${icon("x")}</button>`}</div>`;
        }).join("") : `<div class="empty-inline">${icon("briefcase-business")}<span>이 커플에 제안한 업체가 없습니다.</span></div>`}</div>
        ${readonly ? "" : `<div class="form-submit-row"><button class="secondary" type="button" data-action="navigate" data-view="vendors">${icon("images")} 공용 자료실에서 추가</button></div>`}
      </section>` : `<section class="manage-section context-empty"><div>${icon("mouse-pointer-click")}<strong>커플을 선택하면 상세 설정을 관리할 수 있습니다.</strong><p>커플 목록 또는 상단 선택기에서 웨딩을 선택하세요.</p></div><button class="secondary" type="button" data-action="navigate" data-view="couples">커플 목록</button></section>`}
      ${!state.wedding ? `<section class="manage-section">
        <div class="section-title-row"><div><div class="eyebrow">Security</div><h2>내 비밀번호</h2></div></div>
        <form class="inline-form" data-action="change-password"><label>새 비밀번호<input name="password" type="password" minlength="6" required /></label><button class="secondary" type="submit">변경</button></form>
      </section>
      <section class="manage-section data-section">
        <div class="section-title-row"><div><div class="eyebrow">Data</div><h2>데이터 백업</h2></div>${icon("database")}</div>
        <p>모든 웨딩, 일정, 공용 업체, 커플별 제안 정보와 사진을 하나의 파일로 보관합니다. 계정 비밀번호는 포함되지 않습니다.</p>
        <div class="data-actions"><button class="secondary" type="button" data-action="export-data">${icon("download")} 전체 백업</button><button class="secondary" type="button" data-action="import-data">${icon("upload")} 백업 복원</button><input class="visually-hidden" type="file" accept="application/json" data-action="data-import-file" /></div>
      </section>` : ""}
    </section>
  `;
}

function renderSelectionEditor() {
  const vendor = vendorFor(state.selectionEditor.vendorId);
  if (!vendor) return "";
  const requestedWeddingId = state.selectionEditor.weddingId || state.currentWeddingId;
  const preferredWeddingId = state.weddings.some((wedding) => wedding.id === requestedWeddingId && wedding.status === "active") ? requestedWeddingId : null;
  const activeWeddings = state.weddings
    .filter((wedding) => wedding.status === "active")
    .sort((a, b) => Number(b.id === preferredWeddingId) - Number(a.id === preferredWeddingId) || a.weddingDate.localeCompare(b.weddingDate));
  const weddingId = preferredWeddingId || activeWeddings[0]?.id;
  const selection = selectionFor(weddingId, vendor.id) || {};
  const assigned = Boolean(selectionFor(weddingId, vendor.id));
  return `<div class="modal-backdrop" data-action="close-selection-editor"></div><form class="modal-sheet compact-modal" data-action="save-selection" role="dialog" aria-modal="true" aria-label="커플별 업체 배정"><header class="modal-header"><div><span class="modal-kicker">Couple Reference</span><strong>${escapeHtml(vendor.name)}</strong></div><button class="icon-button" type="button" data-action="close-selection-editor" aria-label="닫기">${icon("x")}</button></header><div class="editor-fields"><div class="assignment-target-summary">${icon(assigned ? "circle-check" : "user-round-plus")}<span><small>${assigned ? "배정된 커플" : "배정 대상"}</small><strong>${escapeHtml(weddingName(weddingFor(weddingId)))}</strong></span></div><label>커플<select name="weddingId" required>${activeWeddings.map((wedding) => `<option value="${wedding.id}" ${wedding.id === weddingId ? "selected" : ""}>${escapeHtml(weddingName(wedding))} · ${displayDate(wedding.weddingDate)}</option>`).join("")}</select></label><div class="field-grid two-cols"><label>진행 상태<select name="status">${vendorStatuses.map((status) => `<option ${status === (selection.status || "관심") ? "selected" : ""}>${status}</option>`).join("")}</select></label><label>개별 견적<input name="quotedPrice" value="${escapeHtml(selection.quotedPrice || "")}" placeholder="공용 가격과 다를 때 입력" /></label></div><label>개별 계약 조건<textarea name="contractTerms" rows="4" placeholder="이 커플에게 적용되는 계약 조건">${escapeHtml(selection.contractTerms || "")}</textarea></label><label>플래너 메모<textarea name="plannerNote" rows="4" placeholder="고객에게 표시되지 않는 내부 메모">${escapeHtml(selection.plannerNote || "")}</textarea></label><input type="hidden" name="vendorId" value="${vendor.id}" /></div><footer class="modal-actions"><button class="secondary" type="button" data-action="close-selection-editor">취소</button><button class="primary grow" type="submit">${icon(assigned ? "save" : "user-round-plus")} ${assigned ? "배정 정보 저장" : "커플에 배정"}</button></footer></form>`;
}

function renderDayEditor() {
  const note = state.dayNotes.get(state.selectedDate);
  const readonly = !canEditWedding();
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
  if (!state.authUser || !state.wedding) {
    printRoot.innerHTML = "";
    return;
  }
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
              }).join("")}</div><div class="print-line">${escapeHtml(weekDisplayText(row))}</div></div>`).join("")}
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
  if (!canEditWedding()) throw new Error("보관된 웨딩은 다시 활성화한 뒤 수정할 수 있습니다.");
  const data = Object.fromEntries(new FormData(form));
  const currentWeddingId = state.currentWeddingId;
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

async function handleCreateWedding(form) {
  const data = Object.fromEntries(new FormData(form));
  const weddingId = throwIfError(await supabase.rpc("create_wedding", {
    p_groom_name: String(data.groomName || "").trim(),
    p_bride_name: String(data.brideName || "").trim(),
    p_wedding_date: data.weddingDate,
    p_planner_name: String(data.plannerName || "관리자").trim(),
    p_color: safeColor(data.color)
  }));
  state.weddingCreatorOpen = false;
  state.activeView = "calendar";
  await hydrateRemoteState({ id: state.authUser.uid }, { weddingId });
  render();
  notify("새 웨딩이 등록되었습니다.");
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handleCreateAccount(form) {
  if (!canEditWedding()) throw new Error("진행 중인 웨딩에서만 계정을 발급할 수 있습니다.");
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
  throwIfError(await supabase.rpc("delete_wedding_member", {
    target_wedding_id: state.currentWeddingId,
    target_user_id: memberId
  }));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("계정이 삭제되었습니다.");
}

async function handleToggleWeddingStatus() {
  if (!state.wedding || !plannerMode()) return;
  const completing = state.wedding.status === "active";
  if (completing && !confirm(`${weddingName(state.wedding)} 웨딩을 준비 완료로 보관할까요?`)) return;
  throwIfError(await supabase.from("weddings").update({
    status: completing ? "completed" : "active",
    completed_at: completing ? new Date().toISOString() : null
  }).eq("id", state.wedding.id));
  await hydrateRemoteState({ id: state.authUser.uid }, { weddingId: state.wedding.id });
  render();
  notify(completing ? "웨딩을 보관했습니다." : "웨딩을 다시 활성화했습니다.");
}

async function handleChangePassword(form) {
  const password = String(new FormData(form).get("password") || "");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  form.reset();
  notify("비밀번호가 변경되었습니다.");
}

async function handleSaveDay(form) {
  if (!canEditWedding()) throw new Error("보관된 웨딩의 일정은 수정할 수 없습니다.");
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
  if (!canEditWedding()) return;
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
  if (!canEditWedding()) return;
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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function photoFileKey(file) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

function drawPhotoCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("사진을 처리할 수 없는 브라우저입니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("사진 변환에 실패했습니다.")),
    "image/jpeg",
    quality
  ));
}

async function compressPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 등록할 수 있습니다.");
  if (file.size > photoOptimization.maxSourceBytes) throw new Error(`${file.name}: 원본 사진은 30MB 이하만 등록할 수 있습니다.`);
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sourceEdge = Math.max(sourceWidth, sourceHeight);
  if (!sourceWidth || !sourceHeight) throw new Error(`${file.name}: 이미지 크기를 확인할 수 없습니다.`);
  const ratio = Math.min(1, photoOptimization.maxEdge / sourceEdge);
  let width = Math.max(1, Math.round(sourceWidth * ratio));
  let height = Math.max(1, Math.round(sourceHeight * ratio));
  let canvas = drawPhotoCanvas(image, width, height);
  let blob;
  let quality = photoOptimization.qualitySteps.at(-1);

  for (const candidate of photoOptimization.qualitySteps) {
    quality = candidate;
    blob = await canvasToJpeg(canvas, candidate);
    if (blob.size <= photoOptimization.targetBytes) break;
  }

  const currentEdge = Math.max(width, height);
  if (blob.size > photoOptimization.targetBytes && currentEdge > photoOptimization.minEdge) {
    const targetRatio = Math.sqrt(photoOptimization.targetBytes / blob.size) * 0.96;
    const resizeRatio = Math.max(photoOptimization.minEdge / currentEdge, Math.min(0.92, targetRatio));
    width = Math.max(1, Math.round(width * resizeRatio));
    height = Math.max(1, Math.round(height * resizeRatio));
    canvas = drawPhotoCanvas(image, width, height);
    for (const candidate of [0.82, 0.78, 0.74]) {
      quality = candidate;
      blob = await canvasToJpeg(canvas, candidate);
      if (blob.size <= photoOptimization.targetBytes) break;
    }
  }

  return {
    blob,
    width,
    height,
    quality,
    originalBytes: file.size,
    optimizedBytes: blob.size
  };
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
  const photoInput = form.querySelector('[name="photos"]');
  const files = [...(photoInput?.files || [])];
  if (photoInput?.dataset.optimizing === "true") throw new Error("사진 최적화가 끝난 뒤 저장하세요.");
  const retainedPhotoIds = (existing?.photoIds || []).filter((id) => !removeIds.includes(id));
  if (retainedPhotoIds.length + files.length > 20) throw new Error("업체당 사진은 최대 20장까지 등록할 수 있습니다.");
  const createdPhotos = [];
  try {
    for (const [index, file] of files.entries()) {
      const id = `photo-${crypto.randomUUID()}`;
      const optimized = state.pendingPhotoOptimizations.get(photoFileKey(file)) || await compressPhoto(file);
      const blob = optimized.blob;
      const legacyWeddingId = state.weddings[0]?.id;
      const storagePath = `${state.authUser.uid}/${vendorId}/${id}.jpg`;
      await photoObjectStore.upload(storagePath, blob);
      createdPhotos.push({
        planner_id: state.authUser.uid,
        wedding_id: legacyWeddingId || null,
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
      status: existing?.status || "관심",
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
      vendorRow(nextVendor, state.authUser.uid, state.weddings[0]?.id),
      { onConflict: "planner_id,id" }
    ));
    if (createdPhotos.length) throwIfError(await supabase.from("vendor_photos").insert(createdPhotos));
    if (removeIds.length) {
      const removePaths = removeIds.map((id) => state.photoRecords.get(id)?.storagePath).filter(Boolean);
      if (removePaths.length) await photoObjectStore.remove(removePaths);
      throwIfError(await supabase.from("vendor_photos")
        .delete()
        .eq("planner_id", state.authUser.uid)
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
    if (paths.length) await photoObjectStore.remove(paths).catch(() => {});
    throw error;
  }
}

async function handleBulkVendorImport() {
  const preview = state.vendorImportPreview;
  if (!preview?.validCount) throw new Error("등록할 업체가 없습니다.");
  if (preview.invalidCount) throw new Error("오류 행을 수정한 뒤 파일을 다시 선택하세요.");
  state.vendorImportBusy = true;
  render();
  try {
    const plannerId = state.authUser.uid;
    const legacyWeddingId = state.weddings[0]?.id || null;
    const categoryMap = new Map(state.categories.map((category) => [normalizeSpreadsheetKey(category.name), category.id]));
    const newCategoryRows = [];
    preview.newCategories.forEach((name, index) => {
      const key = normalizeSpreadsheetKey(name);
      if (categoryMap.has(key)) return;
      const id = `category-${crypto.randomUUID()}`;
      categoryMap.set(key, id);
      newCategoryRows.push({
        planner_id: plannerId,
        wedding_id: legacyWeddingId,
        id,
        name,
        color: importedCategoryPalette[(state.categories.length + index) % importedCategoryPalette.length],
        icon: "folder",
        locked: false,
        sort_order: state.categories.length + index
      });
    });
    if (newCategoryRows.length) throwIfError(await supabase.from("vendor_categories").insert(newCategoryRows));
    const now = new Date().toISOString();
    const vendorRows = preview.rows.map((row) => {
      const existing = row.existingId ? vendorFor(row.existingId) : vendorForImportName(row.name);
      const categoryId = row.categoryId || categoryMap.get(normalizeSpreadsheetKey(row.categoryName));
      if (!categoryId) throw new Error(`${row.rowNumber}행 카테고리를 확인할 수 없습니다.`);
      const base = existing || {
        status: "관심",
        favorite: false,
        requiredMeeting: false,
        tags: [],
        packages: [],
        extraFees: [],
        photoIds: [],
        sample: false,
        updatedAtLabel: dateKey(new Date())
      };
      const nextVendor = {
        ...base,
        ...row.patch,
        id: existing?.id || `vendor-${crypto.randomUUID()}`,
        name: row.name,
        categoryId,
        photoIds: existing?.photoIds || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      return vendorRow(nextVendor, plannerId, legacyWeddingId);
    });
    for (let index = 0; index < vendorRows.length; index += 100) {
      throwIfError(await supabase.from("vendors").upsert(vendorRows.slice(index, index + 100), { onConflict: "planner_id,id" }));
    }
    state.vendorImportBusy = false;
    state.vendorImportOpen = false;
    state.vendorImportPreview = null;
    await hydrateRemoteState({ id: state.authUser.uid });
    state.activeView = "vendors";
    render();
    restoreModalFocus();
    notify(`업체 ${vendorRows.length}곳을 일괄 저장했습니다.`);
  } catch (error) {
    state.vendorImportBusy = false;
    await hydrateRemoteState({ id: state.authUser.uid }).catch(() => {});
    render();
    throw error;
  }
}

async function handleDeleteVendor(vendorId) {
  const vendor = vendorFor(vendorId);
  if (!vendor || !confirm(`${vendor.name} 업체와 등록 사진을 모두 삭제할까요?`)) return;
  const paths = (vendor.photoIds || []).map((id) => state.photoRecords.get(id)?.storagePath).filter(Boolean);
  if (paths.length) await photoObjectStore.remove(paths);
  throwIfError(await supabase.from("vendors")
    .delete()
    .eq("planner_id", state.authUser.uid)
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
    .eq("planner_id", state.authUser.uid)
    .eq("id", vendorId));
  vendor.favorite = !vendor.favorite;
  render();
}

async function handleAddCategory(form) {
  const data = Object.fromEntries(new FormData(form));
  const name = String(data.name || "").trim();
  if (state.categories.some((category) => category.name === name)) throw new Error("같은 이름의 카테고리가 있습니다.");
  throwIfError(await supabase.from("vendor_categories").insert({
    planner_id: state.authUser.uid,
    wedding_id: state.weddings[0]?.id || null,
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
    .eq("planner_id", state.authUser.uid)
    .eq("id", categoryId));
  if (state.selectedCategory === categoryId) state.selectedCategory = "all";
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
}

async function handleSaveSelection(form) {
  const data = Object.fromEntries(new FormData(form));
  const wedding = weddingFor(data.weddingId);
  if (!wedding || wedding.status !== "active") throw new Error("진행 중인 웨딩만 업체를 배정할 수 있습니다.");
  throwIfError(await supabase.from("wedding_vendor_selections").upsert({
    planner_id: state.authUser.uid,
    wedding_id: data.weddingId,
    vendor_id: data.vendorId,
    status: data.status || "관심",
    quoted_price: String(data.quotedPrice || "").trim(),
    contract_terms: String(data.contractTerms || "").trim(),
    planner_note: String(data.plannerNote || "").trim()
  }, { onConflict: "wedding_id,vendor_id" }));
  state.selectionEditor = null;
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  restoreModalFocus();
  notify("커플별 업체 정보가 저장되었습니다.");
}

async function handleRemoveSelection(weddingId, vendorId) {
  const vendor = vendorFor(vendorId);
  if (!vendor || !confirm(`${vendor.name} 업체를 이 커플의 목록에서 제외할까요?`)) return;
  throwIfError(await supabase.from("wedding_vendor_selections")
    .delete()
    .eq("wedding_id", weddingId)
    .eq("vendor_id", vendorId));
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("커플 목록에서 업체를 제외했습니다.");
}

function clearPendingPhotoUrls() {
  state.pendingPhotoGeneration += 1;
  state.pendingPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  state.pendingPhotoUrls = [];
  state.pendingPhotoOptimizations.clear();
}

async function previewSelectedPhotos(input) {
  clearPendingPhotoUrls();
  const files = [...input.files];
  if (files.length > 20) {
    input.value = "";
    throw new Error("한 번에 최대 20장까지 선택할 수 있습니다.");
  }
  const container = input.closest(".photo-uploader").querySelector(".pending-photo-preview");
  const summary = input.closest(".photo-uploader").querySelector(".pending-photo-summary");
  const submit = input.closest("form").querySelector('button[type="submit"]');
  const generation = state.pendingPhotoGeneration;
  input.dataset.optimizing = "true";
  submit.disabled = Boolean(files.length);
  summary.hidden = true;
  const originalUrls = files.map((file) => URL.createObjectURL(file));
  state.pendingPhotoUrls.push(...originalUrls);
  container.innerHTML = files.map((file, index) => `
    <span class="optimizing" data-photo-preview="${index}">
      <img src="${originalUrls[index]}" alt="추가할 사진 ${index + 1}" />
      <small>${formatFileSize(file.size)} · 최적화 중</small>
    </span>
  `).join("");

  const results = new Array(files.length);
  let nextIndex = 0;
  const optimizeNext = async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      const optimized = await compressPhoto(file);
      if (generation !== state.pendingPhotoGeneration) return;
      results[index] = optimized;
      state.pendingPhotoOptimizations.set(photoFileKey(file), optimized);
      const previewUrl = URL.createObjectURL(optimized.blob);
      state.pendingPhotoUrls.push(previewUrl);
      const item = container.querySelector(`[data-photo-preview="${index}"]`);
      if (item) {
        item.classList.remove("optimizing");
        item.querySelector("img").src = previewUrl;
        item.querySelector("small").textContent = `${formatFileSize(file.size)} → ${formatFileSize(optimized.optimizedBytes)}`;
      }
    }
  };

  try {
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, files.length) }, optimizeNext));
    const failure = workers.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    if (generation !== state.pendingPhotoGeneration || !files.length) return;
    const originalBytes = results.reduce((total, item) => total + item.originalBytes, 0);
    const optimizedBytes = results.reduce((total, item) => total + item.optimizedBytes, 0);
    const savings = originalBytes ? Math.max(0, Math.round((1 - optimizedBytes / originalBytes) * 100)) : 0;
    summary.innerHTML = `<span>원본 ${formatFileSize(originalBytes)}</span>${icon("arrow-right")}<strong>업로드 ${formatFileSize(optimizedBytes)}</strong><em>${savings}% 절감</em>`;
    summary.hidden = false;
    activateIcons();
  } catch (error) {
    if (generation === state.pendingPhotoGeneration) {
      input.value = "";
      input.dataset.optimizing = "false";
      submit.disabled = false;
      container.innerHTML = "";
      summary.hidden = true;
      clearPendingPhotoUrls();
    }
    throw error;
  } finally {
    if (generation === state.pendingPhotoGeneration) {
      input.dataset.optimizing = "false";
      submit.disabled = false;
    }
  }
}

function updateVendorFeed() {
  const feed = document.querySelector(".vendor-feed");
  const count = document.querySelector("[data-vendor-result-count]");
  if (!feed || !count) return;
  const vendors = filteredVendors();
  feed.innerHTML = renderVendorFeed();
  feed.classList.toggle("sparse", vendors.length <= 3);
  count.textContent = vendors.length;
  activateIcons();
}

function updateWeddingSwitcherList() {
  const list = document.querySelector(".context-options");
  if (!list) return;
  list.innerHTML = renderWeddingSwitcherRows();
  activateIcons();
}

function moveVendorPhoto(direction) {
  const vendor = vendorFor(state.selectedVendorId);
  const count = vendorPhotoSources(vendor).length;
  if (!count) return;
  state.selectedVendorPhotoIndex = (state.selectedVendorPhotoIndex + direction + count) % count;
  render();
}

function movePresentationPhoto(direction) {
  const vendor = vendorFor(state.presentationVendorId);
  const count = vendorPhotoSources(vendor).length;
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
  const [dayResult, weekResult, membershipResult, profileResult] = await Promise.all([
    supabase.from("day_notes").select("wedding_id,note_date,title,body,updated_by,updated_at"),
    supabase.from("week_notes").select("wedding_id,week_start,body,updated_by,updated_at"),
    supabase.from("wedding_members").select("wedding_id,user_id,role,created_at"),
    supabase.from("profiles").select("id,login_id,role,display_name,created_at")
  ]);
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
    version: 5,
    exportedAt: new Date().toISOString(),
    data: {
      weddings: state.weddings,
      dayNotes: (throwIfError(dayResult) || []).map(dayNoteFromRow),
      weekNotes: (throwIfError(weekResult) || []).map(weekNoteFromRow),
      categories: state.categories,
      vendors: state.vendors,
      selections: state.vendorSelections,
      members: (throwIfError(membershipResult) || []).map((member) => {
        const profile = (throwIfError(profileResult) || []).find((item) => item.id === member.user_id) || {};
        return { weddingId: member.wedding_id, role: member.role, loginId: profile.login_id, displayName: profile.display_name };
      }),
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
  if (payload?.version === 5 && payload.data?.weddings) return payload.data;
  if (payload?.version === 4 && payload.data) {
    const wedding = payload.data.wedding || state.wedding;
    if (!wedding?.id) throw new Error("먼저 복원 대상 커플을 선택하세요.");
    return {
      weddings: [wedding],
      dayNotes: (payload.data.dayNotes || []).map((note) => ({ ...note, weddingId: wedding.id })),
      weekNotes: (payload.data.weekNotes || []).map((note) => ({ ...note, weddingId: wedding.id })),
      categories: payload.data.categories || [],
      vendors: payload.data.vendors || [],
      selections: (payload.data.vendors || []).map((vendor) => ({ weddingId: wedding.id, vendorId: vendor.id, status: vendor.status || "관심" })),
      photos: payload.data.photos || []
    };
  }
  if (!payload?.store?.weddings) throw new Error("Marryday 백업 파일 형식이 아닙니다.");
  const legacyWeddingId = payload.store.weddings.wedding ? "wedding" : Object.keys(payload.store.weddings)[0];
  if (!legacyWeddingId) throw new Error("백업 파일에 웨딩 정보가 없습니다.");
  const wedding = { id: state.currentWeddingId || crypto.randomUUID(), ...payload.store.weddings[legacyWeddingId] };
  const vendors = Object.values(payload.store.vendors?.[legacyWeddingId] || {});
  return {
    weddings: [wedding],
    dayNotes: Object.entries(payload.store.dayNotes?.[legacyWeddingId] || {}).map(([id, note]) => ({ id, weddingId: wedding.id, ...note })),
    weekNotes: Object.entries(payload.store.weekNotes?.[legacyWeddingId] || {}).map(([id, note]) => ({ id, weddingId: wedding.id, ...note })),
    categories: payload.store.categories?.[legacyWeddingId] || [],
    vendors,
    selections: vendors.map((vendor) => ({ weddingId: wedding.id, vendorId: vendor.id, status: vendor.status || "관심" })),
    photos: (payload.photos || []).map((photo) => ({ ...photo, vendorId: photo.vendorId }))
  };
}

async function importAllData(file) {
  const payload = JSON.parse(await file.text());
  const backup = normalizeBackupPayload(payload);
  if (!confirm("백업 데이터를 현재 플래너 데이터에 병합할까요? 기존 로그인 계정은 유지됩니다.")) return;
  const plannerId = state.authUser.uid;
  const weddings = backup.weddings || [];
  if (!weddings.length) throw new Error("백업 파일에 웨딩 정보가 없습니다.");
  throwIfError(await supabase.from("weddings").upsert(weddings.map((wedding) => ({
    id: wedding.id,
    groom_name: wedding.groomName || "신랑",
    bride_name: wedding.brideName || "신부",
    wedding_date: wedding.weddingDate || defaultWeddingDate(),
    planner_name: wedding.plannerName || "관리자",
    planner_id: plannerId,
    color: safeColor(wedding.color),
    status: "active",
    completed_at: null
  })), { onConflict: "id" }));

  const categories = backup.categories?.length ? backup.categories : defaultCategories();
  const legacyWeddingId = weddings[0].id;
  throwIfError(await supabase.from("vendor_categories").upsert(
    categories.map((category, index) => categoryRow(category, plannerId, legacyWeddingId, index)),
    { onConflict: "planner_id,id" }
  ));
  if (backup.vendors?.length) {
    throwIfError(await supabase.from("vendors").upsert(
      backup.vendors.map((vendor) => vendorRow(vendor, plannerId, legacyWeddingId)),
      { onConflict: "planner_id,id" }
    ));
  }
  if (backup.dayNotes?.length) {
    throwIfError(await supabase.from("day_notes").upsert(backup.dayNotes.map((note) => ({
      wedding_id: note.weddingId || legacyWeddingId,
      note_date: note.id || note.date,
      title: note.title || "",
      body: note.text || "",
      updated_by: plannerId
    })), { onConflict: "wedding_id,note_date" }));
  }
  if (backup.weekNotes?.length) {
    throwIfError(await supabase.from("week_notes").upsert(backup.weekNotes.map((note) => ({
      wedding_id: note.weddingId || legacyWeddingId,
      week_start: note.id || note.weekStart,
      body: note.text || "",
      updated_by: plannerId
    })), { onConflict: "wedding_id,week_start" }));
  }
  if (backup.selections?.length) {
    throwIfError(await supabase.from("wedding_vendor_selections").upsert(backup.selections.map((selection) => ({
      planner_id: plannerId,
      wedding_id: selection.weddingId,
      vendor_id: selection.vendorId,
      status: selection.status || "관심",
      quoted_price: selection.quotedPrice || "",
      contract_terms: selection.contractTerms || "",
      planner_note: selection.plannerNote || ""
    })), { onConflict: "wedding_id,vendor_id" }));
  }

  const vendorIds = new Set((backup.vendors || []).map((vendor) => vendor.id));
  const photoRows = [];
  const photoOrder = new Map();
  for (const photo of backup.photos || []) {
    if (!photo.dataUrl || !photo.id || !vendorIds.has(photo.vendorId)) continue;
    const order = photoOrder.get(photo.vendorId) || 0;
    photoOrder.set(photo.vendorId, order + 1);
    const storagePath = `${plannerId}/${photo.vendorId}/${photo.id}.jpg`;
    const blob = await fetch(photo.dataUrl).then((response) => response.blob());
    await photoObjectStore.upload(storagePath, blob, { upsert: true });
    photoRows.push({
      planner_id: plannerId,
      wedding_id: legacyWeddingId,
      id: photo.id,
      vendor_id: photo.vendorId,
      storage_path: storagePath,
      file_name: photo.name || "photo.jpg",
      sort_order: order,
      created_at: photo.createdAt || new Date().toISOString()
    });
  }
  if (photoRows.length) throwIfError(await supabase.from("vendor_photos").upsert(photoRows, { onConflict: "planner_id,id" }));
  for (const wedding of weddings.filter((item) => item.status === "completed")) {
    throwIfError(await supabase.from("weddings").update({
      status: "completed",
      completed_at: wedding.completedAt || new Date().toISOString()
    }).eq("id", wedding.id));
  }
  await hydrateRemoteState({ id: state.authUser.uid });
  render();
  notify("백업 데이터를 병합했습니다.");
}

function buildPosterSvg() {
  const width = 1200;
  const height = 1700;
  const margin = 54;
  const colWidth = 342;
  const rowHeight = 360;
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
      const cy = y + 32 + weekIndex * 42;
      week.days.forEach((date, dayIndex) => {
        if (!date) return;
        const cx = x + 48 + dayIndex * 25;
        const key = dateKey(date);
        if (key === todayKey) svg += `<circle cx="${cx}" cy="${cy - 4}" r="12" fill="#ffffff" stroke="#c44958" stroke-width="2"/>`;
        svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" font-weight="${key === todayKey || state.dayNotes.has(key) ? "800" : "500"}" font-family="Arial, sans-serif" fill="${key === todayKey ? "#c44958" : state.dayNotes.has(key) ? "#167d75" : "#171916"}">${date.getDate()}</text>`;
      });
      const lineY = cy - 1;
      const text = weekDisplayText(week);
      svg += `<line x1="${x + 218}" y1="${lineY}" x2="${x + colWidth}" y2="${lineY}" stroke="#9da19a" stroke-dasharray="2 4"/>`;
      if (text) svg += `<text x="${x + colWidth - 4}" y="${lineY - 5}" text-anchor="end" font-size="16" font-family="Arial, sans-serif" fill="#171916">${escapeHtml(text)}</text>`;
    });
  });
  return `${svg}</svg>`;
}

async function downloadPng() {
  if (!state.wedding) {
    notify("먼저 커플을 선택하세요.");
    return;
  }
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

async function switchWeddingContext(weddingId, view = "calendar") {
  state.loading = true;
  render();
  try {
    await hydrateRemoteState({ id: state.authUser.uid }, { weddingId: weddingId || null });
    if (weddingId) {
      state.recentWeddingIds = [weddingId, ...state.recentWeddingIds.filter((id) => id !== weddingId)].slice(0, 5);
    }
    state.activeView = weddingId ? view : ["settings", "vendors"].includes(view) ? view : "overview";
    state.selectedDate = null;
    state.aggregateDate = null;
    state.aggregateWeekKey = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    state.loading = false;
    render();
  }
}

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  try {
    const action = form.dataset.action;
    if (action === "login") await handleLogin(form);
    if (action === "create-wedding") await handleCreateWedding(form);
    if (action === "save-wedding") await handleSaveWedding(form);
    if (action === "create-account") await handleCreateAccount(form);
    if (action === "change-password") await handleChangePassword(form);
    if (action === "save-day") await handleSaveDay(form);
    if (action === "save-vendor") await handleSaveVendor(form);
    if (action === "save-selection") await handleSaveSelection(form);
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
    if (target.dataset.view === "overview") {
      state.currentWeddingId = null;
      state.profile.weddingId = null;
      state.wedding = null;
      state.members = [];
      state.dayNotes = new Map();
      state.weekNotes = new Map();
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (action === "new-wedding") { state.weddingCreatorOpen = true; render(); }
  if (action === "close-wedding-creator") { state.weddingCreatorOpen = false; render(); }
  if (action === "open-wedding-switcher") { state.weddingSwitcherOpen = true; state.weddingSwitchQuery = ""; render(); }
  if (action === "close-wedding-switcher") { state.weddingSwitcherOpen = false; render(); }
  if (action === "switch-wedding") {
    const targetView = ["settings", "vendors"].includes(state.activeView) ? state.activeView : "calendar";
    state.weddingSwitcherOpen = false;
    await switchWeddingContext(target.dataset.wedding, targetView);
  }
  if (action === "open-wedding") await switchWeddingContext(target.dataset.wedding);
  if (action === "set-couple-status") { state.coupleStatus = target.dataset.status; state.activeView = "couples"; render(); }
  if (action === "set-couple-filter") { state.coupleQuickFilter = target.dataset.filter; render(); }
  if (action === "open-operation-filter") { state.coupleStatus = "active"; state.coupleQuickFilter = target.dataset.filter; state.activeView = "couples"; render(); }
  if (action === "open-aggregate-day") { state.aggregateDate = target.dataset.date; state.aggregateWeekKey = null; render(); }
  if (action === "open-aggregate-week") { state.aggregateWeekKey = target.dataset.week; state.aggregateDate = null; render(); }
  if (action === "close-aggregate-list") { state.aggregateDate = null; state.aggregateWeekKey = null; render(); }
  if (action === "open-aggregate-item") {
    const targetDate = target.dataset.date;
    await switchWeddingContext(target.dataset.wedding, "calendar");
    if (targetDate) { state.selectedDate = targetDate; render(); }
  }
  if (action === "select-day") { state.selectedDate = target.dataset.date; render(); }
  if (action === "close-day-editor") { state.selectedDate = null; render(); }
  if (action === "delete-day") await handleDeleteDay();
  if (action === "regen-password") target.closest("form").querySelector('[name="password"]').value = generatePassword();
  if (action === "print") { if (!state.wedding) notify("먼저 커플을 선택하세요."); else { renderPrintSheet(); window.print(); } }
  if (action === "png") await downloadPng();
  if (action === "set-category") { state.selectedCategory = target.dataset.category; render(); }
  if (action === "toggle-vendor-favorites") { state.vendorFavoriteOnly = !state.vendorFavoriteOnly; render(); }
  if (action === "open-vendor-import") {
    setModalReturn('[data-action="open-vendor-import"]');
    state.vendorImportOpen = true;
    state.vendorImportPreview = null;
    render();
    focusActiveDialog('[data-action="vendor-import-file"]');
  }
  if (action === "close-vendor-import" && !state.vendorImportBusy) {
    state.vendorImportOpen = false;
    state.vendorImportPreview = null;
    render();
    restoreModalFocus();
  }
  if (action === "download-vendor-template") await downloadVendorImportTemplate();
  if (action === "import-vendors") await handleBulkVendorImport();
  if (action === "new-vendor") { state.editingVendorId = "new"; state.selectedVendorId = null; render(); }
  if (action === "open-vendor") {
    setModalReturn(`[data-action="open-vendor"][data-vendor="${target.dataset.vendor}"]`);
    state.selectedVendorId = target.dataset.vendor;
    state.selectedVendorPhotoIndex = 0;
    state.vendorDetailTab = "overview";
    render();
    focusActiveDialog('[data-action="close-vendor-detail"]');
  }
  if (action === "close-vendor-detail") { state.selectedVendorId = null; render(); restoreModalFocus(); }
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
  if (action === "assign-vendor") {
    if (!state.weddings.some((wedding) => wedding.status === "active")) throw new Error("먼저 진행 중인 웨딩을 등록하세요.");
    setModalReturn(`[data-action="open-vendor"][data-vendor="${target.dataset.vendor}"]`);
    state.selectionEditor = { vendorId: target.dataset.vendor, weddingId: state.currentWeddingId };
    state.selectedVendorId = null;
    render();
    focusActiveDialog('select[name="weddingId"]');
  }
  if (action === "edit-selection") {
    setModalReturn(`[data-action="edit-selection"][data-vendor="${target.dataset.vendor}"][data-wedding="${target.dataset.wedding}"]`);
    state.selectionEditor = { vendorId: target.dataset.vendor, weddingId: target.dataset.wedding };
    render();
    focusActiveDialog('select[name="weddingId"]');
  }
  if (action === "close-selection-editor") { state.selectionEditor = null; render(); restoreModalFocus(); }
  if (action === "remove-selection") await handleRemoveSelection(target.dataset.wedding, target.dataset.vendor);
  if (action === "open-category-manager") { state.categoryManagerOpen = true; render(); }
  if (action === "close-category-manager") { state.categoryManagerOpen = false; render(); }
  if (action === "close-issued-account") { state.issuedAccount = null; render(); }
  if (action === "delete-category") await handleDeleteCategory(target.dataset.category);
  if (action === "open-presentation") {
    setModalReturn(`[data-action="open-vendor"][data-vendor="${target.dataset.vendor}"]`);
    state.presentationPreviewVendorId = target.dataset.vendor;
    state.presentationShowPrice = true;
    state.presentationShowTerms = true;
    state.presentationPhotoIndex = state.selectedVendorPhotoIndex;
    state.selectedVendorId = null;
    render();
    focusActiveDialog('[data-action="close-presentation-preview"]');
  }
  if (action === "close-presentation-preview") { state.presentationPreviewVendorId = null; render(); restoreModalFocus(); }
  if (action === "start-presentation") {
    state.presentationVendorId = target.dataset.vendor;
    state.presentationPreviewVendorId = null;
    render();
    focusActiveDialog('[data-action="close-presentation"]');
  }
  if (action === "close-presentation") { state.presentationVendorId = null; render(); restoreModalFocus(); }
  if (action === "presentation-prev") movePresentationPhoto(-1);
  if (action === "presentation-next") movePresentationPhoto(1);
  if (action === "delete-member") await handleDeleteMember(target.dataset.member);
  if (action === "toggle-wedding-status") await handleToggleWeddingStatus();
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
  if (target?.dataset?.action === "couple-search") {
    state.coupleQuery = target.value;
    const query = target.value.trim().toLowerCase();
    document.querySelectorAll(".couple-card").forEach((card) => {
      card.hidden = Boolean(query) && !card.textContent.toLowerCase().includes(query);
    });
  }
  if (target?.dataset?.action === "wedding-switch-search") {
    state.weddingSwitchQuery = target.value;
    updateWeddingSwitcherList();
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  try {
    if (target?.dataset?.action === "vendor-photos") await previewSelectedPhotos(target);
    if (target?.dataset?.action === "vendor-import-file" && target.files?.[0]) await handleVendorSpreadsheet(target.files[0]);
    if (target?.dataset?.action === "couple-sort") { state.coupleSort = target.value; render(); }
    if (target?.dataset?.action === "vendor-sort") { state.vendorSort = target.value; render(); }
    if (target?.dataset?.action === "presentation-show-price") { state.presentationShowPrice = target.checked; render(); focusActiveDialog('[data-action="presentation-show-price"]'); }
    if (target?.dataset?.action === "presentation-show-terms") { state.presentationShowTerms = target.checked; render(); focusActiveDialog('[data-action="presentation-show-terms"]'); }
    if (target?.dataset?.action === "data-import-file" && target.files?.[0]) await importAllData(target.files[0]);
  } catch (error) {
    alert(error.message || "파일을 처리하지 못했습니다.");
  }
});

document.addEventListener("keydown", (event) => {
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  const activeDialog = dialogs.at(-1);
  if (event.key === "Tab" && activeDialog) {
    const focusable = [...activeDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first && (!activeDialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first))) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (last && !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (state.presentationVendorId) state.presentationVendorId = null;
    else if (state.presentationPreviewVendorId) state.presentationPreviewVendorId = null;
    else if (state.vendorImportOpen && !state.vendorImportBusy) { state.vendorImportOpen = false; state.vendorImportPreview = null; }
    else if (state.weddingSwitcherOpen) state.weddingSwitcherOpen = false;
    else if (state.selectionEditor) state.selectionEditor = null;
    else if (state.weddingCreatorOpen) state.weddingCreatorOpen = false;
    else if (state.aggregateDate || state.aggregateWeekKey) { state.aggregateDate = null; state.aggregateWeekKey = null; }
    else if (state.editingVendorId) { clearPendingPhotoUrls(); state.editingVendorId = null; }
    else if (state.selectedVendorId) state.selectedVendorId = null;
    else if (state.categoryManagerOpen) state.categoryManagerOpen = false;
    else if (state.selectedDate) state.selectedDate = null;
    else return;
    render();
    restoreModalFocus();
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
