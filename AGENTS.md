# AGENTS.md

**What This Repo Is**
Text Console is a Cloudflare Workers + React single-page app that provides a simple, real-time SMS-style inbox for a small dispatcher team in Canada. It uses D1 for persistence and a Durable Object for WebSocket fan-out.

**Task Checklist**
- MVP now: shared workspace login with PIN, contacts CRUD, conversations list, message thread, realtime updates, dev inbound simulator, D1 persistence, Cloudflare deployment.
- Later: VoIP.ms provider integration, inbound webhooks, delivery status callbacks, multi-tenant UI theming.

**Operating Rules**
- Never commit secrets. Use `wrangler secret` for sensitive values.
- Keep the UI minimal, fast, and focused on dispatch workflows.
- Preserve the provider boundary so VoIP.ms or other SMS providers can be plugged in later.
- Use D1 migrations for all schema changes.

**Definition Of Done**
- Login works with workspace code + PIN + display name.
- Contacts can be created, edited, and deleted.
- Conversations persist in D1 and load on refresh.
- Realtime updates arrive via WebSocket and show unread badges.
- DEV inbound simulator works when `DEV_MODE=true`.
- `npm run deploy` successfully publishes the Worker and SPA.
