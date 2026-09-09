import { corsHeaders } from "./cors.ts";
export class LabError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export async function serviceRpc(
  name: string,
  args: Record<string, unknown> = {},
) {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new LabError("Lab backend is not configured.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.code;
    throw new LabError(
      data?.message || "Lab operation failed.",
      code === "42501"
        ? 403
        : code === "22023" || code === "22P02" || code === "23514" ||
            code === "23502"
        ? 400
        : code === "P0001"
        ? 429
        : 500,
    );
  }
  return data;
}
export async function authenticatedUser(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)
    ?.[1];
  if (!token) throw new LabError("Sign in with Google to continue.", 401);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new LabError("Lab authentication is not configured.");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new LabError("Your session expired. Sign in again.", 401);
  }
  const user = await response.json();
  if (!user.id) throw new LabError("Invalid session.", 401);
  return { user, token };
}
export async function requirePrivilegedUser(request: Request) {
  try {
    const { user, token } = await authenticatedUser(request);
    const status = await serviceRpc("lab_status", { p_user_id: user.id });
    if (status.access.state !== "approved") {
      throw new LabError("Your Lab access is not approved.", 403);
    }
    return { ok: true as const, user, token };
  } catch (error) {
    return {
      ok: false as const,
      status: error instanceof LabError ? error.status : 500,
      error: error instanceof Error ? error.message : "Authorization failed.",
    };
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value).filter(([, v]) =>
      v !== undefined
    ).sort(([a], [b]) =>
      a.localeCompare(b)
    ).map(([k, v]) =>
      JSON.stringify(k) + ":" + canonical(v)
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
export async function reserveAiInteraction(
  userToken: string,
  toolKey: string,
  payload: Record<string, unknown>,
  requestId?: string,
) {
  try {
    const id = requestId || crypto.randomUUID();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) throw new LabError("request_id must be a UUID.", 400);
    const { user } = await authenticatedUser(
      new Request("https://lab.local", {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
    );
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonical(payload)),
        ),
      ),
    ).map((n) => n.toString(16).padStart(2, "0")).join("");
    const data = await serviceRpc("lab_reserve", {
      p_user_id: user.id,
      p_request_id: id,
      p_tool_key: toolKey,
      p_request_hash: hash,
    });
    const usage = data.usage, execution = data.execution;
    const aiUsage = {
      ...usage,
      dailyCount: usage.daily_used,
      dailyLimit: usage.daily_limit,
      remaining: Math.min(usage.daily_remaining, usage.lifetime_remaining),
    };
    let replay: Response | undefined;
    if (data.replay) {
      replay = execution.status === "completed"
        ? jsonResponse({
          ...execution.result,
          execution_id: execution.id,
          aiUsage,
        })
        : jsonResponse({
          error: execution.status === "cancelled"
            ? "This execution did not start and was not charged. Start a new request."
            : execution.status === "error"
            ? "This execution failed and has already been counted. Start a new request to try again."
            : "This execution is still processing. Retry with the same request ID.",
          execution_id: execution.id,
          aiUsage,
        }, execution.status === "error" ? 502 : 409);
    }
    return {
      ok: true as const,
      reservation: {
        log_id: execution.id,
        daily_count: usage.daily_used,
        daily_limit: usage.daily_limit,
        remaining: aiUsage.remaining,
        usage,
      },
      replay,
    };
  } catch (error) {
    return {
      ok: false as const,
      status: error instanceof LabError ? error.status : 500,
      error: error instanceof Error
        ? error.message
        : "Execution reservation failed.",
    };
  }
}
export async function completeAiInteraction(
  _userToken: string,
  logId: string | undefined,
  result: Record<string, unknown>,
  status: "completed" | "error",
  errorMessage = "",
) {
  if (logId) {
    await serviceRpc("lab_complete", {
      p_execution_id: logId,
      p_result: result,
      p_error: status === "error"
        ? (errorMessage || "Execution failed.")
        : null,
    });
  }
}
export async function dispatchAiInteraction(logId: string) {
  if (!await serviceRpc("lab_dispatch", { p_execution_id: logId })) {
    throw new LabError(
      "The execution reservation expired. Start a new request.",
      409,
    );
  }
}
export async function readBody(request: Request, maxBytes = 150000) {
  const reader = request.body?.getReader();
  if (!reader) throw new LabError("Invalid JSON request.", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new LabError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(joined));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new LabError("Invalid JSON request.", 400);
  }
}
