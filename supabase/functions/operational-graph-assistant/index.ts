import { corsHeaders } from '../_shared/cors.ts';
import { requirePrivilegedUser, reserveAiInteraction, completeAiInteraction, readBody, LabError, dispatchAiInteraction } from '../_shared/lab.ts';
import {
  buildGraphAssistantSystemPrompt,
  buildGraphAssistantUserPrompt
} from './prompt.ts';
import { getAssistantResponseSchema, normalizeAssistantResponse, parseGeminiJsonResponse } from './response.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

type AssistantRequestPayload = {
  question?: string;
  request_id?: string;
  conversationHistory?: Array<{ role?: string; text?: string }>;
  graphContext?: Record<string, unknown>;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  let reservedId: string | undefined;
  let reservedToken = '';
  try {
    const access = await requirePrivilegedUser(request);
    if (!access.ok) {
      return jsonResponse({ error: access.error }, access.status);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;

    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not configured for the operational graph assistant.' }, 500);
    }

    const payload = await readBody(request) as AssistantRequestPayload;
    const question = String(payload?.question || '').trim();
    const graphContext = payload?.graphContext || {};

    if (typeof payload?.question !== 'string' || !question || question.length > 4000) {
      return jsonResponse({ error: 'A graph question is required.' }, 400);
    }

    if (!Array.isArray((graphContext as any)?.nodes) || !Array.isArray((graphContext as any)?.links)) {
      return jsonResponse({ error: 'Graph context is missing nodes or links.' }, 400);
    }

    if (payload.conversationHistory !== undefined && (!Array.isArray(payload.conversationHistory) || payload.conversationHistory.length > 20 || payload.conversationHistory.some(item => !item || !['user', 'assistant'].includes(String(item.role)) || typeof item.text !== 'string' || item.text.length > 8000))) return jsonResponse({ error: 'Invalid conversation history.' }, 400);
    if ((graphContext as any).nodes.length > 300 || (graphContext as any).links.length > 1000) return jsonResponse({ error: 'Graph context is too large.' }, 400);
    const nodes = (graphContext as any).nodes;
    const links = (graphContext as any).links;
    const nodeIds = new Set(nodes.map((node: any) => node?.id));
    if (!nodes.length || nodeIds.size !== nodes.length || nodes.some((node: any) => !node || typeof node.id !== 'string' || !node.id || typeof node.type !== 'string' || typeof node.label !== 'string') || links.some((link: any) => !link || typeof link.source !== 'string' || typeof link.target !== 'string' || !nodeIds.has(link.source) || !nodeIds.has(link.target))) return jsonResponse({ error: 'Graph context contains invalid entities or relationships.' }, 400);
    const promptCatalog = await loadToolPromptCatalog('operational-graph-assistant');
    const systemPromptTemplate = promptCatalog['system'];
    const userPromptTemplate = promptCatalog['user'];

    if (!systemPromptTemplate || !userPromptTemplate) {
      const missingKeys = [
        !systemPromptTemplate ? 'system' : null,
        !userPromptTemplate ? 'user' : null
      ].filter(Boolean).join(', ');

      return jsonResponse(
        { error: `Prompt catalog is missing required keys for operational-graph-assistant: ${missingKeys}.` },
        500
      );
    }

    const systemPrompt = buildGraphAssistantSystemPrompt(graphContext, systemPromptTemplate);
    const userPrompt = buildGraphAssistantUserPrompt({
      question,
      conversationHistory: payload.conversationHistory || [],
      graphContext
    }, userPromptTemplate);
    const interaction = await reserveAiInteraction(access.token, 'operational-graph-assistant', {
      question,
      conversationHistory: payload.conversationHistory || [],
      graphContext
    }, payload.request_id);

    if (!interaction.ok) {
      return jsonResponse({ error: interaction.error }, interaction.status);
    }
    if (interaction.replay) return interaction.replay;
    reservedId = interaction.reservation.log_id;
    reservedToken = access.token;
    await dispatchAiInteraction(reservedId!);

    const geminiResponse = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: systemPrompt
            }
          ]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: userPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: getAssistantResponseSchema()
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = `Model provider returned status ${geminiResponse.status}.`;
      await completeAiInteraction(access.token, interaction.reservation.log_id, {}, 'error', errorText);
      return jsonResponse(
        { error: `Gemini request failed with status ${geminiResponse.status}. ${errorText}`.trim() },
        502
      );
    }

    const geminiPayload = await geminiResponse.json();
    let normalized: Record<string, unknown>;
    try {
      const parsed = parseGeminiJsonResponse(geminiPayload);
      normalized = normalizeAssistantResponse(parsed, graphContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse Gemini response.';
      await completeAiInteraction(access.token, interaction.reservation.log_id, { raw: geminiPayload }, 'error', message);
      throw error;
    }
    await completeAiInteraction(access.token, interaction.reservation.log_id, normalized, 'completed');

    return jsonResponse({
      ...normalized,
      execution_id: interaction.reservation.log_id,
      aiUsage: {
        ...interaction.reservation.usage,
        dailyCount: interaction.reservation.daily_count,
        dailyLimit: interaction.reservation.daily_limit,
        remaining: interaction.reservation.remaining
      }
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected assistant error.';
    if (reservedId) { try { await completeAiInteraction(reservedToken, reservedId, {}, 'error', message); } catch { /* Reservation remains consumed and cannot dispatch again. */ } }
    return jsonResponse({ error: message }, error instanceof LabError ? error.status : 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function loadToolPromptCatalog(toolKey: string): Promise<Record<string, string>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    throw new Error('Prompt catalog access is not configured.');
  }

  const authToken = serviceRoleKey || anonKey || '';
  const query = new URLSearchParams({
    select: 'prompt_key,content,is_active',
    tool_key: `eq.${toolKey}`
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/ai_tool_prompts?${query.toString()}`, {
    headers: {
      apikey: authToken,
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Unable to load prompt catalog from Supabase.');
  }

  const rows = await response.json() as Array<{ prompt_key?: string; content?: string; is_active?: boolean }>;
  const catalog: Record<string, string> = {};

  rows.forEach((row) => {
    if (!row?.is_active) return;
    const key = String(row.prompt_key || '').trim();
    const content = String(row.content || '').trim();
    if (!key || !content) return;
    catalog[key] = content;
  });

  return catalog;
}
