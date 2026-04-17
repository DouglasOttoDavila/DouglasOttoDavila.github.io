# Operational Context Graph — Project Context

## Intent

This feature is a **portfolio concept** that demonstrates how a graph can represent connected engineering and QA context.

It is not a social graph and not a real client graph.
It uses fully fictional data only.

## Core idea

The graph should help a viewer understand that complex delivery ecosystems are made of connected entities, for example:

- Products
- Features
- User Journeys
- Requirements
- Screens
- APIs
- Services
- Test Cases
- Test Suites
- Defects
- RCA findings
- Deployments
- Regions
- Languages
- AI capabilities

The graph should make it easy to inspect how one node connects to the rest of the system.

Examples:
- A requirement connects to a screen, an API, and validating test cases.
- A defect connects to a requirement, a failing test, an RCA, and a deployment.
- An AI capability connects to the node classes or concrete nodes it would use as context.

## UX direction

The experience should feel:
- modern
- dynamic
- clean
- interactive
- visually premium
- understandable without domain explanation

The graph should not feel like an academic diagram or a rough dev tool.

## Recommended view model

### Main canvas
Interactive graph with pan, zoom, drag, hover, select.

### Side panel
Selected node details:
- title
- type
- optional summary/description
- connected nodes grouped by relationship type

### Top controls
- search
- type filter
- reset/focus actions
- optional labels toggle

### Legend
A compact, visually polished legend explaining node categories.

## Data model expectations

The graph is provided in a generic nodes-links JSON shape so it can work well with common graph libraries.

### Dataset shape
- `nodes`: array of node objects
- `links`: array of link objects
- `meta`: descriptive metadata

### Node minimum fields
- `id`
- `label`
- `type`
- `group`

### Link minimum fields
- `source`
- `target`
- `type`

## Implementation expectations

- Use the provided JSON directly for the MVP.
- Keep a transformation layer so future raw domain data can map into the same graph format.
- Avoid hard-coding around the current sample dataset.
- Keep rendering decisions theme-aware.
- Ensure type safety and modularity.

## Content safety / portfolio constraints

- Never introduce real company or client names into the seeded concept.
- Keep all seeded content fictional and generic.
- Keep the explanation high-level and portfolio-appropriate.
- The visual should imply connected operational intelligence, not reveal confidential workflows.

## Nice-to-have interactions

- highlight first-degree neighbors on selection
- dim unrelated nodes
- path emphasis between related entities
- fit selected node cluster into view
- node labels on hover or selection
- subtle motion/force feel without sacrificing readability

## Future extensibility

In later phases, the same graph contract may accept transformed real data from other sources.

Therefore:
- separate `raw source data` from `graph-ready data`
- keep adapters isolated
- preserve a stable graph dataset contract

## Suggested technical approach

A modern React + TypeScript implementation with a graph library that supports:
- dynamic layout
- pan/zoom
- dragging
- hover/click interactions
- theme-safe rendering
- decent performance for medium-size graphs

The exact library choice is up to the implementing agent, but the result must favor clarity and portfolio polish over novelty.