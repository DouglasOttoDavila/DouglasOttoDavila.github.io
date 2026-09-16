# Terminal version — page design plan

Status: implemented as the alternate Terminal version in `site-v2`. References generated September 15, 2026 with the built-in image tool. The images remain design concepts; see [implementation notes](implementation.md) for validation and intentional differences.

## Review the reference set

Open [the visual gallery](gallery.html). It contains the homepage plus one desktop reference for every remaining rendered page: 18 images total. The 17 new views include each of the four generated project routes. Articles link to LinkedIn; the document generator links to its source. Neither needs an invented local detail/tool route. Legacy is a redirect, not a separate design.

The images define composition and atmosphere. This specification and existing source content govern exact copy, URL paths, data, accessible controls and behavior. These are first-viewport concepts, not complete long-page screenshots or tested implementations.

## Shared visual contract

- Alternate version selected by top-menu Studio / Terminal control. Studio retains the existing light identity; Terminal changes composition as well as palette.
- Canvas #090E14; surfaces #101923; text #E6EDF5; secondary text #A8BDD0; dividers #293F50; cyan accent #65D9FF. Use near-black text on filled cyan controls. Validate contrast in browser.
- Reuse Onest for headings/body and Recursive for editor chrome, prompts and technical values. Body 17px/1.65; metadata 13–14px minimum; headings 36–56px desktop and 30–38px mobile. Images sometimes overuse monospace; body prose follows this specification.
- Desktop header approximately 60px; reading explorer 230–250px; thin document tab and breadcrumb strip. Flat tonal layers and 1px borders; 6–8px control corners. Main content uses native page scrolling. Avoid fixed-height document panes that truncate content.
- Reading pages: prose max 68 characters per line, optional 240–280px section outline. Tool pages: collapsed 56–72px navigation rail where useful; use the available width for inputs, results and graph.
- Only genuine controls look interactive. Remove decorative close icons on page tabs unless an actual tab model is implemented. Skills and principles are plain text, not fake buttons. Derive active navigation and breadcrumbs from canonical routes, never screenshot text.
- Theme selection uses an accessible labeled control with selected state. Persist a device-local preference before first paint, keep it across routes and OAuth, and fall back safely if storage is unavailable. Initial default remains Studio until explicitly changed; this plan does not silently replace the existing default.
- Theme switching retains route, query/hash, focus, drafts, active filters, graph camera/selection, submitted context, conversations and unsaved settings. Prefer stable React component identity and presentation changes over remounting tools. Backend access, quotas and model policies remain authoritative.

## Responsive contract

- At widths below roughly 1100px, collapse the explorer and section outline before squeezing prose or tool controls.
- Below 768px, use 20px gutters, single-column content and 44px touch targets. Keep Studio / Terminal visible beside the menu control; show the identity in a compact form.
- Mobile navigation opens in flow, uses real links and exposes expanded state. Breadcrumbs can wrap or truncate presentation without losing accessible names. No page-wide horizontal scroll.
- Preserve the graph's mobile sheet and keyboard-aware composer. Inspector is about 380px desktop, bounded by available width. Expanded workspace manages focus/background interaction; theme switch does not reset it.
- Metadata/status footer is in flow or reserves its own space; it never covers content, controls or the mobile keyboard.
- Mobile behaviors are specified here; the PNGs are desktop references and are not mobile validation evidence.

## Motion specification

