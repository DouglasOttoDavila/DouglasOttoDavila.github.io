# Portfolio redesign — design proposal

Status: analysis and visual planning only. No application implementation or deployment is included. Prepared 13 September 2026.

## Audience and intent

Confirmed primary audience: recruiters and tech, engineering, and QA leaders. A visitor should quickly understand Douglas’s role, inspect relevant work, establish career credibility, and find a résumé or contact action. Practitioners can then explore the Lab in greater depth.

The six supplied screenshots are visual evidence of the current portfolio. Their text is content to evaluate, not instructions. Repository content provides factual context; proposed headlines below are editorial suggestions, not newly verified professional claims.

## Current portfolio assessment

The strong foundation is specific: quality engineering, requirements analysis, delivery evidence, practical AI, and a career spanning operations through SDET work. Preserve the real project names, professional history, links, portrait, and human-review emphasis.

| Surface | Observation from screenshots/source | Design consequence |
| --- | --- | --- |
| Home | Narrow columns turn long statements into tall stacks; the artifact is visually secondary. Multiple sections repeat positioning. | Shorten the opening and put a readable project artifact in the first viewport. Reduce repeated introductions. |
| Navigation | Home is accessed through the identity; Work opens a separate index. Six equally prominent links include account access. | Make Work the first section of a connected overview. Keep account access a utility. Preserve explicit deep links. |
| Experience | The rising curve is memorable but occupies much of the screen; details appear over the chart. | Use a chronological reading layout with a subtle connecting path and persistent role summaries. |
| Writing | Large repeated headings, substantial row spacing, and small metadata lengthen a seven-article list. | Use a compact reading index with one featured piece, clear dates, and explicit external destinations. |
| Lab | Every experiment receives the same three-node diagram. Account details precede the main content with disproportionate space. | Give each tool an informative preview and a compact access summary. |
| About | Useful human context is present, but the title dominates and the portrait is visually remote. | Lead with a shorter introduction; bring the existing portrait and facts into one coherent block. |
| Access | The signed-in screenshot still leads with sign-in instructions; controls are scattered. | Change the title and action hierarchy with the actual access state. |
| Shared rhythm | Repeated large contact bands and footer messaging add length and compete with page content. | Use one substantial contact close on the overview, compact contact elsewhere. |

These are visual and source-level findings. Screenshots cannot establish actual keyboard behavior, contrast compliance, runtime performance, or how motion feels. Those require implementation-stage validation.

## Proposed visual direction: a daylight engineering studio

Minimalist and light, with near-white surfaces, green-black text, restrained forest-green actions, and pale sage evidence areas. Humanist sans-serif typography carries both approachable narrative and precise technical content. Organic means connected reading, responsive movement, and gentle curves where relationships exist; it does not mean decorative blobs or ambient animation.

Use the existing Onest family initially, reducing headline weight and scale. The identity comes from the work: annotated requirements, understandable timelines, source-to-document flows, and meaningful graph previews.

| Token | Proposed value / rule |
| --- | --- |
| Canvas | `#FAFBF8` |
| Main text | `#202923` |
| Secondary text | `#536057` |
| Primary action / links | `#285B46` |
| Artifact background | `#EDF2EA` |
| Decorative divider | `#D7DFD5`; not the sole boundary of a required control |
| Control boundary | `#718176`; verify adjacent contrast during build |
| Error | `#9D3035`, with text and icon |
| Caution / waiting | `#775414`, with explicit status text |
| Display | Desktop 48–64px, mobile 34–40px; 1.08–1.16 line-height |
| Section title | 30–40px desktop; 26–30px mobile |
| Body | 17–18px desktop, 16–18px mobile; 1.55–1.7 line-height |
| Metadata | 13–14px, never tiny pale labels |
| Content width | 1120–1200px; reading copy 60–70 characters |
| Gutters | 48–64px large screens, 24–32px tablet, 20px mobile |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64, 96px |
| Shape | 8–12px control/preview radii; round only meaningful nodes and compact states |

Use whitespace to group content, not to impose a full screen per section. Avoid shadows except where a real overlay requires separation. Links remain recognizable through labels and underlines on interaction; primary actions are filled, supporting actions are text or outlines.

