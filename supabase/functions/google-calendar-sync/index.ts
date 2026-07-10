import { createClient } from "npm:@supabase/supabase-js@2.110.1";

type JsonRecord = Record<string, unknown>;
type Caller = { kind: "user"; plannerId: string } | { kind: "cron"; plannerId: null };
type CalendarIntegration = {
  planner_id: string;
  calendar_id: string;
  calendar_name: string;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string;
};
type SyncJob = {
  id: number;
  planner_id: string;
  source_type: "day_note" | "wedding_date";
  wedding_id: string;
  source_key: string;
  operation: "upsert" | "delete";
  payload: JsonRecord;
  attempts: number;
  updated_at: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE_KEY = environmentKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET_KEY = Deno.env.get("SUPABASE_ADMIN_KEY") || environmentKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const CALENDAR_SYNC_SECRET = Deno.env.get("CALENDAR_SYNC_SECRET") || "";
const APP_URL = "https://embrya.github.io/wedding-planner/";
const MAX_JOBS_PER_RUN = 40;
const ALLOWED_ORIGINS = new Set([
  "https://embrya.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let googleTokenCache: { token: string; expiresAt: number } | null = null;
let googleColorCache: Record<string, { background: string; foreground: string }> | null = null;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class GoogleApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function environmentKey(jsonName: string, legacyName: string) {
  const expectedPrefix = jsonName === "SUPABASE_SECRET_KEYS" ? "sb_secret_" : "sb_publishable_";
  try {
    const values: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === "string") values.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(JSON.parse(Deno.env.get(jsonName) || "{}"));
    const modern = values.find((value) => value.startsWith(expectedPrefix));
    if (modern) return modern;
  } catch {
    // Fall through to the legacy project key below.
  }
  return Deno.env.get(legacyName) || "";
}

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL.replace(/\/$/, "");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-calendar-sync-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
}

function jsonResponse(origin: string | null, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function serviceAccount() {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
  if (!raw) throw new HttpError(503, "Google 서비스 계정 Secret이 설정되지 않았습니다.");
  try {
    const value = JSON.parse(raw) as { client_email?: string; private_key?: string; token_uri?: string };
    if (!value.client_email || !value.private_key) throw new Error("missing fields");
    return value as { client_email: string; private_key: string; token_uri?: string };
  } catch {
    throw new HttpError(503, "Google 서비스 계정 Secret 형식이 올바르지 않습니다.");
  }
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemBytes(pem: string) {
  const binary = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function googleAccessToken(forceRefresh = false) {
  if (!forceRefresh && googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60_000) {
    return googleTokenCache.token;
  }
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new GoogleApiError(response.status, payload.error_description || "Google 인증 토큰을 발급하지 못했습니다.");
  }
  googleTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in || 3600) * 1000
  };
  return payload.access_token;
}

async function googleFetch(path: string, init: RequestInit = {}, retryAuth = true): Promise<unknown> {
  const token = await googleAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { ...init, headers });
  if (response.status === 401 && retryAuth) {
    googleTokenCache = null;
    await googleAccessToken(true);
    return googleFetch(path, init, false);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  let payload: JsonRecord = {};
  try { payload = text ? JSON.parse(text) as JsonRecord : {}; } catch { payload = {}; }
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new GoogleApiError(response.status, error?.message || `Google Calendar API 오류 (${response.status})`);
  }
  return payload;
}

async function authenticate(request: Request): Promise<Caller> {
  const cronSecret = request.headers.get("x-calendar-sync-secret") || "";
  if (CALENDAR_SYNC_SECRET && cronSecret === CALENDAR_SYNC_SECRET) return { kind: "cron", plannerId: null };

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "로그인이 필요합니다.");
  const token = authorization.slice(7);
  const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "로그인 세션이 만료되었습니다.");
  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || profile?.role !== "planner") throw new HttpError(403, "플래너만 캘린더를 관리할 수 있습니다.");
  return { kind: "user", plannerId: userData.user.id };
}