| Element | Planned behavior | Limits/fallback |
| --- | --- | --- |
| CLI prompt > | One visible decorative prompt blinks at 1100ms using opacity steps; optional adjacent caret | No rapid flicker; pause while offscreen/document hidden; steady with reduced motion; hide decoration from screen readers |
| Navigation | Active underline/row tint transitions over 150ms | Visible focus is immediate; no animation required to understand selection |
| Project rows | Arrow translates 3px and border tint changes over 150ms on hover/focus | No card tilt or layout shift; still usable on touch |
| Theme change | Colors transition over 180ms, layout changes without sliding the entire document | Preserve state/focus; instant under reduced motion |
| Career disclosures | Short 180ms content reveal | Native semantic disclosure, no collapsing content on load delay |
| Illustrative flow | Connector reveal once over 450ms when first visible | Content visible by default; static under reduced motion |
| Graph selection | Border/edge emphasis over 150ms, inspector fade over 120ms | No continuous graph drift, particle effects or camera movement on ordinary selection |
| Classifier results | Bars interpolate over 180ms after actual input changes | Announce text outcome; examples never auto-start |
| Async tools/auth | Compact progress indicator only while a real request is pending | No fake percentage or log stream; static text under reduced motion |

No typing animation delays main copy. Do not make command prompts editable unless adding a separately specified real feature. This version remains navigable with ordinary clicks and keyboard links.

## Page-by-page references

| Page | Route | Reference |
| --- | --- | --- |
| Home | / | [00-home.png](00-home.png) |
| Work | /work | [01-work.png](01-work.png) |
| Experience | /experience | [02-experience.png](02-experience.png) |
| Writing | /writing | [03-writing.png](03-writing.png) |
| About | /about | [04-about.png](04-about.png) |
| Lab | /lab | [05-lab.png](05-lab.png) |
| Story analyzer case study | /work/user-story-evaluator | [06-story-case.png](06-story-case.png) |
| Context graph case study | /work/context-graph | [07-graph-case.png](07-graph-case.png) |
| Classifier case study | /work/neural-test-signal-classifier | [08-classifier-case.png](08-classifier-case.png) |
| Document generator case study | /work/ai-document-generator | [09-document-case.png](09-document-case.png) |
| User Story Quality Analyzer | /lab/user-story-analyzer | [10-analyzer.png](10-analyzer.png) |
| Operational Context Graph | /lab/context-graph | [11-graph.png](11-graph.png) |
| Operational entity record | /lab/context-graph/entity | [12-entity.png](12-entity.png) |
| Neural Test Signal Classifier | /lab/neural-test-signal-classifier | [13-classifier.png](13-classifier.png) |
| Sign in | /login | [14-login.png](14-login.png) |
| Site settings | /settings | [15-settings.png](15-settings.png) |
| Completing sign-in | /auth/callback | [16-callback.png](16-callback.png) |
| Page not found | /404 | [17-not-found.png](17-not-found.png) |

### Work

Route: `/work` · [Mockup](01-work.png)

**Composition:** Project directory with heading Tools and systems for higher quality software. Four spacious project rows with small distinct schematic previews: User Story Quality Analyzer (shipped, 2025); Operational Context Graph (prototype, 2026); Neural Test Signal Classifier (prototype, 2026); AI-Powered Document Generator (shipped, 2025). Each has concise description and Explore project link. Use technical status labels not fake metrics.

**Behavior and responsive treatment:** Rows link to the existing case-study URLs; diagrams are labeled illustrations. Preserve collection descriptions and statuses. Stack preview above text on mobile.

### Experience

Route: `/experience` · [Mockup](02-experience.png)

**Composition:** Career history as elegant vertical git-log-inspired timeline, readable prose not code. Heading A career built on making systems clearer. Top profile QA Architect · SDET · AI-driven solutions. Roles: SDET, Object Edge, Apr 2024–Present; QA Automation Lead, Object Edge, Jan 2023–Apr 2024; QA Engineer, Object Edge, Feb 2020–Jan 2023; Technical Support Assistant, Lojas Virtuais BR, Jun 2019–Feb 2020; Support & Operations, 2008–2019. Latest expanded with AI-assisted QA, requirements validation, test generation. Side index Profile, Career, Skills, Education. Skills strip Playwright / TypeScript / Python / CI/CD. Resume link.

