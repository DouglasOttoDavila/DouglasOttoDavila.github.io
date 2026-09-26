# Verification — 2026-09-26

- `npm run build` with `PUBLIC_COMMERCE_AI_ENABLED=true`: passed; Astro reported zero errors, warnings, or hints.
- Playwright: 43 tests passed across the three commerce suites, existing Lab suite, and Quality Twin domain/UI suites. Microsoft Edge, desktop and mobile widths.
- `deno check supabase/functions/commerce-release-analyst/index.ts`: passed.
- PGlite migration integration: passed; approved-access enforcement, existing tool keys, request replay, shared quotas, and new commerce tool reservation verified.
- Impeccable detector over new workspace, styles, and Lab entry: no findings.
- Visual inspection: Terminal desktop/mobile and Studio desktop; generated image used for the layout and visual language. Actual UI includes accessible payment controls, planning controls, and all eight checks, so content extends below the mockup's viewport. Four mandatory checks are initially visible and remaining checks are disclosed. Desktop guide remains sticky; mobile guide stays in flow.

Functional checks include the real local regression, prepared patch, authorization boundaries, unchanged canonical twin records, explicit release gates, tour back/next restoration, user-only acknowledgment, current-plan invalidation, evidence exports, theme continuity, reduced-motion behavior, mobile focus restoration, quota exhaustion, model output rejection, and stale analysis handling.

## Operational limits

The live AI UI was tested against a mocked authenticated endpoint. A real NVIDIA response, production deployment, and remote migration execution were not performed. The new endpoint and migration must be deployed and the public availability flag enabled as documented in README.md.

Browser assertions execute the bounded local commerce model. They are not production payment-provider, distributed service, or external CI results. The separate Playwright suite validates the application UI. Existing unrelated worktree changes were retained.