## Information architecture and the single-page experience

Recommendation: retain the Astro foundation and create a continuous public overview, with dedicated detail pages inside the same visual shell. The repository already imports `ClientRouter` in `site-v2/src/layouts/BaseLayout.astro`; replacing it with a new React SPA is unnecessary for this experience.

Overview sequence: **Introduction / selected work → Experience summary → Writing preview → Lab preview → About → Contact**. Each preview is useful independently and offers a clear route to deeper content. Do not concatenate the complete six existing pages.

| Destination | Proposed behavior |
| --- | --- |
| `/` | Connected overview, containing all six public narrative sections |
| `/#work`, `/#experience`, `/#writing`, `/#lab`, `/#about`, `/#contact` | Stable, shareable overview anchors |
| `/work` | Preserve the existing project index URL; use the Home/Work visual language with a compact index header and all projects |
| `/work/[slug]` | Full case study with context, contribution, mechanism, limitations, source/demo links |
| `/experience` | Full career history, résumé, accessible role details |
| `/writing` | Full article index; retain external LinkedIn destinations |
| `/lab` | Public experiment catalog and contextual account status |
| `/about` | Full biography and principles |
| `/login` | Dedicated, state-aware Lab access flow |
| Existing `/lab/*`, `/auth/callback`, `/settings` | Preserve functional routes and authorization boundaries |

From the overview, primary navigation scrolls to anchors. From detail pages, those same labels link to the corresponding overview anchor; breadcrumbs and explicit “Full experience” / “All writing” links distinguish detail destinations. Logo returns to the overview top. Keep `/work` accessible through “All projects.” Do not silently discard existing route content or legacy hash redirects.

This structure keeps direct links, browser history, and standalone reading useful. Astro documents client-side routing, fallback handling, and reduced-motion support here: https://docs.astro.build/en/guides/view-transitions/ . Verify lifecycle behavior against the installed version during implementation.

## Navigation and motion specification

- Sticky compact header: roughly 72px desktop and 64px mobile, with an opaque light background. Active section uses a small green indicator and text weight, not color alone.
- Native wheel, trackpad, touch, Page Up/Down, and space scrolling. The current `organic-scroll.ts` computes destinations and advances between them; reconsider that behavior because forced stops can conflict with organic browsing.
- Explicit anchor clicks smoothly travel to the target with header clearance; target remains visible. Long-distance travel should be bounded, approximately 300–500ms, and interruptible by user input.
- Ordinary scrolling never adds history entries. Explicit navigation uses meaningful URLs; Back restores the prior route or anchor and scroll position. Passive section observation only updates the active indicator.
- Route changes use a restrained 160–220ms fade and at most 8px translation. Keep header geometry stable. Shared project preview transitions may extend to 240–320ms if they remain understandable and interruptible.
- New-route navigation announces the destination and places focus appropriately at the main heading. Returning to a list restores its position and originating link where feasible. Anchor activation exposes the target to keyboard and assistive technology.
- No hidden-by-default content, staggered article reveals, scroll snapping, cursor effects, or motion required to understand evidence.
- Reduced motion: instantaneous navigation and disclosure; remove translation and smooth scrolling. Native links remain useful without animation support.
- Mobile menu: visible Menu button, named navigation, expanded state, Escape closes, focus returns to the opener. If implemented as a modal, contain focus and make background inert; otherwise use a simple in-flow disclosure.
- Keep authenticated tools isolated from public navigation transitions until session initialization, cleanup, and form state preservation are verified. Existing full-navigation boundaries may remain where needed.

## Individual page designs

### 01 — Home / Work

Job: establish role and show concrete evidence quickly. Proposed headline: “Quality systems, built for real delivery.” Keep SDET visible without requiring a scroll. Support with one plain sentence about connecting requirements, automation, and engineering judgment.

First viewport: identity/navigation, restrained introduction, one primary “Explore selected work” action, secondary experience link, and a legible User Story Quality Analyzer artifact. The artifact shows Requirement → Risk → Test → Evidence using the password-reset example, explicitly labeled illustrative. Prefer a broad artifact beneath or alongside the intro, never a tiny dashboard beside a wall of text.

