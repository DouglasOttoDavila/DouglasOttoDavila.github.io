# Quality Digital Twin · contract v1

Entirely synthetic Meridian Industrial Supply data. No employer, client, production or repository activity is collected. This directory owns the **executable canonical corpus and all scenario states**. Future Release Intelligence must import `domain.ts`, never maintain another fixture copy or import the React island.

## Boundaries

- `schema.ts`: version contract, typed records/edges/events and runtime integrity checks.
- `fixtures.ts`: immutable authored baseline, original excerpts and ordered synthetic events. Invalid fixtures throw during import/build.
- `domain.ts`: deterministic reducers, graph/evidence queries, fork comparison and JSON export. No UI, provider SDK, random number or live clock.
- `analyst.ts`: authored replay, bounded model context and strict response validation.
- `../../quality-twin-analyst/index.ts`: authenticated server call; rebuilds trusted state from scenario/cursor and validated fork events instead of trusting browser snapshots.
- `site-v2/src/components/lab/QualityTwin.tsx`: accessible list/path exploration, timeline, in-memory forks and download. Existing Context Graph was inspected; its generated class nodes/name normalization are inappropriate for this explicit-link domain and are not reused.

The static site remains static; Supabase is used only for optional live analysis. There is no additional database for twin data.

## Scenario semantics

A introduces a partial-authorization guard regression: failed checks and an open blocker remain independent. Resolving the blocker does not change execution outcomes. B reaches passing evidence and a resolved mobile visual issue. C has a passing single-request result, missing concurrent-retry evidence and pending code review. Granting review does not execute tests or grant release sign-off. Every sign-off remains pending because this twin does not decide readiness.

Baseline results are `not_run` or `unknown`. A test result event updates its matching CI artifact atomically. Test prerequisites must pass before a dependent test can pass. Relationships persist when a defect resolves: `blocks` records the authored association; consumers must inspect current defect status. Incident observations express temporal association, not PR causation. Durations are authored synthetic metadata, not measured browser performance.

Replay moves through one candidate's events while retaining the shared world and other candidates' baseline records. Queries must scope evidence by scenario. A local fork adds at most 20 events and uses the previous synthetic timestamp plus one second. Moving the timeline, changing candidate, resetting, or refreshing discards forks. Undo returns the previous immutable snapshot. No URL persistence is implemented.

## Consumer example

```ts
import { getSnapshot, getEntity, getEvidence, getTestOutcomes,
  tracePath, applyWhatIf, whatIf, exportSnapshot, assertContract }
  from './supabase/functions/_shared/twin/domain.ts';

const canonical = getSnapshot('C'); // latest; null cursor means baseline
const fork = applyWhatIf(canonical, whatIf(canonical, 'test', 'test-C2', 'fail'));
const results = getTestOutcomes('C', fork);
const evidence = getEvidence('inv-C', fork);
const exported = JSON.parse(exportSnapshot(fork));
assertContract(exported); // rejects unknown contract OR fixture revision
```

`getEntity` returns undefined for unknown IDs. `neighbors(id,snapshot,type?)` returns incident directed edges without inventing inverses. `tracePath(from,to,snapshot,maxDepth=10)` returns a shortest directed path with edge provenance; empty means no known path (or same endpoint). `getChanges` returns PR/file change edges. `getUnmapped` exposes artifacts without any explicit edge. `getEvidence().verified` means a **recorded passing execution of that specific assertion**, never proof of an entire invariant, concurrency safety, readiness or production behavior. `exportSnapshot` includes contract/revision/algorithm, full entities/relationships, event history, cursor, time, mode, scenario and derived evidence/unmapped IDs. Consumers should call `assertContract` and `validateSnapshot`; there is no implicit migration. An incompatible future revision needs an explicit migration function.

## Earlier specification reconciliation

