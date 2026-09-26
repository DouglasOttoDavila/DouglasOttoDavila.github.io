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
  applyWhatIf,
  getSnapshot,
  type Scenario,
} from "../_shared/twin/domain.ts";
import {
  analysisContext,
  analystPolicy,
  validateAnalysis,
} from "../_shared/twin/analyst.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);
  let logId: string | undefined,
    token = "";
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
    const payload = await readBody(request, 16000);
    let snapshot;
    try {
      if (
        !["A", "B", "C"].includes(payload.scenario) ||
        !(payload.cursor === null || typeof payload.cursor === "string") ||
        typeof payload.selected !== "string" ||
        !Array.isArray(payload.events) ||
        payload.events.length > 20
      )
        throw new Error("Invalid analysis request");
      snapshot = getSnapshot(payload.scenario as Scenario, payload.cursor);
      for (const event of payload.events)
        snapshot = applyWhatIf(snapshot, event);
    } catch {
      throw new LabError("Invalid scenario, cursor or fork events.", 400);
    }
    let context: string;
    try {
      context = analysisContext(snapshot, payload.selected);
    } catch {
      throw new LabError("Select a PR or event target.", 400);
    }
    if (context.length > 24000)
      throw new LabError("Context exceeds analysis limit.", 400);
    const preference = await serviceRpc("lab_model_preference", {
      p_user_id: access.user.id,
    });
    const model = models.some((m) => m.id === preference)
      ? preference
      : DEFAULT_MODEL;
    const reservation = await reserveAiInteraction(
      token,
      "quality-twin-analyst",
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
            { role: "system", content: analystPolicy },
            { role: "user", content: context },
          ],
          temperature: 0.1,
          max_tokens: 1800,
          stream: false,
          ...(model.startsWith("nvidia/nemotron-3")
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        }),
      },
    );
    if (!response.ok)
      throw new LabError(
        "AI provider failed. The dispatched execution was counted.",
        502,
      );
    let output;
    try {
      const body = await response.json();
      output = validateAnalysis(
        JSON.parse(body.choices[0].message.content),
        snapshot,
      );
    } catch {
      throw new LabError(
        "Malformed AI output or invalid citation; response rejected. Execution counted.",
        502,
      );
    }
    const result = {
      ...output,
      model,
      generatedAt: new Date().toISOString(),
      mode: "live",
      aiUsage: reservation.reservation.usage,
    };
    await completeAiInteraction(token, logId, result, "completed");
    return jsonResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed";
    if (logId)
      try {
        await completeAiInteraction(token, logId, {}, "error", message);
      } catch {}
    return jsonResponse(
      { error: message },
      error instanceof LabError ? error.status : 502,
    );
  }
});
