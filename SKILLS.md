# SKILLS.md

**Local Dev**
- Install deps: `npm install`
- Copy dev vars: `cp .dev.vars.example .dev.vars`
- Add secrets locally in `.dev.vars` (gitignored):
- `APP_SHARED_PIN=123456`
- `SESSION_SECRET=dev-only-session-secret-change-me`
- Run app: `npm run dev`
- Open `http://localhost:5173` (Vite will proxy API calls to the Worker)

**Create D1 + Migrations**
- Create database: `wrangler d1 create simply-text-console`
- Update `wrangler.jsonc` with the returned `database_id`
- Apply local migrations: `npm run d1:migrate:local`
- Apply remote migrations: `npm run d1:migrate:remote`

**Deploy**
- Build + deploy: `npm run deploy`
- Use OAuth login for local work: `wrangler login` (no API tokens needed)
- Set secrets in prod: `wrangler secret put APP_SHARED_PIN` and `wrangler secret put SESSION_SECRET`
- Optionally override `APP_WORKSPACE_CODE` via `wrangler.toml` or `wrangler.jsonc` vars
- For CI later: use a Cloudflare API token in GitHub Secrets as `CLOUDFLARE_API_TOKEN`, optionally `CLOUDFLARE_ACCOUNT_ID` (never commit tokens).

**Test Realtime Quickly**
- Open two tabs at `/app` and log in with the same workspace.
- In another terminal: `curl -X POST http://localhost:8787/api/dev/inbound -H 'Content-Type: application/json' -d '{"fromPhone":"+14165551234","body":"Test inbound"}'`
- Confirm both tabs receive a toast and unread badge updates.

**Future Provider Interface Notes (VoIP.ms)**
- `provider.send(to: string, body: string): Promise<{ providerMessageId: string }>`
- `provider.webhookInbound(payload: unknown): { from: string; body: string; providerMessageId?: string }`
- `provider.statusCallback(payload: unknown): { providerMessageId: string; status: 'queued' | 'sent' | 'failed' }`
- Keep provider code isolated from D1 and WebSocket fan-out.
