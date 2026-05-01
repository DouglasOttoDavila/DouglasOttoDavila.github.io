import { corsHeaders } from '../_shared/cors.ts';
import { buildGraphAssistantSystemPrompt, buildGraphAssistantUserPrompt } from './prompt.ts';
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

    const geminiResponse = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: buildGraphAssistantSystemPrompt(graphContext)
            }
          ]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: buildGraphAssistantUserPrompt({
                  question,
                  conversationHistory: payload.conversationHistory || [],
                  graphContext
                })
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
      return jsonResponse(
        { error: `Gemini request failed with status ${geminiResponse.status}. ${errorText}`.trim() },
        502
      );
    }

    const geminiPayload = await geminiResponse.json();
    const parsed = parseGeminiJsonResponse(geminiPayload);
    const normalized = normalizeAssistantResponse(parsed, graphContext);

    return jsonResponse(normalized, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected assistant error.';
    return jsonResponse({ error: message }, 500);
  }
});

async function requirePrivilegedUser(request: Request): Promise<{ ok: true; user: SupabaseAuthUser } | { ok: false; status: number; error: string }> {
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

  return { ok: true, user };
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
