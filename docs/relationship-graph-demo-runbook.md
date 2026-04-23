# Operational Context Graph Demo Runbook

Purpose: scripted demo plan for the protected Operational Context Graph page.

This file is designed for two uses:

- Codex can later consume it and drive the browser through Playwright MCP.
- The `Voiceover` lines can be used as narration for a recorded demo video.

## Preconditions

- Site URL: `https://douglasottodavila.github.io/#relationship-graph`
- Local URL option: `http://127.0.0.1:4173/#relationship-graph`
- The page is protected. If redirected to `#login`, pause and wait for Douglas to log in manually.
- The graph dataset must load successfully. Expected summary values are non-zero.
- If the assistant is used, the Supabase Edge Function `operational-graph-assistant` must be deployed and `GEMINI_API_KEY` must be configured server-side.

## Playwright Operator Rules

- Execute steps in order.
- Prefer semantic locators when available. Fallback selectors are provided where useful.
- After each interaction, wait briefly for animations, graph layout, and assistant responses.
- Do not paste secrets or inspect `.env`.
- If login is required, stop and ask Douglas to complete login manually, then continue from the same browser session.
- When selecting graph nodes visually, use search-result pills or chat reference chips whenever possible instead of relying on canvas coordinates.

## Demo Script

### 1. Open The Protected Graph

Action:

- Navigate to `https://douglasottodavila.github.io/#relationship-graph`.
- If redirected to login, wait for Douglas to authenticate.
- After login, navigate again to `https://douglasottodavila.github.io/#relationship-graph`.

Expected result:

- Page title contains `Operational Context Graph`.
- Hero copy is visible.
- Summary cards show non-zero values for dataset nodes, relationships, entity classes, and AI capabilities.
- The graph canvas renders nodes and links.

Suggested Playwright:

```text
goto https://douglasottodavila.github.io/#relationship-graph
if page url contains #login:
  ask user to log in manually
  wait for user confirmation
  goto https://douglasottodavila.github.io/#relationship-graph
wait for selector #relationship-graph-canvas svg
assert text under [data-summary-nodes] is not "0"
```

Voiceover:

> This is a protected portfolio concept showing an operational context graph. Instead of visualizing people or companies, it maps fictional engineering knowledge: products, features, requirements, APIs, services, tests, defects, deployments, regions, languages, and AI capabilities.

### 2. Establish The Interaction Model

Action:

- Hover over two or three visible nodes in the canvas.
- If possible, hover a visible node such as `Device Sync`, `Access Control`, or `Login Screen`.
- Observe the tooltip placement and node feedback.
- Click `Fit view`.

Expected result:

- Tooltip appears near the hovered node.
- Node label and halo respond to hover.
- `Fit view` recenters the graph.

Selectors:

- Canvas: `#relationship-graph-canvas`
- Fit button: `#relationship-graph-fit`

Voiceover:

> The canvas supports the core graph interactions expected from a relationship exploration tool: pan, zoom, hover, drag, focus, and fit-to-view. The goal is to make dense operational context feel navigable rather than static.

### 3. Search For Access Control

Action:

- Fill `#relationship-graph-search` with `Access Control`.
- Click the `Access Control` search result pill.

Expected result:

- The graph focuses the `Access Control` node.
- The details panel title becomes `Access Control`.
- Metrics show non-zero direct links and relationship groups.
- Connected context shows requirements and related entities.

Suggested Playwright:

```text
fill #relationship-graph-search "Access Control"
click button containing "Access Control"
wait for text "Access Control" in #relationship-graph-panel
assert #relationship-graph-panel contains "direct links"
assert #relationship-graph-panel contains "relationship groups"
```

Voiceover:

> Search gives a deterministic way to jump into a domain concept. Here, Access Control becomes the anchor, and the details panel explains its direct relationships, grouped by relationship type.

### 4. Inspect Access Control Connections

Action:

- Read the selected-node details panel.
- Confirm these expected relationships are visible if present:
  - `REQ-ACCESS-01`
  - `REQ-ACCESS-02`
  - `Access API`
  - `Permissions Cache Delay`

Expected result:

- The panel shows connected context grouped by relationship.
- Direct link count is non-zero.
- Relationship group count is non-zero.

Voiceover:

> The side panel turns the graph into an explorable knowledge model. For a selected feature, we can immediately see requirements, APIs, defects, and other adjacent context without opening separate documents.

### 5. Demonstrate Type Filtering

Action:

- Open the node-type filter.
- Select `Defect`.
- Observe the graph fading non-defect nodes while keeping relevant highlighted or selected context readable.
- Reset the filter by selecting `All nodes`.

Selectors:

- Filter: `#relationship-graph-filter`

Expected result:

- Defect nodes become easier to identify.
- Search result area updates to show matching nodes.
- Resetting to `All nodes` restores the full view.

Voiceover:

> Type filters help preserve usability as the graph becomes denser. A user can isolate defects, services, test cases, or AI capabilities without changing the underlying dataset.

### 6. Ask The Assistant About Access Control Defects

Action:

- In the assistant input, enter:

```text
Which defects are related to access control?
```

- Submit the assistant form.
- Wait for the assistant answer.

Expected result:

- Assistant response mentions `Permissions Cache Delay` or `defect-access-cache`.
- The graph highlights the relevant access-control cluster.
- The assistant response includes clickable reference chips, such as `Permissions Cache Delay` and `Access Control`.
- The graph may focus or highlight related nodes automatically.

Selectors:

