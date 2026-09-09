# New Lab backend deployment

Target: `zlixsxbovbshsyptxymp`. Keep credentials out of browser bundles, commits, logs and chat output.

## Current release state — 2026-09-09

The reviewed migration and four Edge Functions are deployed. Production and local OAuth callback URLs are configured; existing redirects were retained. The worker secret, Vault entry, site URL and minute scheduler are configured. Live checks confirm one administrator, 10 lifetime/10 shared daily defaults, revoked client privilege grants, and HTTP 401 from all four unauthenticated endpoints.

**Remaining owner setup:** Add `RESEND_API_KEY` and `LAB_EMAIL_FROM` in this project's Edge Function secrets. Use your verified Resend sender. Neither value was present at the latest check. The already configured worker will begin delivering queued requests once both exist. Real Google consent and actual email delivery still need a controlled account smoke test; automated tests do not impersonate real recruiters.

The deployment workflow applies the checksum-tracked Lab migration before deploying functions, and publishes Pages only after the backend succeeds. `node --env-file=.env scripts/deploy-lab-schema.mjs` safely checks the current version; append `--apply` to apply a pending reviewed migration. Never edit an applied migration: add another version instead.

## Verified existing configuration

Google and GitHub OAuth are enabled. Site URL is `https://douglasottodavila.github.io`. The allow-list now includes production `/auth/callback/` and localhost/127.0.0.1 callbacks on ports 4321 and 4325. Google Cloud's redirect remains Supabase's `/auth/v1/callback`; the site's callback belongs in Supabase's allow-list.

The sole existing administrator is user UUID `3b81aae7-6256-4678-99be-fe592ce1eaad`, matching `douglas.odavila@gmail.com`. The migration seeds the new administrator flag only for that verified UUID/email combination, independently of user metadata. It retains existing approved access, and imports old execution history into lifetime accounting. Old administrator daily resets do not replenish the new budgets.

Live `profiles` grants permit privilege column writes, so the migration explicitly revokes table and column writes to `is_admin` and `has_privileges`. New authorization uses `lab_access`; legacy reservation/completion RPCs lose browser execution permissions. Deploy both legacy function names with the shared layer to restore execution securely after migration.

## Required secrets

Set these Edge Function secrets using Supabase's secrets UI or CLI with a local ignored env file:

- `RESEND_API_KEY`: Resend API key with email sending permission.
- `LAB_EMAIL_FROM`: sender using a Resend-verified domain, e.g. `Douglas Davila <lab@example.com>`.
- `LAB_SITE_URL`: `https://douglasottodavila.github.io` (or approved preview origin).
- `LAB_NOTIFICATION_SECRET`: randomly generated high entropy worker bearer token; do not use the public anon key.

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into functions. The existing assistant also requires `GEMINI_API_KEY`; `GEMINI_MODEL` is optional. The local/live audit found Gemini configured, but no Resend secrets. There is no custom Auth SMTP configured; Resend handles these approval notifications separately from Google login.

## Deployment order

1. Back up live schema and inspect the migration against it. Apply `migrations/202609080001_lab_access.sql` as a single transaction. It expects the audited legacy `profiles`, `ai_interaction_logs`, `reserve_ai_interaction`, and `complete_ai_interaction` baseline. Do not run the old bootstrap afterward.
2. Deploy `user-story-analyzer`, `operational-graph-assistant`, `lab-access`, and `lab-notifications` to the named project. `verify_jwt=false` is intentional: each public endpoint validates the user token with Auth; the worker requires its separate secret. Database execution/administration RPCs are service-only.
3. Set the secrets above. Create Vault secret `lab_notification_secret` with exactly the worker token value, then run `setup-notification-schedule.sql`. This schedules delivery every minute. Keep the worker secret only in Vault and edge secrets.
4. Add production/development OAuth callback URLs. Deploy the frontend after backend checks.
5. Use a controlled Google test identity to request access, verify owner delivery and pending state, approve it from `/settings/`, then verify the approval email and tool access. Do not send test messages to existing recruiters. Inspect `/settings/` for delivery state and attempts; retry makes pending emails due at the next scheduled run.

The worker claims up to 10 emails atomically, leases them for five minutes, retries failures with bounded exponential backoff, and uses the outbox UUID as the Resend idempotency key. Failed delivery does not erase the request or approval. Worker transport/configuration failures remain visible in pending records and schedule logs. Provider errors never include credentials in output.

## API contract

`POST /functions/v1/lab-access` with bearer user token:

- `{ "action": "status" }` -> `{ access: { state, is_admin }, usage: { lifetime_used, lifetime_limit, lifetime_remaining, daily_used, daily_limit, daily_remaining, resets_at, timezone, paused } }`. First Google access creates a pending record and one owner notification.
- `{ "action": "admin_overview" }` -> `{ requests, settings, logs, notifications }` (latest 100 execution summaries and 30 delivery records; no private prompts in overview).
- `{ "action": "review", "user_id": "uuid", "state": "approved|denied|revoked" }` -> `{ "ok": true }`.
- `{ "action": "settings", "settings": { lifetime_limit, daily_limit, timezone, notification_email, paused } }` -> `{ "ok": true }`.
- `{ "action": "retry_notifications" }` -> `{ "ok": true }`.

Existing experiment payloads now accept `request_id` UUID. Persist it for retries of the same input; use a new UUID for an intentional new run. Legacy callers without an ID receive a server-generated one and still consume the same caps. Success retains the old result and adds `execution_id` plus `aiUsage` (snake-case full usage and compatible `dailyCount`, `dailyLimit`, `remaining`). A repeated ID returns the saved result, or 409 while processing, or 502 for a failed execution; it never dispatches twice. Reusing the ID with changed input is 400. Unauthorized/unapproved calls are 401/403; exhausted/paused requests are 429.

## Verification

Run:

```powershell
deno check supabase/functions/lab-access/index.ts supabase/functions/lab-notifications/index.ts supabase/functions/user-story-analyzer/index.ts supabase/functions/operational-graph-assistant/index.ts
deno test -A supabase/tests/lab.test.ts supabase/tests/edge.test.ts supabase/tests/concurrency.test.ts
```

The suite runs the real migration in PGlite and, on Windows, an isolated native PostgreSQL 17 cluster. It verifies role/column escalation denial, old RPC denial, pending/approval, email deduplication/retry and revoked sending leases, global/lifetime budgets, timezone boundaries, replay/conflict, pause, invalid input, and expired undispatched reservations. Native cross-connection tests prove that only one request wins the last global slot and concurrent requests with the same ID reserve once. Edge handler tests verify dispatch, stored-result replay, failed-provider recording and 12,000-character story input without making real model requests.

Reserved work must claim dispatch within five minutes. If an unacknowledged reservation never dispatches, it expires and releases its allowance. Dispatched or uncertain-dispatch failures remain counted to avoid duplicate processing. Retrying an existing request does not require a new available slot; the UI offers a separate explicit new-execution action after failure.
