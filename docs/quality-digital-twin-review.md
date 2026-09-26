# Quality Digital Twin experience review

Completed 2026-09-26. This pass changes presentation and browser behavior while preserving the canonical fixtures, reducer, domain API and versioned export. AI Release Intelligence remains outside this implementation.

## Confirmed problems and changes

- The initial final-event view concealed the story. The explorer now starts at baseline, offers a clearly labeled jump to the first meaningful check, and shows before/event/after with changed artifacts and current evidence counts.
- Stacked diagnostic sections required excessive scanning. A coordinated map, evidence trail, inventory, what-if and analyst workbench keeps the selected artifact in an adjacent inspector on desktop. Mobile uses the accessible service list and a source shortcut that opens and focuses provenance.
- The topology list did not explain the enterprise. An authored service diagram now highlights the selected context and can filter dependencies. Dashed dependencies indicate possible propagation, never confirmed defects; AI claims cannot add map edges.
- Raw IDs dominated explanations and the trail did not follow the selected assertion. Readable titles and relationship explanations now lead; exact IDs, payloads and provenance remain expandable. The selected assertion determines its directed evidence path.
- Citation selection cleared the interpretation. Citations now preserve it; changing the snapshot clears it. Async results are bound to the complete scenario/event context, including fork payloads.
- Server-rendered controls could accept clicks before hydration. The explorer remains disabled until React is ready, with a regression test that delays its bundle.

## Verification

Manual desktop/mobile review exercised A's first failing check and blocker resolution/undo; B's passing evidence with visual-issue reopen/discard; and C's retry pass/fail, review grant and authored interpretation. Search/type filters, artifact and source inspection were also exercised. Fresh desktop and mobile screenshots were visually inspected.

Automated browser checks additionally cover every what-if control, keyboard timeline and tabs, autoplay/pause, changing evidence trails, accessible topology filtering, theme continuity, empty-state recovery, unmapped evidence, citation retention, refresh, hydration and overflow. Downloaded JSON is parsed and compared with canonical cursor/fork state. Domain tests cover deterministic replay, fixture integrity, prerequisites, invalid events, provenance and AI output validation.

- Full site browser suite: 55 passed before the final source-shortcut refinement.
- Final targeted domain/browser regression: 11 passed after that refinement.
- Final production build: 20 routes; Astro checked 64 files with zero errors, warnings or hints.
- Edge function Deno typecheck passed during implementation; backend code was unchanged by this review. No separate lint script exists.

Screenshots: `site-v2/local-page-screenshots/quality-twin-review/{baseline,payment}-{1440,390}.png`. Local preview: `http://localhost:4321/lab/quality-digital-twin`.

## Remaining work and deliberate limits

The public replay and authored synthetic interpretations work without credentials. Live AI has not been deployed or exercised against a real provider. To enable it, apply the prepared migration, verify existing server auth and NVIDIA configuration, deploy `quality-twin-analyst`, and build with `PUBLIC_TWIN_AI_ENABLED=true`. Then perform authenticated end-to-end checks of successful analysis, approval/quota rejection, malformed provider replies, timeout and retry behavior. Existing credentials were not audited; this is a verification requirement, not a claim that they are absent. See [the setup and contract](../supabase/functions/_shared/twin/README.md#live-ai-setup).

Forks remain in memory and deliberately disappear on timeline movement, candidate change, reset or refresh. The corpus remains synthetic (92 artifacts, 123 relationships); it is not connected to production telemetry and never makes a release-readiness decision. Mobile uses a list equivalent rather than a dense graph. Site publication and backend deployment were not performed.
