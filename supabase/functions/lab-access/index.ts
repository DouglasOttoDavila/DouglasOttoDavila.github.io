import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticatedUser,
  jsonResponse,
  LabError,
  readBody,
  serviceRpc,
} from "../_shared/lab.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const { user } = await authenticatedUser(request);
    const body = await readBody(request, 10000);
    if (body.action === "status") {
      return jsonResponse(
        await serviceRpc("lab_status", { p_user_id: user.id }),
      );
    }
    if (
      ["admin_overview", "review", "settings", "retry_notifications"].includes(
        body.action,
      )
    ) {
      return jsonResponse(
        await serviceRpc("lab_admin", {
          p_actor_id: user.id,
          p_action: body.action,
          p_payload: body.action === "settings" ? body.settings : body,
        }),
      );
    }
    return jsonResponse({ error: "Unknown Lab action." }, 400);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Lab request failed.",
    }, error instanceof LabError ? error.status : 500);
  }
});
