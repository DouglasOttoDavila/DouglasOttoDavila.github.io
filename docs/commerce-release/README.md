# Commerce Release Lab

Route: `/lab/commerce-release`. Project context: `/work/commerce-release`.

See [BRIEF.md](BRIEF.md) for the scope and [design-reference.png](design-reference.png) for the generated visual source of truth. The implementation preserves the composition and terminal language while using real Meridian source semantics, usable form controls, and optional disclosure of additional checks.

## Run locally

From `site-v2`, run `npm run dev -- --host 127.0.0.1`. The demo works without credentials or a server. A separate API service is needed only for optional live AI.

## What executes

- `supabase/functions/_shared/commerce/domain.ts`: deterministic integer-cent checkout model, eight bounded checks, greedy budget selection with four mandatory gates, release-review policy, guide transitions, and evidence export.
- The checkout UI and check runner use the same function. A prepared branch switch selects the faulty positive-amount guard or the exact-amount patch. No arbitrary or model-generated code executes.
- Browser checks are genuine local function executions, not prerecorded outcomes. They are **not external microservice, payment-provider, or Playwright executions**. Playwright separately tests the UI.
- Authored guide text is clearly labeled. The guide executes baseline checks at frame 4 and patched checks at frame 7. Back/next restores cached frame snapshots. Manual interaction takes control. The guide never consumes AI quota or grants acknowledgment.
- Planning costs are illustrative minutes. Runtime metadata measures local synchronous execution and makes no claim about CI savings.
- Four mandatory checks cover partial authorization, full authorization, decline, and inventory compensation. Optional checks cover provider partial semantics, excess authorization, zero total, and sequential idempotency. Distributed concurrency and capture timeout behavior remain unverified.
- Output IDs (`exec-*`) are distinct from canonical twin `test-*` and `ci-*` records. Both runtimes use `commerce/fixture.json`, generated from `twin/domain.ts` by `deno run --allow-read --allow-write scripts/generate-commerce-fixture.ts`. CI checks the projection against the canonical snapshot with `--check`. Source data is never overwritten or presented as a new CI run. Original source IDs and directed provenance are included in exports.

## AI enablement

1. Ensure the existing Lab access and model-preference migrations are installed.
2. Apply `supabase/migrations/202609260001_commerce_release.sql`, which preserves prior tool keys and adds `commerce-release-analyst` to the existing shared reservation allowlist. The existing GitHub Pages workflow now invokes the explicit, checksum-tracked `scripts/deploy-commerce-release.mjs --apply` after its existing schema steps.
3. Deploy `commerce-release-analyst` using the existing Supabase function deployment. Configure `NVIDIA_API_KEY` and the existing Supabase server secrets in the server environment. Never expose them in Astro `PUBLIC_*` variables.
4. Build with `PUBLIC_COMMERCE_AI_ENABLED=true`. In GitHub Actions set the repository/environment variable `PUBLIC_COMMERCE_AI_ENABLED` to `true` after the backend is configured. Default is false. This flag controls UI availability only; server authorization always applies.
5. Sign in with approved Lab access. Open the NVIDIA analysis disclosure, check available allowance, and explicitly run analysis. The account's saved allowlisted model is used.

The endpoint validates stage, branch, budget and booleans; it reconstructs its own context and recomputes bounded checks. Browser results are never accepted as trusted server execution. Response validation checks shape, length, epistemic labels and all cited IDs. This validates provenance and structure, **not semantic correctness** of model claims. The model has no checkout, state-transition, mutation, approval or deployment tools.

Context is bounded to the fixed synthetic corpus. Input is limited to 4 KB, output to 2,000 tokens, and provider timeout to 45 seconds. The shared auth/quota/idempotency infrastructure is reused. A dispatched failed call consumes allowance. An explicit retry receives a new execution ID. Old analysis is labeled stale when stage, branch, budget, review state or execution state changes. Responses are rendered as text, never HTML.

## Review semantics

- `AWAITING EVIDENCE`: no current-plan run.
- `HOLD`: an executed check fails or a mandatory check lacks passing evidence.
- `CONDITIONAL`: mandatory checks pass but optional checks are outside the current budget.
- `REVIEW PENDING`: all sandbox checks pass; local acknowledgment is still absent.
- `REVIEW READY`: the sandbox evidence package is ready for human review. This never authorizes a production release.

Budget changes retain history and invalidate the current-plan decision until a rerun. A local acknowledgment is cleared on code, budget and execution changes. Markdown/JSON exports include all retained runs, selection, exclusions, policy, source artifacts, limitations and any live analysis with its input context and stale flag. Execution history is bounded to the latest 20 manual runs. Refresh resets execution state and preserves the stage from the URL.

## Verification

From `site-v2` in PowerShell:

```powershell
$env:PUBLIC_COMMERCE_AI_ENABLED='true'
npm run build
$env:PLAYWRIGHT_CHANNEL='msedge' # omit when using installed Playwright Chromium
npx playwright test tests/commerce-domain.spec.ts tests/commerce-ui.spec.ts tests/commerce-ai.spec.ts tests/twin-domain.spec.ts tests/twin-ui.spec.ts tests/lab.spec.ts
```

From the repository root:

```powershell
deno check supabase/functions/commerce-release-analyst/index.ts
deno test --allow-read --allow-env --allow-sys supabase/tests/commerce.test.ts
```

The AI browser tests mock the authenticated endpoint; they do not incur model calls. They skip if the build flag is false. Tests cover failure/patch behavior, monetary boundaries, quota exhaustion, malformed model output, stale advice, gate semantics, snapshots, exports, theme continuity, mobile focus and overflow. Screenshots are written under `local-page-screenshots/commerce-release` relative to the test command's current directory.

Deployment and a real authenticated NVIDIA response are separate operational checks. No production publication is performed by the local implementation or tests.
