import { corsHeaders } from "../_shared/cors.ts";
import {
  requirePrivilegedUser,
  readBody,
  reserveAiInteraction,
  dispatchAiInteraction,
  completeAiInteraction,
  jsonResponse,
  LabError,
  serviceRpc,
} from "../_shared/lab.ts";
import { models, DEFAULT_MODEL } from "../_shared/models.ts";
import {
  contextFor,
  policy,
  validateAdvice,
  validateRequest,
} from "../_shared/commerce/analyst.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);
  let logId: string | undefined;
  let token = "";
  try {
    const access = await requirePrivilegedUser(request);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    token = access.token;
    const apiKey = Deno.env.get("NVIDIA_API_KEY");
    if (!apiKey)
      throw new LabError(
        "Live AI unavailable: NVIDIA_API_KEY is not configured. No execution consumed.",
        503,
      );
    const payload = await readBody(request, 4000);
    let input;
    try {
      input = validateRequest(payload);
    } catch {
      throw new LabError(
        "Invalid stage, branch, budget, or evidence state. No execution consumed.",
        400,
      );
    }
    const context = contextFor(input);
    const preference = await serviceRpc("lab_model_preference", {
      p_user_id: access.user.id,
    });
    const model = models.some((m) => m.id === preference)
      ? preference
      : DEFAULT_MODEL;
    const reservation = await reserveAiInteraction(
      token,
      "commerce-release-analyst",
      { context, model },
      payload.request_id,
    );
    if (!reservation.ok)
      return jsonResponse({ error: reservation.error }, reservation.status);
    if (reservation.replay) return reservation.replay;
    logId = reservation.reservation.log_id;
    await dispatchAiInteraction(logId!);
    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: policy },
            { role: "user", content: context },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          stream: false,
          ...(model.startsWith("nvidia/nemotron-3")
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        }),
      },
    );
    if (!response.ok)
      throw new LabError(
        "AI provider failed. This dispatched execution was counted. You can retry explicitly.",
        502,
      );
    let advice;
    try {
      const body = await response.json();
      advice = validateAdvice(JSON.parse(body.choices[0].message.content));
    } catch {
      throw new LabError(
        "AI response rejected: malformed output or unsupported citations. Execution counted.",
        502,
      );
    }
    const result = {
      ...advice,
      model,
      generatedAt: new Date().toISOString(),
      input,
      mode: "live",
      aiUsage: reservation.reservation.usage,
    };
    await completeAiInteraction(token, logId!, result, "completed");
    return jsonResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed";
    if (logId) {
      try {
        await completeAiInteraction(token, logId, {}, "error", message);
      } catch {
        /* Preserve original failure. */
      }
    }
    return jsonResponse(
      { error: message },
      error instanceof LabError ? error.status : 502,
    );
  }
});