**Behavior and responsive treatment:** Latest role expanded; other role details use accessible disclosures. In-page outline becomes a compact jump menu on mobile; retain all responsibilities, skills, education, credentials and languages below the illustrated viewport.

### Writing

Route: `/writing` · [Mockup](03-writing.png)

**Composition:** Reading-focused article index. Heading Notes on quality, AI, and engineering judgment. Featured article Your AI-generated tests can be fast. But do they create trust? with Read on LinkedIn external link. Topic controls All / Quality engineering / AI & delivery / Leadership. Article rows AI-generated code is not eliminating QA.; AI that handles the plumbing, not the judgment.; AI Just Got Promoted to Junior QA; Leadership is never only about how we treat the people below us. Clear external-link indicators. No invented dates or reading-time metrics.

**Behavior and responsive treatment:** Preserve topic query parameter, browser Back behavior, dates and excerpts from the collection. Announce result count and show Clear filters when empty. Filters wrap on mobile; external destinations remain LinkedIn.

### About

Route: `/about` · [Mockup](04-about.png)

**Composition:** Heading Curiosity, made useful. Human-centered spacious prose I’m Douglas D’Avila, an SDET based in Porto Alegre, Brazil. Describe technical support roots, test architecture, delivery systems, practical AI. Right portrait frame use attached actual portrait, preserve person identity. Guiding principles numbered rows Ship trust, not test volume.; Use AI inside guardrails.; Make failures useful.; Design for the next engineer. Footer links LinkedIn, GitHub, Résumé and Email Douglas / Book a conversation. No invented biography.

**Behavior and responsive treatment:** Use the original portrait asset directly in implementation. Stack introduction then portrait on mobile. Preserve the four complete principle descriptions and all contact links below fold.

### Lab

Route: `/lab` · [Mockup](05-lab.png)

**Composition:** Experiment launcher heading Small experiments. Inspectable decisions. Compact access strip Sign in to request access for protected tools, Continue with Google. Four experiments with distinct illustrative preview panels, clearly labeled Illustration: User Story Quality Analyzer shipped Open experiment; Operational Context Graph prototype Open experiment; Neural Test Signal Classifier prototype Free simulation; AI-Powered Document Generator shipped View source (no hosted experiment). Each has Read context link. Spacious 2 by 2 composition.

**Behavior and responsive treatment:** Show signed-out, pending, approved, denied/revoked, exhausted and paused access states. Public browsing remains usable. Classifier stays free; generator links to source. One column on mobile.

### Story analyzer case study

Route: `/work/user-story-evaluator` · [Mockup](06-story-case.png)

**Composition:** Readable case study editor document. Title User Story Quality Analyzer. Metadata shipped · 2025 · Requirements review. Sections The quality problem; What the system demonstrates; Current status. Explain ambiguous requirements, criteria-based review, suggested improvements and human review. Highlight callout Lab demo uses deterministic INVEST scoring. Access requires Google sign-in and owner approval. Illustrative preview of six INVEST bars without invented results. Buttons View source and Explore in the Lab. Right document outline and project metadata.

**Behavior and responsive treatment:** Use actual Markdown description and all sections. Outline collapses above article on mobile. Keep deterministic-demo callout and both existing destinations.

### Context graph case study

Route: `/work/context-graph` · [Mockup](07-graph-case.png)

**Composition:** Readable case study Title Operational Context Graph. prototype · 2026. Lead A relationship-first interface for inspecting delivery entities, dependencies, evidence, and the context an AI assistant should use. Big carefully spaced illustrative connected graph with Requirements, Tests, Services, Evidence nodes, explicitly captioned Illustrative relationships. Sections The quality problem / The experiment / Current status. Explore in the Lab action. Right document outline, skills D3 / Knowledge graphs / Context engineering / AI assistants.

**Behavior and responsive treatment:** Retain actual Markdown prose. Illustrative preview is not the operational dataset. Correct Work selection in explorer. On mobile outline precedes prose and diagram gets a readable stacked equivalent.