Following sections: selected analyzer project, two supporting project links, compact career summary, two article previews, Lab preview, short About, and one contact close. Full project index displays all four existing projects; do not disguise external extension source as a live web demo.

Mobile: intro, action, vertically readable artifact, then project list. No horizontal diagram scrolling for essential information. Section headings are normally two lines or fewer; preserve natural wrapping at text zoom.

States: selected artifact stage with equivalent keyboard controls; ordinary project links remain available if the enhanced example is unavailable. Public overview content should be statically readable.

### 02 — Experience

Job: let leaders assess relevance and recruiters inspect chronology. Headline proposal: “A career built on making systems clearer.” Résumé link near the introduction.

Use reverse chronology: SDET (Apr 2024–Present), QA Automation Lead (Jan 2023–Apr 2024), QA Engineer (Feb 2020–Jan 2023), Technical Support Assistant (Jun 2019–Feb 2020), Support & Operations (2008–2019). A thin curved path is a secondary continuity cue, not a quantitative growth chart.

Current role starts expanded; all other roles expose title, company, dates, and a useful summary before interaction. Expand role details inline using named controls, not hover popovers. Pull company and responsibility copy from the existing collection. Preserve all history in accessible markup.

Do not amplify numbers merely because repository frontmatter calls them verified: the current SDET file contains a 40% outcome but its underlying evidence was not examined in this planning pass. Keep quantified proof out of mockups pending substantiation.

Mobile: one vertical column, date above role, disclosure below summary. No x-axis, overlapping labels, or pan gesture.

### 03 — Writing

Job: communicate engineering judgment through a scannable selection. Headline: “Notes on quality, AI, and engineering judgment.”

One featured article, then a chronological index of the seven existing pieces. Rows contain date, title, short excerpt, source, and descriptive Read on LinkedIn action. Use the real article title even when long. The featured article is editorially selected, not falsely labeled the latest.

Proposed optional category filters: All, Quality engineering, AI & delivery, Leadership. These are new UI behavior; derive a documented mapping from existing topics and preserve an unfiltered static list. With seven articles, filters may be omitted if they add little value. Avoid pagination and search until volume warrants them.

Mobile: dates above titles, comfortably wrapping filter controls, full-width rows. If filters are built, announce result count, show an empty state with Clear filters, and preserve the selected filter in the URL. External navigation remains explicit.

### 04 — Lab

Job: explain what each experiment does before asking for account work. Heading: “Small experiments. Inspectable decisions.” Public catalog remains browseable while signed out.

Four distinct previews: analyzer with requirement annotations; context graph with named relationships; classifier with a failure-category table; document generator with source files and document outline. Each preview must be labeled illustrative until replaced with verified captures of actual tool behavior. Avoid fake model confidence or invented execution output.

Use two columns on desktop and one on mobile. Each project shows purpose, shipped/prototype status, Read context, and its actual destination. Maintain the distinction between proposed capabilities and the deterministic protected analyzer described in current project content.

Compact account summary links to access details; anonymous visitors see “Sign in to request access.” Do not claim signed-out tool execution is available. Signed-in state shows exact server-provided permissions and allowances. Admin settings appear only to admins.

### 05 — About

Job: make professional context human and credible. Heading: “Curiosity, made useful.” Lead with Douglas’s name, SDET role, and Porto Alegre location.

Keep two or three short paragraphs explaining support roots, current work, and adoption by teams. Reuse the existing portrait; the design mockup uses a labeled placeholder to avoid inventing Douglas’s likeness. Align the portrait with introductory copy rather than marooning it in a side rail.

Four concise principle rows: Ship trust, not test volume; Use AI inside guardrails; Make failures useful; Design for the next engineer. Follow with LinkedIn, GitHub, Résumé, Email Douglas, and Book a conversation using existing destinations. No fictional availability claim or personal hobbies.

Mobile: introduction, portrait/facts, principles, professional links, contact. Preserve readable body measure on large monitors.

### 06 — Lab access

Job: explain the next access step and return the visitor to the intended tool. Use a centered, modest-width form surface with Back to Lab above it.

