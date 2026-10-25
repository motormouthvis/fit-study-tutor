/* fit-tutor-ask: Cloudflare Worker proxy between the MBA Study Tutor (static, GitHub Pages) and the xAI API.
   The xAI key lives only here, as the secret XAI_API_KEY. The model and the teaching instruction are fixed server-side.
   Protections: origin allow-list, request size caps, follow-up cap, per-visitor rate limit (KV), answer length cap. */
export const MODEL = "grok-4.20-0309-non-reasoning"; // cheapest current Grok chat model on docs.x.ai/docs/models (Oct 2026)
export const LIMITS = { partChars: 4000, titleChars: 200, msgChars: 1500, maxMessages: 13, maxTokens: 700, jsonTokens: 900, promptChars: 300, perHour: 20, perDay: 100 };
const XAI_URL = "https://api.x.ai/v1/chat/completions";
import SyncMerge from "../../sync-merge.js"; // v5.2: same merge rules as the app
export const SYSTEM = "You are a patient tutor for Bill, an MBA beginner (BUS 5601 accounting basics, BUS 5421 managerial economics). " +
  "The student pressed 'explain further' on one part of a lesson. Explain it further in plain English for an MBA beginner: short paragraphs, " +
  "one concrete everyday or small-business example, define any jargon, show the arithmetic step by step if numbers are involved. " +
  "Keep it under about 250 words unless asked for more. For follow-up questions, stay on the lesson topic and be concise. " +
  "If you are unsure, say so. Standard textbook definitions; the professor and syllabus are the final word.";

function origins(env) { return String(env.ALLOWED_ORIGINS || "https://motormouthvis.github.io").split(",").map(s => s.trim()).filter(Boolean); }
function cors(origin) {
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}
function json(status, obj, origin, extra) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json" }, origin ? cors(origin) : {}, extra || {}) });
}
const str = (v, n) => (typeof v === "string" ? v : "").slice(0, n);

// validate and build the messages sent to xAI. Returns {error} or {messages}
export function buildMessages(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const part = str(body.partText, LIMITS.partChars + 1), title = str(body.topic, LIMITS.titleChars);
  if (!part.trim()) return { error: "missing_part" };
  if (part.length > LIMITS.partChars) return { error: "part_too_long" };
  const hist = Array.isArray(body.messages) ? body.messages : [];
  if (hist.length > LIMITS.maxMessages) return { error: "too_many_followups" };
  const msgs = [];
  for (const m of hist) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return { error: "bad_message" };
    if (m.content.length > (m.role === "user" ? LIMITS.msgChars : 4000)) return { error: "message_too_long" };
    msgs.push({ role: m.role, content: m.content });
  }
  if (msgs.length && msgs[msgs.length - 1].role !== "user") return { error: "last_must_be_user" };
  if (body.kind === "card") {
    const card = { role: "user", content: "Flash card topic: " + (title || "MBA flash card") + "\n\nFlash card (front and back):\n\"\"\"\n" + part + "\n\"\"\"\n\nExplain this card in more depth, in plain English, for an MBA beginner." };
    return { messages: [{ role: "system", content: SYSTEM }, card].concat(msgs) };
  }
  const first = { role: "user", content: "Lesson topic: " + (title || "MBA lesson") + "\n\nLesson part:\n\"\"\"\n" + part + "\n\"\"\"\n\nExplain this further, in plain English, for an MBA beginner." };
  return { messages: [{ role: "system", content: SYSTEM }, first].concat(msgs) };
}

