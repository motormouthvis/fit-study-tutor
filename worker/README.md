# fit-tutor-ask — Ask Grok proxy (Cloudflare Worker)

Keeps the xAI key off the phone/browser. Fixed model `grok-4.20-0309-non-reasoning`, origin locked to
https://motormouthvis.github.io, size caps, 6 follow-ups, ~20/hr + 100/day per visitor, streaming.

Deploy (needs CLOUDFLARE_API_TOKEN with Workers Scripts:Edit + Workers KV Storage:Edit, and CLOUDFLARE_ACCOUNT_ID):

    cd worker
    npx wrangler kv namespace create RATE_KV      # paste the id into wrangler.toml and uncomment the block
    printf %s "$XAI_API_KEY" | npx wrangler secret put XAI_API_KEY
    npx wrangler deploy                           # -> https://fit-tutor-ask.<subdomain>.workers.dev

Then set `url` in ../ask-config.js to that address (no trailing slash), bump the version, push.
Test: `npm test`. Local: `PORT=8787 ALLOWED_ORIGINS=http://localhost:8000 node local-server.mjs`.

## v5.2: flash card sync
`GET/PUT /progress/<code>` (same origin check). KV namespace `SYNC_KV` (id in wrangler.toml, created with `npx wrangler kv namespace create SYNC_KV`).
Merge rules come from `../sync-merge.js` (shared with the app). Caps: 400 KB per doc, 1 write per code per 2 s, 400 writes per code per day, 60 reads per code per minute per isolate. Test: `npm test`.
