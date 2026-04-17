# Operational Graph Assistant Notes

This portfolio feature keeps the fictional operational graph and the Gemini assistant decoupled so future datasets can be swapped in without rewriting the UI.

## Runtime shape

- Frontend graph state and rendering stay in `js/relationship-graph/index.js`.
- Chat UI lives in `js/relationship-graph/chat-panel.js`.
- Graph context collection lives in `js/relationship-graph/context-provider.js`.
- Graph traversals and local path/neighborhood utilities live in `js/relationship-graph/traversal-utils.js`.
- Frontend-safe action execution lives in `js/relationship-graph/action-interpreter.js`.
- Gemini transport lives in `js/relationship-graph/assistant-service.js`.
- The server-side Gemini boundary lives in `supabase/functions/operational-graph-assistant/`.

## Gemini prompt structure

The Edge Function builds two prompt layers:

1. System prompt
   - explains the fictional operational graph domain
   - lists known node types and relationship types
   - defines the only supported graph actions
   - instructs Gemini to use only provided graph context
   - forbids invented node IDs or relationships

2. User prompt
   - includes the user question
   - includes recent chat history
   - includes the graph query context collected from the active page

## Graph context collection

`GraphContextProvider` sends:

- graph metadata
- current graph UI state
- candidate nodes matched from the user query
- expanded neighborhoods around likely anchor nodes
- the full graph-ready nodes and links dataset

This keeps the model grounded in both the whole graph and the most relevant nearby subgraph.

## Graph action format

The assistant must return:

```json
{
  "answer": "Human-readable grounded answer",
  "referencedNodeIds": ["deploy-2026-02-03"],
  "actions": [
    { "type": "focusNode", "nodeId": "deploy-2026-02-03" },
    { "type": "highlightNeighbors", "nodeId": "deploy-2026-02-03", "depth": 2 }
  ]
}
```

Supported action types:

- `selectNode`
- `focusNode`
- `highlightNode`
- `highlightNeighbors`
- `highlightNeighborhood`
- `filterNodeTypes`
- `fitSelectionIntoView`
- `highlightShortestPath`
- `resetGraphState`

The frontend never executes raw model output directly. `GraphActionInterpreter` validates action types, node IDs, node types, and path endpoints before changing the graph UI.

## Future dataset replacement

To support a future non-fictional dataset:

- Keep raw-source transformation inside `js/relationship-graph/adapter.js`.
- Preserve the graph-ready `nodes + links + meta` contract.
- Keep assistant prompts grounded in the transformed graph context, not the upstream raw source format.
- If future raw sources include richer metadata, extend the adapter and context provider first instead of coupling Gemini logic to raw data collectors.

## Secrets and deployment

- The Gemini API key must stay server-side as `GEMINI_API_KEY` in the Supabase Edge Function environment.
- The browser should keep using only the public Supabase URL and anon key already exposed through `content/auth.runtime.json`.
- Optional model override: `GEMINI_MODEL`.