### Classifier case study

Route: `/work/neural-test-signal-classifier` · [Mockup](08-classifier-case.png)

**Composition:** Case study Title Neural Test Signal Classifier. prototype · 2026. Explain failed tests need diagnosis: regressions, flaky tests, environmental failures. Sections The quality problem and The proposed system. Distinct schematic Signals → Scoring rules → Triage, explicitly labeled Illustrative prototype, not a trained model. Three output labels Product regression / Flaky test / Infrastructure issue without invented live metrics. Explore in the Lab button. Right document outline and skills Failure classification / Test observability.

**Behavior and responsive treatment:** Retain actual proposal/prototype language, no inferred production ML. Output categories are product_regression, flaky_test and infra_issue. Diagram stacks vertically on mobile.

### Document generator case study

Route: `/work/ai-document-generator` · [Mockup](09-document-case.png)

**Composition:** Case study Title AI-Powered Document Generator. shipped · 2025 · VS Code extension. Lead Selected source files become structured Markdown documentation with configurable prompts and templates. Large illustrative split preview labeled Illustration: source tree on left, Markdown documentation outline on right. Sections What it does and Why it belongs here. Supporting text Explicit source context and reviewable Markdown output. Skills VS Code extensions / Gemini / Documentation / Prompt templates. View source external button only, no hosted run button.

**Behavior and responsive treatment:** Use source-file → Markdown preview as an illustration. Only existing View source action; no invented hosted generator. Preview panes stack on mobile.

### User Story Quality Analyzer

Route: `/lab/user-story-analyzer` · [Mockup](10-analyzer.png)

**Composition:** Operational full-width workspace with compact or collapsed site explorer. Title User Story Quality Analyzer; badge Deterministic review. Account disclosure Approved access · Usage details, no invented account data. Two equal input and output panes. Left label User story and acceptance criteria, large empty textarea placeholder As a customer, I want to… so that…, Use an example, 0 / 12,000, Review story · 1 execution. Right heading The review, calm empty state See what is clear. Find what is missing. Explain six INVEST scores, suggestions, revised story, acceptance criteria. No fake completed output. Footer Back to Lab.

**Behavior and responsive treatment:** Initial empty, example loaded, validation, busy, success, service error and retry states. Disable review for empty input, busy state or unavailable allowance. Keep retry identity and existing execution accounting. Result shows six INVEST scores, suggestions, revised story, acceptance criteria, missing context and JSON download. Mobile places input before review; announce completion without forced scrolling.

### Operational Context Graph

Route: `/lab/context-graph` · [Mockup](11-graph.png)

**Composition:** Operational graph workspace maximize usable canvas, collapse portfolio explorer to thin rail. Title Operational Context Graph. Toolbar search entities, Fit, Zoom − +, Expand workspace, compact Account & usage disclosure. Large graph canvas with legible sparse connected example delivery entities with explicit Illustrative dataset label. Right bounded inspector around 380px with tabs Details / Assistant / Entities, Assistant selected. Empty assistant text Ask about the selected context. Suggested question button What depends on this entity? Composer Ask a question about this context, model selector Saved default, Send button. Model names unspecified. No fabricated AI answer. Cyan selected graph node, thin quiet edges. Selection does not require page scroll.

**Behavior and responsive treatment:** Preserve actual dataset, account disclosure, details/assistant/entities tabs, node selection, zoom, citations, submitted context, draft and conversation. Do not send suggested questions automatically. Show loading, no search matches, dataset error, model unavailable, sending, answer, failure and retry. Mobile uses existing half-height expandable inspector sheet with close button; visual-viewport-aware composer. Escape closes inspector before exiting expanded workspace.

### Operational entity record

Route: `/lab/context-graph/entity` · [Mockup](12-entity.png)