The Northstar package in `docs/ai-release-intelligence/04-SYNTHETIC-WORLD.md` and `05-CHANGE-AND-EVIDENCE.md` became available during implementation and was inspected. It is a **design seed, not a second executable fixture**. Meridian v1 is an explicitly revised, condensed original corpus, not an ID-compatible import. No alias is inferred from names. Correspondence for reviewers:

| Seed concept | Executable revision |
|---|---|
| RC-27.4A / B / C | A / B / C |
| PR-410 / PR-411 | pr-A1 authorization / pr-A2 compensation |
| PR-420 / PR-421 | pr-B2 facet scope / pr-B1 mobile label |
| PR-430 / PR-431 | pr-C1 retry / pr-C2 notification ordering |
| SVC-WEB, CATALOG, PRICING, ORDERS, PAYMENTS, STOCK, CREDITS, NOTIFY | storefront, catalog, pricing, checkout, payment, inventory, credit, notifications |

The seed's `T-02` passes despite `after: T-01` failing: ordering must not silently imply a successful prerequisite. Meridian uses explicit `requires` only for genuine successful prerequisites. Seed `APR` records mix functional/code review and release scope; Meridian separates review and signoff types and edges. Seed single-request T-09 does not cover concurrent retries: Meridian keeps test-C1 and test-C2 separate and never presents the former as concurrent proof. Seed FILE-08 has a known PR link but unknown service mapping; Meridian preserves the same uncertainty principle with an explicitly unmapped observation, without fabricating a service edge. Seed incidents are historical staging observations; Meridian observes simulation telemetry and never asserts a causal PR→incident edge. Original seed IDs and run results are not silently translated; future consumers must adopt this versioned contract deliberately. Scope is three main invariants rather than every seed story; no risk scoring, test optimization or release recommendation was implemented.

## Live AI setup

1. Apply `supabase/migrations/202609190001_quality_twin.sql`. It adds this tool to the existing reservation allowlist while preserving shared daily/lifetime accounting, idempotency and locks.
2. Configure the existing Supabase auth/service secrets and `NVIDIA_API_KEY` server-side. The user's saved allowlisted model preference (or the site's default) is used.
3. Deploy `quality-twin-analyst` with `supabase/config.toml`; the function authenticates the bearer token itself using the existing approved-access check.
4. Build the site with `PUBLIC_TWIN_AI_ENABLED=true`. This is an availability flag, never a key. Without it, the UI explicitly says unavailable and replay remains free.

Live requests are explicit: maximum 16 KB request, 20 fork events, 24,000 context characters, 1,800 output tokens, 45-second provider timeout, six claims, eight existing citations per claim and 1,600 characters per claim. No tools are provided to the model. Artifact text is an untrusted user-message payload under a fixed server policy. All model claims are `inferred` or `unknown`; verified fixture facts are added independently by the client from the validated snapshot. Malformed output, invented IDs and model attempts to label claims as verified are rejected. Only actual calls show model/time. Dispatch consumes the shared allowance even if the provider fails; configuration and payload failures occur before reservation. Retry after an error is a new explicit execution. The server supports request-ID deduplication; a new UI click intentionally creates a new ID.

Live credentials, deployment and an actual provider response were **not** tested. Local tests validate domain behavior, malicious artifact handling, response validation and browser replay. The injection test proves separation and output rejection, not that all future models will follow instructions. The model has no reducer access regardless of its response.

## Verification

From `site-v2`: `npm run build` (includes Astro typecheck), then `$env:PLAYWRIGHT_CHANNEL='msedge'; npx playwright test tests/twin-domain.spec.ts tests/twin-ui.spec.ts`. The optional channel supports a locally installed browser when Playwright's downloaded Chromium is absent. From root: `deno check supabase/functions/quality-twin-analyst/index.ts`. This repository has no separate lint script.

Browser coverage includes Lab navigation, desktop/mobile layouts, candidate selection, canonical replay, fork changes/undo/reset, authored analysis, unknown mappings, and JSON downloads. No deployment is performed by these commands.
