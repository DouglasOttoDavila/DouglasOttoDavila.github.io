---
name: Douglas D'Avila — daylight engineering studio
colors:
  canvas: "#FAFBF8"
  text: "#202923"
  secondary: "#536057"
  action: "#285B46"
  artifact: "#EDF2EA"
  divider: "#D7DFD5"
  control: "#718176"
---
## Overview
Approved design: docs/redesign-2026-09-13. Near-white and forest green replace the dark Signal Trace identity. The full specification governs incidental mockup inconsistencies.

## Terminal alternate version — September 2026

The top-menu Studio / Terminal control selects two complete presentations of the same content. Terminal is the default when no valid saved preference exists. Explicit Studio or Terminal selections persist in browser localStorage. The user approved the alternate editor/CLI direction and its 18 reference images in `docs/terminal-design-2026-09-15`; that specification governs Terminal and overrides the daylight rules below only while Terminal is selected.

- Terminal tokens: canvas `#090E14`, surfaces `#101923`, text `#E6EDF5`, secondary `#A8BDD0`, dividers `#293F50`, control borders `#607B90`, cyan action `#65D9FF`. Cyan filled controls use near-black text. Flat surfaces, fine borders, 6px controls, restrained cyan emphasis.
- Onest headings and prose; Recursive with MONO=1 for editor navigation, prompts and technical controls. Body 17px, technical labels 13px or larger except compact chrome. Do not reproduce the mockups' invented text or data.
- Desktop has a 230px explorer, document tab/breadcrumb, main reading area and narrow status bar. Tool routes use a 68px rail; at 1100px the reading explorer also becomes a rail. At 800px navigation moves into the in-flow menu, the rail disappears and content stacks; the version switch stays visible. Status bar moves into flow on mobile.
- Home pairs role and delivery flow, then selected project rows. Work uses compact illustrative rows. Case studies retain their real Markdown with section outlines. Experience keeps chronological disclosures; About uses the original portrait. Lab controls, auth, quotas and model settings retain existing behavior.
- Switching versions changes a root data attribute, not route or React island identity. Persist the explicit preference in local storage before paint; retain a current-visit fallback when storage is unavailable. Drafts, graph camera, selection, conversation and unsaved fields survive switches.
- Motion: decorative > prompt blinks at 1100ms and pauses offscreen/in a hidden document; delivery connectors reveal once at 450ms; controls transition at 150–180ms. Reduced motion makes these static. No terminal typing is required and no copy waits for animation.

## Colors
Flat near-white, forest-green actions, sage artifacts, green-black text. Status includes text. No gradients or glow.
## Typography
Onest, display 36–64px at weight 600; body 17px, line-height 1.65, max 70 characters. Metadata at least 13px. Monospace only for technical data.
## Layout
1200px container, 20px mobile gutters. Continuous overview and dedicated detail URLs. Pipeline stacks on mobile. Native scrolling; only explicit navigation animates.
## Elevation & Depth
Flat tonal separation and fine borders.
## Shapes
8px controls, 12px previews. Circles represent timeline and graph nodes.
## Components
Compact header, in-flow mobile menu, green primary actions. Distinct illustrative Lab previews. State-aware access retains lifetime account and shared daily quotas. Admin settings remain admin-only.
## Do's and Don'ts
Use actual content and portrait. Label illustrative evidence. Respect reduced motion, keyboard, history and native gestures. Never invent metrics or force scroll stops.

## Context graph workspace
The operational graph uses a bounded canvas with a 380px desktop inspector. Details, Assistant, and Entities share one panel; selection never scrolls the page. Tablet uses a side panel and mobile uses a half-height sheet with explicit expand/reduce and close controls. Expanded workspace locks background scrolling and makes background controls inert; Escape closes the inspector first, then exits the workspace. The mobile composer adapts to the visual viewport and reduces toolbar content while typing.

Zoom, selection, drafts, and conversation survive panel changes. Submitted questions retain their original context, citations highlight graph entities without replacing the assistant view, and suggested actions require an explicit click. Account status remains available in a disclosure above the graph. Public portfolio identity and standalone entity URLs remain unchanged.

Model selection: approved users save a per-account default under Site settings. The graph composer has a per-visit override, with clear scope copy and a reset-to-saved option. Only the server's verified free chat catalog is selectable; failed catalog loads disable submissions and expose retry. Pending retries retain their model. Provider credentials never enter the browser.
