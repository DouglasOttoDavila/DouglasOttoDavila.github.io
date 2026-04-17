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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
    return jsonResponse({ error: String(error?.message || 'Unexpected assistant error.') }, 500);
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