**Composition:** Standalone entity record page. Title Operational entity record, Back to graph link. Explicit Example record badge so example is not represented as actual data. Entity Checkout API, type Service. Two-column detail with attributes table Name / Type / Description and related records list Payment service / Checkout requirement / Checkout tests. Minimal relationship schematic on right. Clear Open in graph action. Inspector-style information hierarchy. No fake health metrics, ownership people, or production status.

**Behavior and responsive treatment:** Entity query parameter remains the identity source; example screenshot is not new dataset content. Support missing/unknown ID, unavailable data and no relationships. Open in graph preserves selection. Stack attributes, relationships and connected records on mobile.

### Neural Test Signal Classifier

Route: `/lab/neural-test-signal-classifier` · [Mockup](13-classifier.png)

**Composition:** Operational tool two panes. Title Neural Test Signal Classifier, badge Free simulation. Visible disclaimer Illustrative scoring rules, not a trained model. Left controls Test or suite example checkout.spec.ts, Failure category dropdown Timeout, Retry passed checkbox checked, Pass/fail flip rate slider 0.7, Duration relative to baseline 1.5x, Changed files 2. Buttons Play examples and Next example. Right illustration labeled Example visualization, result Flaky test, horizontal bars labeled Product regression / Flaky test / Infrastructure issue without exact percentages; Intermediate activation levels and Suggested next step Inspect instability history and rerun once. No production confidence claims.

**Behavior and responsive treatment:** Keep existing scoring rules and controls: text input for test name, select for category, checkbox for retry, three range controls. Show three named intermediate activations, three actual calculated likelihoods, and next step. Examples play only on explicit click; pause available and reduced motion respected. Stack controls above results on mobile.

### Sign in

Route: `/login` · [Mockup](14-login.png)

**Composition:** Calm compact account access view within same shell. Back to Lab. Heading Explore the Lab. Text Sign in with Google to request access to protected experiments. Continue with Google button. Clear note Owner approval is required. Usage allowances are shared across protected tools. Secondary Browse public projects link. Right minimal schematic Sign in → Request access → Owner review → Explore. No email/password fields, no fake Google consent screen, no false access granted.

**Behavior and responsive treatment:** Keep Google OAuth and safe return path. Distinguish signed-out, requesting, pending approval, approved, denied/revoked and service-error states. Clear retry with input/context retained. Mobile is a compact stacked access flow.

### Site settings

Route: `/settings` · [Mockup](15-settings.png)

**Composition:** Settings page with compact shell. Heading Site settings. Top Your assistant model, Default assistant model dropdown placeholder Choose an available model, Save preference; note Applies to your account, graph can override for this visit. Below clearly bounded Administrator section with Access requests empty state No access requests yet. Processing & notifications form Lifetime executions per user 10, Shared daily executions 10, Daily reset timezone America/Sao_Paulo, Send access requests to empty field, Pause processing site-wide unchecked, Save site settings. Bottom Email delivery and Execution history empty rows. No real private emails, user identities or invented models.

**Behavior and responsive treatment:** Approved users see personal model preference; administrator tools and histories are rendered only for verified admins. Load model catalog from verified backend; loading/empty/failure disables save as appropriate. Preserve settings validation, save/busy/success/failure, access-review actions, notification retry and history tables. Mobile forms stack; wide tables scroll inside their own labeled region.

### Completing sign-in

Route: `/auth/callback` · [Mockup](16-callback.png)

**Composition:** Very restrained auth return screen in same branded editor shell with theme switcher. Centered compact content, cyan > prompt, heading Completing sign-in, text Returning you to the Lab after Google sign-in. Small subtle progress indicator. Back to Lab link. Generous negative space. Do not display successful approval or fake auth logs. Single loading state.

**Behavior and responsive treatment:** Loading only during real session exchange. On success navigate to safe saved return path; on cancellation, incomplete/expired link or exchange failure show clear error and Sign in again. Keep theme preference during OAuth redirect. Mobile uses one compact status panel.

