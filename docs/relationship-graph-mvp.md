# Operational Context Graph

This graph now loads the fictional operational dataset directly from `docs/relationship-graph-refactor/operational-context-graph.dataset.json`.

Future dataset injection point:

- Keep data loading in `js/relationship-graph/data-loader.js`.
- Keep transformation and synthetic node-class handling in `js/relationship-graph/adapter.js`.
- Keep rendering and interaction behavior in `js/relationship-graph/index.js`.

Expected future raw data shape:

- A `meta` object plus `nodes[]` and `links[]` in the same nodes-links structure.
- `nodes[]` should continue to include stable `id`, `label`, `type`, and `group` fields, with optional operational metadata such as severity, automation status, priority, release train, methods, or summaries.
- `links[]` should continue to include stable `source`, `target`, and `type` fields, with optional weights or labels.

Module responsibilities:

- `graph-types.d.ts`: operational graph interfaces for raw data, transformed graph data, filters, and selected-node state.
- `config.js`: type/relationship display metadata, visual accents, and symbol choices.
- `data-loader.js`: loads the provided JSON dataset.
- `adapter.js`: validates/transforms raw operational context into the graph runtime shape and synthesizes explicit node-class references for AI edges that target node classes.
- `details.js`: renders selected-node state and groups connected neighbors by relationship type.
- `index.js`: D3 graph rendering, selection/highlight behavior, search/filter controls, labels toggle, and viewport actions.
- `chat-panel.js`, `context-provider.js`, `assistant-service.js`, and `action-interpreter.js`: graph-aware assistant UI, graph context collection, server communication, and safe action execution.

Assistant-specific developer notes live in `docs/relationship-graph-assistant.md`.
