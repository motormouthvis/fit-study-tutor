/* fit-tutor-ask: Cloudflare Worker proxy between the MBA Study Tutor (static, GitHub Pages) and the xAI API.
   The xAI key lives only here, as the secret XAI_API_KEY. The model and the teaching instruction are fixed server-side.
   Protections: origin allow-list, request size caps, follow-up cap, per-visitor rate limit (KV), answer length cap. */
export const MODEL = "grok-4.20-0309-non-reasoning"; // cheapest current Grok chat model on docs.x.ai/docs/models (Oct 2026)
export const LIMITS = { partChars: 4000, titleChars: 200, msgChars: 1500, maxMessages: 13, maxTokens: 700, perHour: 20, perDay: 100 };
const XAI_URL = "https://api.x.ai/v1/chat/completions";
export const SYSTEM = "You are a patient tutor for Bill, an MBA beginner (BUS 5601 accounting basics, BUS 5421 managerial economics). " +
  "The student pressed 'explain further' on one part of a lesson. Explain it further in plain English for an MBA beginner: short paragraphs, " +
  "one concrete everyday or small-business example, define any jargon, show the arithmetic step by step if numbers are involved. " +
  "Keep it under about 250 words unless asked for more. For follow-up questions, stay on the lesson topic and be concise. " +
  "If you are unsure, say so. Standard textbook definitions; the professor and syllabus are the final word.";

function origins(env) { return String(env.ALLOWED_ORIGINS || "https://motormouthvis.github.io").split(",").map(s => s.trim()).filter(Boolean); }
function cors(origin) {
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
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
  const first = { role: "user", content: "Lesson topic: " + (title || "MBA lesson") + "\n\nLesson part:\n\"\"\"\n" + part + "\n\"\"\"\n\nExplain this further, in plain English, for an MBA beginner." };
  return { messages: [{ role: "system", content: SYSTEM }, first].concat(msgs) };
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

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const ok = origins(env).includes(origin);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return ok ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (url.pathname === "/health" && request.method === "GET") return json(200, { ok: true, model: MODEL, configured: !!env.XAI_API_KEY }, ok ? origin : null);
    if (!ok) return json(403, { error: "origin_not_allowed" });
    if (request.method !== "POST" || url.pathname !== "/ask") return json(404, { error: "not_found" }, origin);
    if (!env.XAI_API_KEY) return json(503, { error: "not_configured" }, origin);
    const len = +(request.headers.get("Content-Length") || 0);
    if (len > 40000) return json(413, { error: "too_large" }, origin);
    let body; try { const t = await request.text(); if (t.length > 40000) return json(413, { error: "too_large" }, origin); body = JSON.parse(t); } catch (e) { return json(400, { error: "bad_json" }, origin); }
    const built = buildMessages(body);
    if (built.error) return json(400, { error: built.error }, origin);
    const rl = await rateLimit(env, await visitorKey(request));
    if (rl) return json(429, { error: "rate_limited", scope: rl.scope, retryAfter: rl.retryAfter }, origin, { "Retry-After": String(rl.retryAfter) });
    let up;
    try { up = await fetch(env.XAI_URL || XAI_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.XAI_API_KEY },
      body: JSON.stringify({ model: MODEL, messages: built.messages, stream: true, max_tokens: LIMITS.maxTokens, temperature: 0.4 })
    }); } catch (e) { return json(502, { error: "upstream_unreachable" }, origin); }
    if (!up.ok || !up.body) { try { up.body && up.body.cancel(); } catch (e) {} return json(502, { error: "upstream_error", status: up.status }, origin); }
    return new Response(up.body, { status: 200, headers: Object.assign({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" }, cors(origin)) });
  }
};