- Assistant input: `#relationship-graph-chat-input`
- Assistant submit: `#relationship-graph-chat-submit`
- Assistant messages: `#relationship-graph-chat-messages`

Suggested Playwright:

```text
fill #relationship-graph-chat-input "Which defects are related to access control?"
click #relationship-graph-chat-submit
wait until #relationship-graph-chat-messages contains "Permissions Cache"
```

Voiceover:

> The assistant is graph-aware. It does not just answer from generic text; it receives structured graph context and returns both a human-readable answer and safe graph actions like focus, highlight, filter, and fit-to-view.

### 7. Show That Assistant Actions Drive The UI Safely

Action:

- Click the assistant reference chip for `Permissions Cache Delay`.
- Observe the graph focus and the selected-node panel update.
- If available, click the reference chip for `Access Control`.

Expected result:

- The selected-node details panel updates to the clicked referenced node.
- Previously assistant-highlighted nodes remain as retained context, but the currently selected node is visually strongest.

Voiceover:

> Assistant output is not allowed to manipulate the graph directly. It returns structured action instructions, and the frontend validates node IDs and action types before applying them.

### 8. Compare Manual Selection With Assistant Highlighting

Action:

- Search for `Login Screen`.
- Click the `Login Screen` search result pill.
- Observe that `Login Screen` becomes the selected node.
- Observe that the assistant-highlighted access-control cluster remains visible as retained context.

Expected result:

- Details panel title becomes `Login Screen`.
- Assistant-highlighted nodes are still softly marked.
- `Login Screen` has the strongest selected-node visual state.

Voiceover:

> Manual exploration and AI-assisted exploration can coexist. The assistant can preserve useful context, while the user can still select a different node and continue navigating independently.

### 9. Demonstrate Labels And View Controls

Action:

- Click `Labels Off` to turn labels on.
- Click `Fit view`.
- Click `Clear selection`.

Expected result:

- Button text changes to `Labels On`.
- More graph labels become visible.
- Fit view recenters the graph.
- Clear selection resets the detail panel, while retained assistant highlights remain.

Voiceover:

> View controls make the graph presentation adjustable for different demo moments: labels can be shown for explanation, the viewport can be reset, and selection can be cleared without losing assistant context.

### 10. Ask About A Deployment

Action:

- In the assistant input, enter:

```text
Tell me about Deployment 2026.02.03
```

- Submit and wait for the response.

Expected result:

- Assistant references `Deployment 2026.02.03`.
- The graph focuses or highlights the deployment neighborhood.
- The answer summarizes directly related defects, RCA nodes, requirements, tests, or nearby context when present.

Voiceover:

> The same interaction model works for release and incident questions. A deployment can be explored through related defects, RCA findings, failing tests, and requirements, which is the kind of connected context AI-assisted triage needs.

### 11. Explore AI Capability Nodes

Action:

- Search for `AI Failure Triage Assistant`.
- Select the result.
- Inspect the connected context panel.

Expected result:

- Details panel title becomes `AI Failure Triage Assistant`.
- Connected context includes node classes or concrete nodes such as defects, RCA, deployments, or access-control context.

Voiceover:

> AI capabilities are first-class nodes in the graph. This makes it possible to show what kinds of context an assistant would use for requirements review, test recommendation, test generation, or failure triage.

### 12. Show Path-Oriented Reasoning

Action:

- Ask the assistant:

```text
Show the relationship path from Access Control to Permissions Cache Delay.
```

- Wait for answer and graph update.

Expected result:

- Assistant highlights a concise path or related neighborhood.
- Answer explains the relationship using only graph data.

Voiceover:

> Relationship graphs are valuable because they expose paths, not just isolated records. A defect can be traced back through requirements, APIs, services, tests, RCA, and deployments.

### 13. Reset The Demo View

Action:

- Click `Reset all`.
- Click `Fit view`.
- Optionally refresh the page if a fully neutral state is required.

Expected result:

- Search field clears.
- Manual filter resets.
- Selection clears.
- Graph recenters.
- If assistant highlights are intentionally sticky, they remain until refresh.

Voiceover:

> The graph can be reset for another exploration path. In this implementation, assistant-applied highlights can remain as retained context until refresh, so the demo can show continuity between AI guidance and manual investigation.

## Recommended Recording Flow

Use this shortened flow for a polished 3- to 5-minute video:

1. Open protected page and confirm graph loads.
2. Search `Access Control`.
3. Inspect panel metrics and connected context.
4. Ask `Which defects are related to access control?`
5. Click `Permissions Cache Delay` from assistant references.
6. Search and select `Login Screen` to show manual selection alongside retained AI context.
7. Ask `Tell me about Deployment 2026.02.03`.
8. Search `AI Failure Triage Assistant`.
9. Close by explaining future extensibility.

## Closing Voiceover

> This is still fictional data, but the architecture is intentionally realistic. The graph consumes a stable nodes-and-links contract, the assistant receives structured graph context, and graph actions are validated before changing the UI. That means future real operational data can be transformed into the same model without redesigning the visualization layer.

## Troubleshooting Notes

- If summary cards show `0`, check that `docs/relationship-graph-refactor/operational-context-graph.dataset.json` is deployed with the site artifact.
- If the assistant fails, check the Supabase Edge Function deployment and `GEMINI_API_KEY` secret.
- If protected access redirects to login after authentication, confirm the signed-in profile has protected-content privileges.
- If search cannot find a node, clear the node-type filter and try again.
