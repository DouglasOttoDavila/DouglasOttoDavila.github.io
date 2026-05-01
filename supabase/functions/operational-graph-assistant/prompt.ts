function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function interpolateTemplate(template: string, values: Record<string, string>) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : value;
  });
}

export function buildGraphAssistantSystemPrompt(graphContext: any, template: string) {
  const nodeTypes = Array.isArray(graphContext?.schema?.nodeTypes) ? graphContext.schema.nodeTypes : [];
  const relationshipTypes = Array.isArray(graphContext?.schema?.relationshipTypes) ? graphContext.schema.relationshipTypes : [];

  return interpolateTemplate(template, {
    node_types: nodeTypes.join(', ') || 'unknown',
    relationship_types: relationshipTypes.join(', ') || 'unknown',
    current_view_json: formatJson(graphContext?.currentView || {})
  });
}

export function buildGraphAssistantUserPrompt(
  payload: { question: string; conversationHistory?: unknown; graphContext?: unknown },
  template: string
) {
  return interpolateTemplate(template, {
    question: payload.question,
    conversation_history_json: formatJson(payload.conversationHistory || []),
    graph_context_json: formatJson(payload.graphContext || {})
  });
}