// ---- v4.9: JSON card modes (improve / expand / create). Strict JSON out, validated here and again on the client. ----
export const JSON_KINDS = { improve: { min: 1, max: 1 }, expand: { min: 3, max: 5 }, create: { min: 1, max: 1 } };
export const SYSTEM_JSON = "You write flash cards for Bill, an MBA beginner (BUS 5601 accounting basics, BUS 5421 managerial economics, finance and business basics). " +
  "Reply with ONLY one JSON object, no markdown, no code fences, no commentary, exactly in this shape: {\"cards\":[{\"front\":\"...\",\"back\":\"...\"}]}. " +
  "front = a test-style question or a term, short enough to read at a glance (under 280 characters). back = the model answer in plain English, as short as it can be and still be complete (under 800 characters), " +
  "standard textbook definitions and formulas; if numbers are involved show the arithmetic briefly. " +
  "Keep any wording the user gives inside quotation marks, and any page reference such as (p. 17), exactly as written unless the user asks for a change. " +
  "When the user's message carries an instruction of his own, that instruction outranks every rule in this message, including the length limits, and you must do what it says rather than a general rewrite. " +
  "Plain text only. Never invent facts: if you are unsure, keep the card general. " +
  "If the request is not about business, accounting, economics, finance or study skills, reply {\"cards\":[]}.";
function cardText(t) { return String(t).replace(/\s+/g, " ").trim(); }
export function buildJsonMessages(body) {
  const kind = body && body.kind, spec = JSON_KINDS[kind];
  if (!spec) return { error: "bad_kind" };
  const title = str(body.topic, LIMITS.titleChars), part = str(body.partText, LIMITS.partChars + 1), prompt = str(body.prompt, LIMITS.promptChars + 1);
  let user;
  if (kind === "create") {
    if (!prompt.trim()) return { error: "missing_prompt" };
    if (prompt.length > LIMITS.promptChars) return { error: "prompt_too_long" };
    user = "TASK: CREATE one new flash card.\nTopic area: " + (title || "any MBA topic") + "\nWhat Bill wants a card about: " + cardText(prompt) + "\nReturn exactly 1 card.";
  } else {
    if (!part.trim()) return { error: "missing_part" };
    if (part.length > LIMITS.partChars) return { error: "part_too_long" };
    // v5.9.1: Bill's own instruction comes first and outranks the task line. The app sends it at the top of
    // partText (that is the only field older deployments forward); prompt is honoured too when it is used.
    user = (prompt.trim() ? "BILL'S INSTRUCTION, which outranks everything else in this message: " + cardText(prompt) + "\n" : "") +
      (kind === "improve"
        ? "TASK: IMPROVE this flash card. If the block below opens with an instruction from Bill, do what it says and only what it says: do not reword, shorten or restyle the rest of the card, and reproduce its other sentences word for word. Otherwise make it a question Bill could be asked on a test with a short correct answer, keeping the same scope and meaning, and fix any mistakes. Return exactly 1 card."
        : "TASK: EXPAND this flash card. Write 3 to 5 NEW related flash cards that deepen understanding (related terms, formulas, a worked example, a common mistake). Do not repeat the given card. If the block below opens with an instruction from Bill, follow it.") +
      "\nAn instruction from Bill beats every rule about how a flash card should look, including any length limit." +
      "\nTopic: " + (title || "MBA flash card") + "\n\nThe card, with Bill's instruction first if he gave one:\n\"\"\"\n" + part + "\n\"\"\"";
  }
  return { kind, spec, messages: [{ role: "system", content: SYSTEM_JSON }, { role: "user", content: user }] };
}
// pull {"cards":[{front,back}]} out of the model text (tolerates code fences / chatter); null if unusable
export function parseCards(text, spec) {
  let t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  if (!o || !Array.isArray(o.cards)) return null;
  const out = [];
  for (const c of o.cards) {
    if (!c || typeof c.front !== "string" || typeof c.back !== "string") continue;
    const f = c.front.trim().slice(0, 300), bk = c.back.trim().slice(0, 900);
    if (f && bk) out.push({ front: f, back: bk });
  }
  return out.slice(0, spec ? spec.max : 5);
}

async function visitorKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fit-tutor-ask:" + ip));
  return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}