### Page not found

Route: `/404` · [Mockup](17-not-found.png)

**Composition:** Elegant missing route page within same header explorer and editor frame. Tab missing-route. Large restrained cyan 404, small prompt > route not found. Heading This path left no evidence. Text The page may have moved, or the route was never part of the system. Primary Return home button, secondary Explore work. No fake stack traces, no error overload. Spacious minimal composition.

**Behavior and responsive treatment:** Use genuine 404 handling and existing copy; Return home and Explore work remain normal links. Do not mark Home current on missing route. Static recovery content works without JavaScript.

## Visual QA notes that override raster artifacts

The full set was visually inspected during generation. Work, Experience and Lab were revised to remove an invented ML claim/quotation and label illustration data. Remaining generator approximations are not requirements:

- Some pages incorrectly highlight overview or Work while on a Lab route. Use canonical navigation state. Case-study routes use collection IDs (for example /work/user-story-evaluator), not generated breadcrumb slugs.
- Analyzer mockup repeats homepage copy and renders a prompt instruction as a heading. Use the existing tool description and empty-state copy: “See what is clear. Find what is missing.” Keep the action disabled until a valid story and access are available. The screenshot's fake AI-document-generator Lab entry must not exist.
- Graph mockup omits the account disclosure and uses example relationships. Keep the disclosure and render the existing dataset; preserve all current search/filter/context controls even if omitted from the concept.
- Classifier image approximates control types and activation bars. Keep the source's text field and three sliders, three named activation meters and calculated likelihoods. Use “Illustrative likelihoods,” not “Model interpretation.”
- Settings image compresses the fields and tables. Preserve all existing history columns, notification retry, approval/revocation actions, validation and permissions. Never expose administrator content merely because it appears on a design board.
- About uses a generated rendering of the reference portrait. Implementation must use the original local image, and principle rows have no arrows unless they navigate somewhere real.
- Public copy comes from the existing content collections and page sources. Do not copy generated paraphrases, fake quotes, schematic relations or unverified claims into the site.
- Use flat fills despite occasional image-generated shading. Non-cyan status colors, if needed, must have a semantic purpose and readable text labels.

## Implementation sequence, when requested

1. Add shared Terminal tokens and shell alongside Studio; build accessible persisted version switch and prevent initial color flash.
2. Build Home and Work to establish shared navigation, type scale, project previews and mobile rhythm.
3. Adapt four case studies plus Experience, Writing and About using existing data and URLs.
4. Adapt Lab catalog, analyzer and classifier while preserving access rules and execution behavior.
5. Adapt graph/entity inspector and responsive workspace; verify state survives theme changes.
6. Adapt account, settings, callback and 404 states.
7. Compare implementation screenshots with this set at 1536×1024; also inspect 1280px, 768px and 390px widths. Resolve discrepancies against this written contract.

## Acceptance checks for later implementation

- Every route has the shared Terminal styling and correct active location; Studio still works.
- Theme choice survives reload, navigation and OAuth; toggling during graph use, typing and unsaved settings loses no state.
- Browser Back restores writing filters and entity navigation correctly.
- All content, project links, dates, role details and real portrait are retained; no fabricated application capabilities.
- Keyboard navigation, focus visibility, semantic headings, reduced motion, 200% zoom and contrast checks pass.
- Tools cover signed-out/pending/approved/denied/revoked/paused/exhausted, loading/error/retry/success states using existing behavior.
- Existing build and appropriate portfolio/Lab browser tests pass; screenshots are checked for spacing, clipping and unintended horizontal scrolling.

## Generation provenance

The built-in image tool generated every PNG. [prompts.json](prompts.json) records exact initial prompts, revision prompts and original generated paths. The homepage is the visual reference used for all new images. Source images are retained; project copies here are the implementation references. No image API fallback was used.
