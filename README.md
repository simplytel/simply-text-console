# simply-text-console

A Cloudflare Workers + React “Text Console” scaffold for a small dispatcher team. Includes D1 persistence, Durable Object WebSocket fan-out, and a DEV inbound simulator.

**Quickstart**
- `npm install`
- `cp .dev.vars.example .dev.vars`
- `npm run dev`

**Deploy**
- `npm run deploy`

**Environment Variables**
- `APP_WORKSPACE_CODE` (var)
- `APP_SHARED_PIN` (secret)
- `SESSION_SECRET` (secret)
- `DEV_MODE` (var, set `true` to enable `/api/dev/inbound`)

**Custom Domain**
- Add a Cloudflare Custom Domain for `simplytelecom.ca` when ready to link branding.

**Screenshots**
- Login screen: _add screenshot here_
- Inbox screen: _add screenshot here_