function requirePlanner(caller: Caller) {
  if (caller.kind !== "user") throw new HttpError(403, "사용자 호출이 필요한 작업입니다.");
  return caller.plannerId;
}

async function integrationFor(plannerId: string, requireEnabled = true): Promise<CalendarIntegration> {
  const { data, error } = await admin
    .from("calendar_integrations")
    .select("planner_id,calendar_id,calendar_name,enabled,last_sync_at,last_error")
    .eq("planner_id", plannerId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || (requireEnabled && !data.enabled)) throw new HttpError(409, "Google 캘린더가 연결되지 않았습니다.");
  return data as CalendarIntegration;
}

async function calendarListItem(calendarId: string) {
  try {
    await googleFetch("/users/me/calendarList", {
      method: "POST",
      body: JSON.stringify({ id: calendarId, selected: true, hidden: false })
    });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
  }
  const item = await googleFetch(`/users/me/calendarList/${encodeURIComponent(calendarId)}`) as {
    id?: string;
    summary?: string;
    timeZone?: string;
    accessRole?: string;
  };
  if (!item.id || !["writer", "owner"].includes(item.accessRole || "")) {
    throw new HttpError(403, "서비스 계정에 '일정 변경' 권한으로 캘린더를 공유하세요.");
  }
  return item;
}

async function statusFor(plannerId: string) {
  const { data: integration, error } = await admin
    .from("calendar_integrations")
    .select("calendar_id,calendar_name,enabled,last_sync_at,last_error")
    .eq("planner_id", plannerId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  const { count: pendingCount } = await admin
    .from("calendar_sync_queue")
    .select("id", { count: "exact", head: true })
    .eq("planner_id", plannerId);
  const { count: eventCount } = await admin
    .from("calendar_event_links")
    .select("google_event_id", { count: "exact", head: true })
    .eq("planner_id", plannerId);
  let email = "";
  try { email = serviceAccount().client_email; } catch { /* setup status reports this separately */ }
  return {
    configured: Boolean(integration?.enabled && integration?.calendar_id),
    setupReady: Boolean(email),
    serviceAccountEmail: email,
    calendarId: integration?.calendar_id || "",
    calendarName: integration?.calendar_name || "Marryday Planner",
    enabled: Boolean(integration?.enabled),
    lastSyncAt: integration?.last_sync_at || null,
    lastError: integration?.last_error || "",
    pendingCount: pendingCount || 0,
    eventCount: eventCount || 0
  };
}

function queueRow(plannerId: string, sourceType: "day_note" | "wedding_date", weddingId: string, sourceKey: string, operation: "upsert" | "delete" = "upsert") {
  return {
    planner_id: plannerId,
    source_type: sourceType,
    wedding_id: weddingId,
    source_key: sourceKey,
    operation,
    payload: { force: true },
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    locked_at: null,
    last_error: ""
  };
}

async function enqueueFullSync(plannerId: string) {
  await integrationFor(plannerId);
  const { data: weddings, error: weddingError } = await admin
    .from("weddings")
    .select("id")
    .eq("planner_id", plannerId)
    .eq("status", "active");
  if (weddingError) throw new HttpError(500, weddingError.message);
  const weddingIds = (weddings || []).map((wedding) => wedding.id as string);
  const rows = weddingIds.map((weddingId) => queueRow(plannerId, "wedding_date", weddingId, "wedding-date"));
  let notes: Array<{ wedding_id: string; note_date: string }> = [];
  if (weddingIds.length) {
    const { data, error } = await admin
      .from("day_notes")
      .select("wedding_id,note_date")
      .in("wedding_id", weddingIds);
    if (error) throw new HttpError(500, error.message);
    notes = data || [];
    notes.forEach((note) => rows.push(queueRow(plannerId, "day_note", note.wedding_id, note.note_date)));
  }

  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await admin
      .from("calendar_sync_queue")
      .upsert(rows.slice(index, index + 100), {
        onConflict: "planner_id,source_type,wedding_id,source_key"
      });
    if (error) throw new HttpError(500, error.message);
  }

  if (weddingIds.length) {
    const sourceKeys = new Set(rows.map((row) => `${row.source_type}:${row.wedding_id}:${row.source_key}`));
    const { data: links, error } = await admin
      .from("calendar_event_links")
      .select("source_type,wedding_id,source_key")
      .eq("planner_id", plannerId)
      .in("wedding_id", weddingIds);
    if (error) throw new HttpError(500, error.message);
    const stale = (links || [])
      .filter((link) => !sourceKeys.has(`${link.source_type}:${link.wedding_id}:${link.source_key}`))
      .map((link) => queueRow(plannerId, link.source_type, link.wedding_id, link.source_key, "delete"));
    if (stale.length) {
      const { error: staleError } = await admin
        .from("calendar_sync_queue")
        .upsert(stale, { onConflict: "planner_id,source_type,wedding_id,source_key" });
      if (staleError) throw new HttpError(500, staleError.message);
    }
  }
  return rows.length;
}

function nextDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicEventId(job: SyncJob) {
  return `md${(await sha256Hex(`${job.planner_id}|${job.source_type}|${job.wedding_id}|${job.source_key}`)).slice(0, 40)}`;
}

function rgb(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#39756c";
  return [1, 3, 5].map((index) => Number.parseInt(safe.slice(index, index + 2), 16));
}

async function nearestGoogleColor(color: string) {
  if (!googleColorCache) {
    try {
      const response = await googleFetch("/colors") as { event?: Record<string, { background: string; foreground: string }> };
      googleColorCache = response.event || {};
    } catch {
      googleColorCache = {};
    }
  }
  const target = rgb(color);
  let closest = "";
  let distance = Number.POSITIVE_INFINITY;
  Object.entries(googleColorCache).forEach(([id, value]) => {
    const candidate = rgb(value.background);
    const score = candidate.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
    if (score < distance) { distance = score; closest = id; }
  });
  return closest;
}

async function eventSource(job: SyncJob) {
  const { data: wedding, error: weddingError } = await admin
    .from("weddings")
    .select("id,groom_name,bride_name,wedding_date,planner_name,color,status")
    .eq("planner_id", job.planner_id)
    .eq("id", job.wedding_id)
    .maybeSingle();
  if (weddingError) throw new HttpError(500, weddingError.message);
  if (!wedding) return null;
  if (job.source_type === "wedding_date") {
    return { wedding, date: wedding.wedding_date as string, title: "예식일", body: "", weddingDate: true };
  }
  const { data: note, error: noteError } = await admin
    .from("day_notes")
    .select("note_date,title,body")
    .eq("wedding_id", job.wedding_id)
    .eq("note_date", job.source_key)
    .maybeSingle();
  if (noteError) throw new HttpError(500, noteError.message);
  if (!note) return null;
  return {
    wedding,
    date: note.note_date as string,
    title: String(note.title || "").trim() || "일정",
    body: String(note.body || "").trim(),
    weddingDate: false
  };
}

async function buildEvent(job: SyncJob) {
  const source = await eventSource(job);
  if (!source) return null;
  const coupleName = `${source.wedding.groom_name} · ${source.wedding.bride_name}`;
  const description = [
    source.body,
    `담당 플래너: ${source.wedding.planner_name || "관리자"}`,
    `Marryday에서 관리: ${APP_URL}`
  ].filter(Boolean).join("\n\n").slice(0, 8192);
  const colorId = await nearestGoogleColor(String(source.wedding.color || ""));
  const event: JsonRecord = {
    id: await deterministicEventId(job),
    summary: `[${coupleName}] ${source.title}`.slice(0, 900),
    description,
    start: { date: source.date },
    end: { date: nextDate(source.date) },
    visibility: "private",
    transparency: source.weddingDate ? "opaque" : "transparent",
    reminders: { useDefault: true },
    extendedProperties: {
      private: {
        source: "marryday",
        source_type: job.source_type,
        wedding_id: job.wedding_id,
        source_key: job.source_key
      }
    }
  };
  if (colorId) event.colorId = colorId;
  return event;
}

