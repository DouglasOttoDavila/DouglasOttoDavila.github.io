const SUPPORTED_ACTION_TYPES = new Set([
  'selectNode',
  'focusNode',
  'highlightNode',
  'highlightNeighbors',
  'highlightNeighborhood',
  'filterNodeTypes',
  'fitSelectionIntoView',
  'highlightShortestPath',
  'resetGraphState'
]);

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function clampDepth(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(3, Math.round(numeric)));
}

export function getAssistantResponseSchema() {
  return {
    type: 'OBJECT',
    required: ['answer', 'referencedNodeIds', 'actions'],
    properties: {
      answer: { type: 'STRING' },
      referencedNodeIds: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      },
      actions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING' },
            nodeId: { type: 'STRING' },
            nodeIds: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            nodeTypes: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            fromNodeId: { type: 'STRING' },
            toNodeId: { type: 'STRING' },
            depth: { type: 'NUMBER' }
          }
        }
      }
    }
  };
}

export function parseGeminiJsonResponse(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((part) => typeof part?.text === 'string' ? part.text : '')
        .join('')
        .trim()
    : '';

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return JSON.parse(text);
}

export function normalizeAssistantResponse(raw: any, graphContext: any) {
  const nodeIds = new Set<string>(
    Array.isArray(graphContext?.nodes)
      ? graphContext.nodes
          .map((node: any) => node?.id)
          .filter((nodeId: unknown): nodeId is string => typeof nodeId === 'string')
      : []
  );
  const nodeTypes = new Set<string>(
    Array.isArray(graphContext?.schema?.nodeTypes)
      ? graphContext.schema.nodeTypes.filter((nodeType: unknown): nodeType is string => typeof nodeType === 'string')
      : []
  );

  const referencedNodeIds = asStringArray(raw?.referencedNodeIds).filter((nodeId) => nodeIds.has(nodeId));
  const actions = Array.isArray(raw?.actions)
    ? raw.actions
        .map((action: unknown) => normalizeAction(action, nodeIds, nodeTypes))
        .filter(Boolean)
    : [];

  return {
    answer: typeof raw?.answer === 'string' && raw.answer.trim()
      ? raw.answer.trim()
      : 'I could not derive a grounded answer from the current graph context.',
    referencedNodeIds,
    actions
  };
}

function normalizeAction(action: unknown, nodeIds: Set<string>, nodeTypes: Set<string>) {
  if (!action || typeof action !== 'object') {
    return null;
  }

  const candidate = action as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !SUPPORTED_ACTION_TYPES.has(candidate.type)) {
    return null;
  }

  switch (candidate.type) {
    case 'resetGraphState':
      return { type: 'resetGraphState' };

    case 'selectNode':
    case 'focusNode':
    case 'highlightNode':
      return typeof candidate.nodeId === 'string' && nodeIds.has(candidate.nodeId)
        ? { type: candidate.type, nodeId: candidate.nodeId }
        : null;

    case 'highlightNeighbors':
    case 'highlightNeighborhood':
      return typeof candidate.nodeId === 'string' && nodeIds.has(candidate.nodeId)
        ? { type: candidate.type, nodeId: candidate.nodeId, depth: clampDepth(candidate.depth) }
        : null;

    case 'filterNodeTypes': {
      const validNodeTypes = asStringArray(candidate.nodeTypes).filter((nodeType) => nodeTypes.has(nodeType));
      return validNodeTypes.length > 0
        ? { type: 'filterNodeTypes', nodeTypes: validNodeTypes }
        : null;
    }

    case 'fitSelectionIntoView': {
      const validNodeIds = asStringArray(candidate.nodeIds).filter((nodeId) => nodeIds.has(nodeId));
      return validNodeIds.length > 0
        ? { type: 'fitSelectionIntoView', nodeIds: validNodeIds }
        : { type: 'fitSelectionIntoView' };
    }

    case 'highlightShortestPath':
      return typeof candidate.fromNodeId === 'string'
        && typeof candidate.toNodeId === 'string'
        && nodeIds.has(candidate.fromNodeId)
        && nodeIds.has(candidate.toNodeId)
        ? { type: 'highlightShortestPath', fromNodeId: candidate.fromNodeId, toNodeId: candidate.toNodeId }
        : null;

    default:
      return null;
  }
}
