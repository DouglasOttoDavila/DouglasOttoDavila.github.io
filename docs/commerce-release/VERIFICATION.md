# Verification — 2026-09-26

- `npm run build` with `PUBLIC_COMMERCE_AI_ENABLED=true`: passed; Astro reported zero errors, warnings, or hints.
- Follow-up review: 44 Playwright tests passed across the three commerce suites, existing Lab suite, and Quality Twin domain/UI suites. Microsoft Edge, desktop and mobile widths. New coverage requires every exported artifact, AI context artifact, and impact edge endpoint to resolve.
- `deno check supabase/functions/commerce-release-analyst/index.ts`: passed.
- PGlite migration integration: passed; approved-access enforcement, existing tool keys, request replay, shared quotas, and new commerce tool reservation verified.
- Impeccable detector over new workspace, styles, and Lab entry: no findings.
- Visual inspection: Terminal desktop/mobile and Studio desktop; generated image used for the layout and visual language. Actual UI includes accessible payment controls, planning controls, and all eight checks, so content extends below the mockup's viewport. Four mandatory checks are initially visible and remaining checks are disclosed. Desktop guide remains sticky; mobile guide stays in flow.

Functional checks include the real local regression, prepared patch, authorization boundaries, unchanged canonical twin records, explicit release gates, tour back/next restoration, user-only acknowledgment, current-plan invalidation, evidence exports, theme continuity, reduced-motion behavior, mobile focus restoration, quota exhaustion, model output rejection, and stale analysis handling.

## Operational limits

The original deployment subsequently completed through GitHub Actions. The public page returned 200 and the protected function returned 401 without authentication. The live AI UI is tested against a mocked authenticated endpoint; a real authenticated NVIDIA response has not been verified.

Follow-up review found an incomplete hand-written evidence projection and an unverified legacy checksum exemption. Evidence is now generated from the canonical Twin snapshot, with a CI freshness check. A read-only query confirmed the installed commerce function body and security settings match the reviewed migration; checksum reconciliation now requires this comparison. The `/lab` flagship card matches neighboring card borders, radii and backgrounds in both themes, with desktop/mobile screenshots and no horizontal overflow at 1440px and 390px.

Browser assertions execute the bounded local commerce model. They are not production payment-provider, distributed service, or external CI results. The separate Playwright suite validates the application UI. Existing unrelated worktree changes were retained.