const memo = new Map(); // fallback when no KV is bound (per isolate only)
// returns null if allowed, or {retryAfter, scope} if over the limit; counts the request when allowed
export async function rateLimit(env, vk, now = Date.now()) {
  const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
  const kh = `h:${vk}:${hour}`, kd = `d:${vk}:${day}`;
  const get = async k => env.RATE_KV ? parseInt((await env.RATE_KV.get(k)) || "0", 10) : (memo.get(k) || 0);
  const put = async (k, v, ttl) => env.RATE_KV ? env.RATE_KV.put(k, String(v), { expirationTtl: ttl }) : memo.set(k, v);
  const [h, d] = await Promise.all([get(kh), get(kd)]);
  const perHour = +env.PER_HOUR || LIMITS.perHour, perDay = +env.PER_DAY || LIMITS.perDay;
  if (d >= perDay) return { scope: "day", retryAfter: (day + 1) * 86400 - Math.floor(now / 1000) };
  if (h >= perHour) return { scope: "hour", retryAfter: (hour + 1) * 3600 - Math.floor(now / 1000) };
  await Promise.all([put(kh, h + 1, 3700), put(kd, d + 1, 90000)]);
  return null;
}

// ---- v5.2: flash card progress sync. GET/PUT /progress/<code>. The code is a long random string made by the app (about 148 bits);
// KV key = "p:" + SHA-256(code), so the code itself is never stored. Free-tier friendly: PUT merges server-side and skips the write when nothing changed;
// at most one write per code every 2 s and 400 writes per code per day (counters live inside the stored doc: no extra KV writes).
export const SYNC = { maxBytes: 400000, minGapMs: 2000, perDay: 400, getsPerMin: 60 };
export const CODE_RE = /^[a-z2-9]{5}(-[a-z2-9]{5}){5}$/;
async function syncKey(code) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fit-tutor-sync:" + code)); return "p:" + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
const getMemo = new Map(); // per-isolate GET limiter (no KV writes)
function getLimited(key, now) { const m = Math.floor(now / 60000), e = getMemo.get(key); if (!e || e.m !== m) { getMemo.set(key, { m, n: 1 }); if (getMemo.size > 5000) getMemo.clear(); return false; } e.n++; return e.n > SYNC.getsPerMin; }
function cleanDoc(d) { return SyncMerge.merge(d && typeof d === "object" ? d : {}, {}); }
export async function handleSync(request, env, origin, code, now = Date.now()) {
  if (!env.SYNC_KV) return json(503, { error: "sync_not_configured" }, origin);
  code = String(code || "").toLowerCase();
  if (!CODE_RE.test(code)) return json(400, { error: "bad_code" }, origin);
  const key = await syncKey(code), nostore = { "Cache-Control": "no-store" };
  const stored = await env.SYNC_KV.get(key, { type: "json" });
  if (request.method === "GET") {
    if (getLimited(key, now)) return json(429, { error: "rate_limited", retryAfter: 30 }, origin, { "Retry-After": "30" });
    return json(200, { doc: stored ? stored.doc : null, at: stored ? stored.w : 0 }, origin, nostore);
  }
  if (request.method !== "PUT") return json(405, { error: "method_not_allowed" }, origin);
  const len = +(request.headers.get("Content-Length") || 0);
  if (len > SYNC.maxBytes) return json(413, { error: "too_large" }, origin);
  let body; try { const t = await request.text(); if (t.length > SYNC.maxBytes) return json(413, { error: "too_large" }, origin); body = JSON.parse(t); } catch (e) { return json(400, { error: "bad_json" }, origin); }
  if (!body || typeof body !== "object" || !body.doc || typeof body.doc !== "object") return json(400, { error: "bad_doc" }, origin);
  const old = stored ? stored.doc : {}, merged = cleanDoc(SyncMerge.merge(old, body.doc));
  if (stored && SyncMerge.same(merged, cleanDoc(old))) return json(200, { doc: merged, at: stored.w, unchanged: true }, origin, nostore);
  const day = Math.floor(now / 86400000), wn = stored && stored.day === day ? (stored.wn || 0) : 0;
  if (stored && now - (stored.w || 0) < SYNC.minGapMs) { const ra = Math.ceil((SYNC.minGapMs - (now - stored.w)) / 1000) || 1; return json(429, { error: "too_soon", retryAfter: ra, doc: merged }, origin, { "Retry-After": String(ra) }); }
  if (wn >= SYNC.perDay) return json(429, { error: "daily_limit", retryAfter: (day + 1) * 86400 - Math.floor(now / 1000) }, origin);
  const out = JSON.stringify({ doc: merged, w: now, day, wn: wn + 1 });
  if (out.length > SYNC.maxBytes + 2000) return json(413, { error: "too_large" }, origin);
  await env.SYNC_KV.put(key, out);
  return json(200, { doc: merged, at: now }, origin, nostore);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const ok = origins(env).includes(origin);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return ok ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (url.pathname === "/health" && request.method === "GET") return json(200, { ok: true, model: MODEL, configured: !!env.XAI_API_KEY }, ok ? origin : null);
    if (!ok) return json(403, { error: "origin_not_allowed" });
    const pm = /^\/progress\/([^/]+)$/.exec(url.pathname);
    if (pm) return handleSync(request, env, origin, decodeURIComponent(pm[1]));
    if (request.method !== "POST" || url.pathname !== "/ask") return json(404, { error: "not_found" }, origin);
    if (!env.XAI_API_KEY) return json(503, { error: "not_configured" }, origin);
    const len = +(request.headers.get("Content-Length") || 0);
    if (len > 40000) return json(413, { error: "too_large" }, origin);
    let body; try { const t = await request.text(); if (t.length > 40000) return json(413, { error: "too_large" }, origin); body = JSON.parse(t); } catch (e) { return json(400, { error: "bad_json" }, origin); }
    const isJson = body && typeof body === "object" && ["improve", "expand", "create"].includes(body.kind);
    const built = isJson ? buildJsonMessages(body) : buildMessages(body);
    if (built.error) return json(400, { error: built.error }, origin);
    const rl = await rateLimit(env, await visitorKey(request));
    if (rl) return json(429, { error: "rate_limited", scope: rl.scope, retryAfter: rl.retryAfter }, origin, { "Retry-After": String(rl.retryAfter) });
    if (isJson) {
      let jr;
      try { jr = await fetch(env.XAI_URL || XAI_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.XAI_API_KEY },
        body: JSON.stringify({ model: MODEL, messages: built.messages, stream: false, max_tokens: LIMITS.jsonTokens, temperature: 0.3, response_format: { type: "json_object" } }) }); }
      catch (e) { return json(502, { error: "upstream_unreachable" }, origin); }
      if (!jr.ok) { try { await jr.body.cancel(); } catch (e) {} return json(502, { error: "upstream_error", status: jr.status }, origin); }
      let content = ""; try { const j = await jr.json(); content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ""; } catch (e) {}
      const cards = parseCards(content, built.spec);
      return json(200, { kind: built.kind, cards, content: cards ? undefined : String(content).slice(0, 3000) }, origin, { "Cache-Control": "no-store" });
    }
    let up;
    try { up = await fetch(env.XAI_URL || XAI_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.XAI_API_KEY },
      body: JSON.stringify({ model: MODEL, messages: built.messages, stream: true, max_tokens: LIMITS.maxTokens, temperature: 0.4 })
    }); } catch (e) { return json(502, { error: "upstream_unreachable" }, origin); }
    if (!up.ok || !up.body) { try { up.body && up.body.cancel(); } catch (e) {} return json(502, { error: "upstream_error", status: up.status }, origin); }
    return new Response(up.body, { status: 200, headers: Object.assign({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" }, cors(origin)) });
  }
};
