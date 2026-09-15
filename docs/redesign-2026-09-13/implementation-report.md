# Implementation and verification

The approved daylight portfolio is implemented in `site-v2`. The production site has not been deployed by this task. Existing unrelated changes in `css/style.css` and `test-results/visual-audit/` were preserved.

## Design implementation

| Approved surface | Implementation | Visual evidence |
| --- | --- | --- |
| Home / Work | Concise role statement, readable requirement workflow, selected project composition, connected summaries and contact | [Desktop](implementation-captures/home-1440.png), [mobile](implementation-captures/home-390.png) |
| Experience | Reverse chronology, current role expanded, inline role details, connecting curve, résumé action | [Desktop](implementation-captures/experience-1440.png), [mobile](implementation-captures/experience-390.png) |
| Writing | Featured article, complete chronological index, accessible category controls and URL-backed filtering | [Desktop](implementation-captures/writing-1440.png), [mobile](implementation-captures/writing-390.png) |
| Lab | Four distinct illustrative previews, truthful project status, actual source/tool destinations, compact access summary | [Desktop](implementation-captures/lab-1440.png), [mobile](implementation-captures/lab-390.png) |
| About | Existing portrait, professional context, principles, professional links and contact | [Desktop](implementation-captures/about-1440.png), [mobile](implementation-captures/about-390.png) |
| Lab access | Focused Google sign-in and state-aware approved, waiting, denied/revoked, paused, exhausted and error treatments | [Desktop](implementation-captures/access-1440.png), [mobile](implementation-captures/access-390.png) |

Shared styles extend to the project index, all four case studies, existing tool workspaces, callback, admin settings and 404. Tool layouts and processing logic retain their established structure. The old dark visual authority in `DESIGN.md` and the local surface briefs has been replaced by the approved light system.

## Canonical decisions applied

- The full plan governs the generated boards' documented inconsistencies. Existing content collections supply factual descriptions, dates, companies, destinations and capabilities.
- The QA guardrails article retains its collection date, April 28, 2026. No unsubstantiated performance metrics were introduced.
- Douglas's actual portrait replaces the mockup placeholder. Existing contact destinations remain in use.
- Account execution allowance is lifetime-based; daily capacity is shared site-wide. These remain separately labeled and server-enforced.
- Admin settings remain restricted. A failed status verification does not grant tool or administrative UI access.
- Article categories map Leadership to the leadership piece; Quality engineering to trust, verification and guardrail pieces; AI & delivery to the remaining AI workflow/career pieces. All seven pieces remain available.

## Functional acceptance evidence

`site-v2/tests/scroll.spec.ts` covers native wheel behavior, explicit section navigation and focus, mobile menu Escape, cross-route anchors, filter refresh and Back, reduced motion, no-JavaScript content, all six target widths, enlarged text, project return focus and keyboard workflow selection.

`site-v2/tests/lab.spec.ts` covers signed-out gates, approval/revocation, analyzer input/results, shared exhaustion, free simulation, graph inspection and assistant results, admin restrictions, mobile tool layout, sign-out, legacy bookmarks, callback failures, request replay, stale-response races, account-versus-daily quota copy, safe return destinations, paused processing and failed status recovery.

Public routes were checked at **320, 390, 768, 1024, 1440 and 1920px**. The browser audit records visible HTML text contrast against solid ancestor surfaces and local link responses in [browser-audit.json](implementation-captures/browser-audit.json). This is targeted evidence, not a claim of complete automated WCAG certification.

The public overview is static content. Tool components use separate lazy imports and load when their gated route is opened. There is no forced scroll snapping. Explicit section navigation is interruptible and respects reduced motion; passive scrolling does not add history entries. Dedicated URLs and legacy redirects remain intact.

## Verification boundaries

Lab tests use controlled Supabase fixtures. They verify local behavior without consuming production allowances, sending notifications, or claiming a completed live Google OAuth exchange. Backend execution and authorization logic were not changed. Production Core Web Vitals require deployed field measurement; no performance improvement percentage is claimed.

The six design images are static proposals. The implementation preserves their layout language and the full specification's responsive/content rules rather than reproducing illustrative mistakes, invented copy, or clipped mobile excerpts.

## Reproduce

From `site-v2`:

```text
npm run build
npm run test:e2e
npm run dev -- --host 127.0.0.1 --port 4326
node scripts/capture-redesign.mjs
node scripts/audit-redesign.mjs
```

The capture and audit scripts use the local development server and controlled signed-out configuration. Screenshots are saved under `docs/redesign-2026-09-13/implementation-captures` so test runs do not delete them.

## Final validation — September 13, 2026

- Astro checked 52 files with zero errors, warnings, or hints; all 18 static routes built successfully.
- All 28 Playwright tests passed after the final mobile readability refinements.
- The targeted browser audit checked 9 routes and 435 visible HTML text samples: zero contrast failures and zero broken internal links.
- Twelve desktop/mobile screenshots were refreshed in `implementation-captures` and the affected mobile pages visually inspected.
- Independent finish review confirmed design-document consistency. Its three remaining findings were resolved: the mobile context graph now has a readable relationship legend, document previews stack and classifier cells wrap with readable type, and mobile career/article reading copy is at least 16px.
- `git diff --check` passed. Existing unrelated legacy stylesheet and visual-audit changes were preserved.

The local implementation is ready for review. Deployment remains a separate action.

## Graph workspace enhancement — September 14, 2026
Implemented the approved docked inspector and mobile sheet with Details, Assistant, and Entities views. Account details collapse above the workspace. Node selection does not move the page; graph position, drafts, and conversation survive view changes. Expanded mode disables background interaction and scrolling. The composer adapts to a reduced visual viewport, and submitted answers retain their context labels. Graph citations highlight entities without leaving the assistant, and graph actions remain explicit.

Validation covers entity navigation, unchanged viewport/graph transform, draft persistence, panel dismissal, background inertness, and submit-button reachability at a 390×450 viewport. Backend calls use controlled fixtures, so no production executions were consumed.
