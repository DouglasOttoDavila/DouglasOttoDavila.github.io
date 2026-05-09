import { corsHeaders } from '../_shared/cors.ts';
import {
  buildGraphAssistantSystemPrompt,
  buildGraphAssistantUserPrompt
} from './prompt.ts';
import { getAssistantResponseSchema, normalizeAssistantResponse, parseGeminiJsonResponse } from './response.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

type AssistantRequestPayload = {
  question?: string;
  conversationHistory?: Array<{ role?: string; text?: string }>;
  graphContext?: Record<string, unknown>;
};

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

type PrivilegedAccess = {
  ok: true;
  token: string;
  user: SupabaseAuthUser;
};

type AiInteractionReservation = {
  log_id?: string;
  daily_count?: number;
  daily_limit?: number;
  remaining?: number;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    const payload = await request.json() as AssistantRequestPayload;
    const question = String(payload?.question || '').trim();
    const graphContext = payload?.graphContext || {};

    if (!question) {
      return jsonResponse({ error: 'A graph question is required.' }, 400);
    }

    if (!Array.isArray((graphContext as any)?.nodes) || !Array.isArray((graphContext as any)?.links)) {
      return jsonResponse({ error: 'Graph context is missing nodes or links.' }, 400);
    }

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
      systemPrompt,
      userPrompt
    });

    if (!interaction.ok) {
      return jsonResponse({ error: interaction.error }, interaction.status);
    }

    const geminiResponse = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      const errorText = await geminiResponse.text();
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
      aiUsage: {
        dailyCount: interaction.reservation.daily_count,
        dailyLimit: interaction.reservation.daily_limit,
        remaining: interaction.reservation.remaining
      }
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected assistant error.';
    return jsonResponse({ error: message }, 500);
  }
});

async function requirePrivilegedUser(request: Request): Promise<PrivilegedAccess | { ok: false; status: number; error: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: 'Assistant authorization is not configured.' };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Log in to unlock the graph AI assistant.' };
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!userResponse.ok) {
    return { ok: false, status: 401, error: 'Log in to unlock the graph AI assistant.' };
  }

  const user = await userResponse.json() as SupabaseAuthUser;
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Log in to unlock the graph AI assistant.' };
  }

  const profileUrl = new URL('/rest/v1/profiles', supabaseUrl);
  profileUrl.searchParams.set('select', 'has_privileges');
  profileUrl.searchParams.set('user_id', `eq.${user.id}`);
  profileUrl.searchParams.set('limit', '1');

  const profileResponse = await fetch(profileUrl, {
    headers: {
      apikey: supabaseServiceRoleKey || supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey || token}`,
      Accept: 'application/json'
    }
  });

  if (!profileResponse.ok) {
    return { ok: false, status: 403, error: 'Your account is not approved for this AI feature.' };
  }

  const profiles = await profileResponse.json() as Array<{ has_privileges?: boolean }>;
  if (!profiles.some(profile => profile?.has_privileges === true)) {
    return { ok: false, status: 403, error: 'Your account is not approved for this AI feature.' };
  }

  return { ok: true, token, user };
}

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

async function reserveAiInteraction(
  userToken: string,
  toolKey: string,
  promptPayload: Record<string, unknown>
): Promise<{ ok: true; reservation: AiInteractionReservation } | { ok: false; status: number; error: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: 'AI interaction tracking is not configured.' };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_ai_interaction`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      p_tool_key: toolKey,
      p_prompt_payload: promptPayload
    })
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = extractSupabaseError(payload, 'Unable to reserve an AI interaction.');
    return {
      ok: false,
      status: message.toLowerCase().includes('limit reached') ? 429 : response.status,
      error: message
    };
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row?.log_id) {
    return { ok: false, status: 500, error: 'AI interaction reservation returned no log id.' };
  }

  return { ok: true, reservation: row };
}

async function completeAiInteraction(
  userToken: string,
  logId: string | undefined,
  responsePayload: Record<string, unknown>,
  status: 'completed' | 'error',
  errorMessage = ''
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey || !logId) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/complete_ai_interaction`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_log_id: logId,
        p_response_payload: responsePayload,
        p_status: status,
        p_error_message: errorMessage
      })
    });
  } catch (error) {
    console.error('[ai-interactions] failed to complete interaction log', error);
  }
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function extractSupabaseError(payload: any, fallback: string): string {
  return String(payload?.message || payload?.error || payload?.hint || fallback);
}