async function deleteGoogleEvent(calendarId: string, eventId: string) {
  try {
    await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || ![404, 410].includes(error.status)) throw error;
  }
}

async function upsertGoogleEvent(calendarId: string, event: JsonRecord) {
  const eventId = String(event.id);
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`;
  try {
    return await googleFetch(path, { method: "PUT", body: JSON.stringify(event) });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || ![404, 410].includes(error.status)) throw error;
    return googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify(event)
    });
  }
}

async function markJobFailure(job: SyncJob, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : "알 수 없는 동기화 오류";
  const attempts = job.attempts + 1;
  const delays = [1, 5, 15, 30, 60, 180];
  const nextAttempt = new Date(Date.now() + delays[Math.min(attempts - 1, delays.length - 1)] * 60_000).toISOString();
  await admin.from("calendar_sync_queue").update({
    attempts,
    next_attempt_at: nextAttempt,
    locked_at: null,
    last_error: message
  }).eq("id", job.id).eq("updated_at", job.updated_at);
  await admin.from("calendar_integrations").update({ last_error: message }).eq("planner_id", job.planner_id);
}

async function processJob(job: SyncJob, integration: CalendarIntegration) {
  const eventId = await deterministicEventId(job);
  if (job.operation === "delete") {
    await deleteGoogleEvent(integration.calendar_id, eventId);
    await admin.from("calendar_event_links").delete()
      .eq("planner_id", job.planner_id)
      .eq("source_type", job.source_type)
      .eq("wedding_id", job.wedding_id)
      .eq("source_key", job.source_key);
  } else {
    const event = await buildEvent(job);
    if (!event) {
      await deleteGoogleEvent(integration.calendar_id, eventId);
      await admin.from("calendar_event_links").delete()
        .eq("planner_id", job.planner_id)
        .eq("source_type", job.source_type)
        .eq("wedding_id", job.wedding_id)
        .eq("source_key", job.source_key);
    } else {
      await upsertGoogleEvent(integration.calendar_id, event);
      const payloadHash = await sha256Hex(JSON.stringify(event));
      const { error } = await admin.from("calendar_event_links").upsert({
        planner_id: job.planner_id,
        source_type: job.source_type,
        wedding_id: job.wedding_id,
        source_key: job.source_key,
        google_event_id: eventId,
        payload_hash: payloadHash,
        sync_status: "synced",
        last_error: "",
        synced_at: new Date().toISOString()
      }, { onConflict: "planner_id,source_type,wedding_id,source_key" });
      if (error) throw new HttpError(500, error.message);
    }
  }
  await admin.from("calendar_sync_queue").delete().eq("id", job.id).eq("updated_at", job.updated_at);
}

async function drainQueue(plannerId: string | null) {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  let staleUpdate = admin.from("calendar_sync_queue").update({ locked_at: null }).lt("locked_at", staleBefore);
  if (plannerId) staleUpdate = staleUpdate.eq("planner_id", plannerId);
  await staleUpdate;

  let query = admin
    .from("calendar_sync_queue")
    .select("id,planner_id,source_type,wedding_id,source_key,operation,payload,attempts,updated_at")
    .lte("next_attempt_at", new Date().toISOString())
    .is("locked_at", null)
    .order("next_attempt_at")
    .limit(MAX_JOBS_PER_RUN);
  if (plannerId) query = query.eq("planner_id", plannerId);
  const { data: jobs, error } = await query;
  if (error) throw new HttpError(500, error.message);

  const integrationCache = new Map<string, CalendarIntegration>();
  const failedPlanners = new Set<string>();
  let processed = 0;
  let failed = 0;
  for (const selectedJob of jobs || []) {
    const job = selectedJob as SyncJob;
    const lockedAt = new Date().toISOString();
    const { data: locked } = await admin
      .from("calendar_sync_queue")
      .update({ locked_at: lockedAt })
      .eq("id", job.id)
      .eq("updated_at", job.updated_at)
      .is("locked_at", null)
      .select("id,updated_at")
      .maybeSingle();
    if (!locked) continue;
    job.updated_at = locked.updated_at;
    try {
      let integration = integrationCache.get(job.planner_id);
      if (!integration) {
        integration = await integrationFor(job.planner_id);
        integrationCache.set(job.planner_id, integration);
      }
      await processJob(job, integration);
      processed += 1;
    } catch (jobError) {
      await markJobFailure(job, jobError);
      failedPlanners.add(job.planner_id);
      failed += 1;
    }
  }
  for (const integration of integrationCache.values()) {
    const update: JsonRecord = { last_sync_at: new Date().toISOString() };
    if (!failedPlanners.has(integration.planner_id)) update.last_error = "";
    await admin.from("calendar_integrations").update(update).eq("planner_id", integration.planner_id);
  }
  return { processed, failed, remainingBatch: (jobs || []).length === MAX_JOBS_PER_RUN };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse(origin, { error: "POST 요청만 지원합니다." }, 405);
  try {
    if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) throw new HttpError(503, "Supabase Function 환경 변수가 없습니다.");
    const caller = await authenticate(request);
    const body = await request.json().catch(() => ({})) as { action?: string; calendarId?: string };
    const action = body.action || "status";

    if (action === "status") {
      const plannerId = requirePlanner(caller);
      return jsonResponse(origin, { data: await statusFor(plannerId) });
    }

    if (action === "configure") {
      const plannerId = requirePlanner(caller);
      const calendarId = String(body.calendarId || "").trim();
      if (!calendarId || calendarId.length > 512) throw new HttpError(400, "Google 캘린더 ID를 확인하세요.");
      const item = await calendarListItem(calendarId);
      const { error } = await admin.from("calendar_integrations").upsert({
        planner_id: plannerId,
        provider: "google",
        calendar_id: calendarId,
        calendar_name: item.summary || "Marryday Planner",
        enabled: true,
        last_error: ""
      }, { onConflict: "planner_id" });
      if (error) throw new HttpError(500, error.message);
      const queued = await enqueueFullSync(plannerId);
      const sync = await drainQueue(plannerId);
      return jsonResponse(origin, { data: { ...(await statusFor(plannerId)), queued, sync } });
    }

    if (action === "verify") {
      const plannerId = requirePlanner(caller);
      const integration = await integrationFor(plannerId);
      const item = await calendarListItem(integration.calendar_id);
      await admin.from("calendar_integrations").update({
        calendar_name: item.summary || integration.calendar_name,
        last_error: ""
      }).eq("planner_id", plannerId);
      return jsonResponse(origin, { data: await statusFor(plannerId) });
    }

    if (action === "full_sync") {
      const plannerId = requirePlanner(caller);
      const queued = await enqueueFullSync(plannerId);
      const sync = await drainQueue(plannerId);
      return jsonResponse(origin, { data: { ...(await statusFor(plannerId)), queued, sync } });
    }

    if (action === "drain") {
      const plannerId = caller.kind === "user" ? caller.plannerId : null;
      const sync = await drainQueue(plannerId);
      const data = plannerId ? { ...(await statusFor(plannerId)), sync } : { sync };
      return jsonResponse(origin, { data });
    }

    if (action === "disable") {
      const plannerId = requirePlanner(caller);
      await admin.from("calendar_integrations").update({ enabled: false, last_error: "" }).eq("planner_id", plannerId);
      await admin.from("calendar_sync_queue").delete().eq("planner_id", plannerId);
      return jsonResponse(origin, { data: await statusFor(plannerId) });
    }

    throw new HttpError(400, "지원하지 않는 캘린더 작업입니다.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof GoogleApiError ? Math.max(400, error.status) : 500;
    const message = error instanceof Error ? error.message : "캘린더 처리 중 오류가 발생했습니다.";
    return jsonResponse(origin, { error: message }, status);
  }
});