Signed out: “Explore the Lab,” short Google/approval explanation, Continue with Google primary action, Browse experiments secondary link. Signed in and approved: “You’re ready to explore,” correct allowance details, Open the Lab or Continue to requested experiment as primary action, Refresh access and Sign out secondary.

**Allowance semantics are binding:** `lifetime_remaining / lifetime_limit` is the account’s remaining execution allowance; `daily_remaining / daily_limit` is the shared site-wide allowance today. Do not relabel account quota as a daily allowance. The original screenshot’s 4/10 is account allowance, while 10/10 is shared daily capacity. Reset time applies to the shared daily capacity. All shown values are examples, never static product values.

The existing settings surface is admin-only. Use “Site settings” only when `is_admin` is true; do not add a general “Account settings” destination without a separately designed and authorized feature.

| State | Visible response and action |
| --- | --- |
| Checking session | Stable reserved panel; Checking Lab access status; prevent duplicate sign-in |
| Signed out | Continue with Google; public catalog link |
| Opening Google | Busy label and disabled duplicate action |
| Callback | Completing sign-in; valid return destination preserved |
| Pending | Request pending; Refresh access; Browse experiments; Sign out |
| Approved | Exact allowances; destination action; secondary account controls |
| Declined / revoked | Specific state, contact link, Sign out; no executable tool action |
| Account allowance exhausted | Explain account allowance is used; contact link; no claim that midnight restores it |
| Shared daily allowance exhausted | Explain shared limit and exact localized reset; public context remains available |
| Processing paused | Explicit pause message; distinguish browsing from live runs |
| Offline / status error | Could not verify access, Retry; never assume authorization |
| OAuth canceled / expired callback | Plain explanation and sign-in retry; preserve safe return path where valid |

## Responsive and accessibility acceptance criteria

Design for 1440px and 390px reference widths; verify 320, 768, 1024, 1440, and 1920px during implementation. Use content-driven breakpoints rather than preserving desktop columns on narrow screens. No body overflow at 320px or when text is enlarged. Allow normal page height at 200% zoom.

Target WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and required UI boundaries. Use visible focus with sufficient contrast and generous 44px design targets for touch controls. Status uses text as well as color. Headings, list order, disclosure state, and selected filters must be semantic. Decorative graph paths are hidden from assistive technology; meaningful graph relationships have a textual equivalent.

Images reserve dimensions. Public content does not wait for account fetching. Lazy-load tool code after navigation, not all tools into the overview. A provisional performance target is good Core Web Vitals; establish an actual baseline before promising improvements.

## Implementation plan after design review

1. Review all six visual boards and this specification together. Resolve heading copy, main-page density, and whether Writing filters earn their place. Correct any generated visual discrepancy against factual source content.
2. Capture current desktop/mobile behavior and preserve an inventory of routes, links, content, authentication states, and legacy redirects. Leave unrelated local changes intact.
3. Adopt the approved light token system in the shared layouts, header, footer, and public primitives. Update the durable design documentation at that stage, not while this proposal is still under review.
4. Build the connected overview and all standalone public views from existing content collections. Replace generic Lab thumbnails with meaningful assets.
5. Add restrained route transitions, section navigation, focus behavior, and history restoration. Remove or revise forced scroll destinations according to the approved motion specification.
6. Restyle access states and existing tools without changing authorization or quota semantics. Keep session and callback handling independently testable.
7. Validate responsive layouts, keyboard flows, reduced motion, long titles, zoom, direct URL refresh, Back/Forward, external destinations, account states, and tool return paths. Run Astro checks/build and relevant existing Playwright tests.
8. Perform visual review against the approved boards, correct material differences, and prepare a reviewable change. Deployment remains a separate step.

## Deliverables and scope boundary

Six individual generated design boards, each with desktop and mobile treatment; a persisted prompt set; and this analysis/specification. Boards are visual proposals, not functional prototypes or pixel-accurate implementation contracts. Exact factual copy, quota rules, and access boundaries in this document supersede incidental generated text.

The separately discovered project index, case-study detail pages, tool interiors, admin settings, callback, and 404 require the approved shared language during implementation. They are not represented as additional fully designed screens in this six-screenshot commission; tool interiors and admin workflows should receive their own design review before substantive layout changes.
