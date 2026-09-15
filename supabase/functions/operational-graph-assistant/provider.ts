import { getAssistantResponseSchema, parseGeminiJsonResponse } from './response.ts';

export function providerConfig(get: (name: string) => string | undefined = Deno.env.get) {
  const provider = (get('GRAPH_ASSISTANT_PROVIDER') || 'nvidia').trim().toLowerCase();
  if (!['nvidia', 'gemini'].includes(provider)) throw new Error('GRAPH_ASSISTANT_PROVIDER must be nvidia or gemini.');
  const keyName = provider === 'nvidia' ? 'NVIDIA_API_KEY' : 'GEMINI_API_KEY';
  const apiKey = get(keyName)?.trim();
  if (!apiKey) throw new Error(`${keyName} is not configured for the graph assistant. No execution was consumed.`);
  return { provider, apiKey, model: get(provider === 'nvidia' ? 'NVIDIA_MODEL' : 'GEMINI_MODEL') || (provider === 'nvidia' ? 'nvidia/nemotron-3-ultra-550b-a55b' : 'gemini-2.5-flash') };
}

export async function generateGraphAnswer(config: ReturnType<typeof providerConfig>, system: string, user: string, send: typeof fetch = fetch) {
  const nvidia = config.provider === 'nvidia';
  const url = nvidia ? 'https://integrate.api.nvidia.com/v1/chat/completions' : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const body = nvidia ? {
    model: config.model,
    messages: [{ role: 'system', content: system + '\nReturn only a JSON object matching this schema: ' + JSON.stringify(getAssistantResponseSchema()).replace(/"(OBJECT|STRING|ARRAY|NUMBER)"/g, value => value.toLowerCase()) }, { role: 'user', content: user }],
    temperature: 0.2, max_tokens: 4096, stream: false,
    ...(config.model.startsWith('nvidia/nemotron-3-') || config.model.startsWith('nvidia/nemotron-3.5-') ? {chat_template_kwargs: { enable_thinking: false }} : {}),
  } : {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: getAssistantResponseSchema() },
  };
  let response: Response;
  try {
    response = await send(url, { method: 'POST', signal: AbortSignal.timeout(65000), headers: nvidia ? { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` } : { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }, body: JSON.stringify(body) });
  } catch {
    throw new Error(`${config.provider} request timed out or could not connect. This execution has been counted; start a new execution to try again.`);
  }
  if (!response.ok) throw new Error(`${config.provider} request failed (HTTP ${response.status}). ${response.status === 401 || response.status === 403 ? 'Check the provider API key and model permissions.' : response.status === 429 ? 'The provider rate or credit limit was reached.' : 'The provider could not complete the request.'} This execution has been counted.`);
  try {
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    const parsed = nvidia ? JSON.parse(typeof text === 'string' ? text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : '') : parseGeminiJsonResponse(payload);
    if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim() || !Array.isArray(parsed.actions) || !Array.isArray(parsed.referencedNodeIds)) throw new Error('Invalid structure');
    return parsed;
  } catch { throw new Error(`${config.provider} returned an invalid or incomplete answer. This execution has been counted.`); }
}
