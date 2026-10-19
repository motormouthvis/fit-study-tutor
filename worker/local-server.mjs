// Local stand-in for the Cloudflare Worker (tests only): runs src/index.js under Node's fetch/Request/Response.
// Usage: PORT=8787 ALLOWED_ORIGINS=http://127.0.0.1:1234 [XAI_URL=...] node worker/local-server.mjs   (reads XAI_API_KEY from env; never prints it)
import http from "node:http";
import worker from "./src/index.js";
const kvm = new Map(); const SYNC_KV = { get: async (k, o) => { const v = kvm.get(k); return v == null ? null : (o && o.type === "json" ? JSON.parse(v) : v); }, put: async (k, v) => { kvm.set(k, v); } };
const env = { SYNC_KV, XAI_API_KEY: process.env.XAI_API_KEY, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS, PER_HOUR: process.env.PER_HOUR, PER_DAY: process.env.PER_DAY, XAI_URL: process.env.XAI_URL };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(",") : v);
  headers.set("CF-Connecting-IP", req.socket.remoteAddress || "local");
  const r = await worker.fetch(new Request("http://local" + req.url, { method: req.method, headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, {});
  res.writeHead(r.status, Object.fromEntries(r.headers));
  if (r.body) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; res.write(value); } }
  res.end();
}).listen(+process.env.PORT || 8787, "127.0.0.1", () => console.log("local worker on " + (process.env.PORT || 8787) + " key set: " + !!env.XAI_API_KEY));
