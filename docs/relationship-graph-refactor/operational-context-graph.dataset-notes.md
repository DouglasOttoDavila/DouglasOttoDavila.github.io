# Operational Context Graph Dataset Notes

This package contains a fully fictional dataset for a portfolio concept.

## Recommended usage

Use `operational-context-graph.dataset.json` as the direct graph input because JSON is the most practical format for graph rendering libraries that consume a simple `nodes` + `links` structure. React Force Graph uses a `graphData` object with `nodes` and `links`, while Cytoscape.js accepts JSON-based element definitions. citeturn585024search1turn585024search2

Use markdown files for implementation guidance because BMAD Method relies on structured project context and workflow documents; its docs describe `project-context.md` as the implementation guide for AI agents and emphasize clear, structured context across phases. citeturn585024search8turn585024search14

## Included files

- `operational-context-graph.dataset.json`
  - Directly ingestible graph-ready data in `nodes` + `links` format.
- `operational-context-graph.schema.json`
  - JSON schema for validation and stable future adapters.
- `operational-context-graph.project-context.md`
  - Human-readable implementation guide for the agent.
- `bmad-quick-dev-operational-graph-prompt.md`
  - Prompt to run with `/bmad-quick-dev`.

## Fictional content warning

All entities in the dataset are fictional and intended only for conceptual demonstration inside a public portfolio.