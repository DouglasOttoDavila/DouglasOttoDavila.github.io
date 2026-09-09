import { readBody } from "../functions/_shared/lab.ts";
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test("Edge endpoints validate before dispatch and replay without another model request", async () => {
  const originalServe = Deno.serve, originalFetch = globalThis.fetch;
  const names = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
  ];
  const previous = names.map((name) => Deno.env.get(name));
  names.forEach((name) =>
    Deno.env.set(
      name,
      name === "SUPABASE_URL" ? "https://fixture.supabase.co" : "fixture-key",
    )
  );
  const handlers: any[] = [];
  let calls: string[] = [],
    approved = true,
    replay = false,
    failProvider = false;
  (Deno as any).serve = (handler: any) => {
    handlers.push(handler);
    return {};
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    const name = url.split("/").pop()!;
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
    }
    if (url.includes("/rpc/")) {
      calls.push(name);
      if (name === "lab_status") {
        return Response.json({
          access: { state: approved ? "approved" : "pending" },
        });
      }
      if (name === "lab_reserve") {
        return Response.json({
          replay,
          execution: {
            id: "22222222-2222-4222-8222-222222222222",
            status: replay ? "completed" : "reserved",
            result: { answer: "Stored result" },
          },
          usage: {
            daily_used: 1,
            daily_limit: 10,
            daily_remaining: 9,
            lifetime_remaining: 9,
          },
        });
      }
      if (name === "lab_dispatch") return Response.json(true);
      return Response.json(null);
    }
    if (url.includes("generativelanguage")) {
      calls.push("provider");
      assert(!url.includes("key="), "provider URL never exposes secret");
      assert(
        new Headers((options as { headers?: HeadersInit })?.headers).get(
          "x-goog-api-key",
        ) === "fixture-key",
        "provider key header",
      );
      return failProvider ? Response.json({}, { status: 503 }) : Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                answer: "Grounded answer",
                referencedNodeIds: [],
                actions: [],
              }),
            }],
          },
        }],
      });
    }
    if (url.includes("operational-graph-assistant")) {
      return Response.json([{
        prompt_key: "system",
        content: "Review {{graphContext}}",
        is_active: true,
      }, { prompt_key: "user", content: "{{question}}", is_active: true }]);
    }
    if (url.includes("ai_tool_prompts")) {
      const keys = [
        "missing.actor",
        "missing.want",
        "missing.benefit",
        "missing.gherkin",
        "missing.thresholds",
        "missing.none",
        "rewrite.default_actor",
        "rewrite.default_outcome",
        "rewrite.default_benefit",
        "rewrite.story_template",
        "gherkin.given_template",
        "gherkin.when_template",
        "gherkin.then_template",
        "suggestion.independent.split",
        "suggestion.independent.focus",
        "suggestion.negotiable.replace_ambiguous",
        "suggestion.negotiable.keep_outcome_focused",
        "suggestion.valuable.retain_value",
        "suggestion.valuable.add_so_that",
        "suggestion.estimable.refine_scope",
        "suggestion.estimable.add_metrics",
        "suggestion.small.reduce_scope",
        "suggestion.small.keep_concise",
        "suggestion.testable.keep_gherkin",
        "suggestion.testable.add_gherkin",
        "overall.high",
        "overall.medium",
        "overall.low",
      ];
      return Response.json(
        keys.map((prompt_key) => ({
          prompt_key,
          content: "Example review guidance",
          is_active: true,
        })),
      );
    }
    return Response.json([]);
  };
  try {
    await import("../functions/user-story-analyzer/index.ts");
    await import("../functions/operational-graph-assistant/index.ts");
    const [analyzer, graph] = handlers;
    const invoke = (handler: any, body: any, auth = true) =>
      handler(
        new Request("https://fixture/function", {
          method: "POST",
          headers: {
            ...(auth ? { Authorization: "Bearer fixture-token" } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    assert(
      (await invoke(analyzer, { story_content: "story" }, false)).status ===
        401,
      "unauthenticated blocked",
    );
    assert(!calls.includes("lab_reserve"), "no unauthenticated reservation");
    approved = false;
    assert(
      (await invoke(analyzer, { story_content: "story" })).status === 403,
      "pending blocked",
    );
    approved = true;
    calls = [];
    assert(
      (await invoke(analyzer, { story_content: {} })).status === 400,
      "invalid story rejected",
    );
    assert(!calls.includes("lab_reserve"), "invalid input free");
    assert(
      (await invoke(analyzer, {
        story_content: "a".repeat(12000),
        request_id: crypto.randomUUID(),
      })).status === 200,
      "12k story supported",
    );
    assert(
      calls.includes("lab_dispatch") && calls.includes("lab_complete"),
      "successful dispatch completed",
    );
    calls = [];
    replay = true;
    assert(
      (await invoke(analyzer, {
        story_content: "a".repeat(12000),
        request_id: crypto.randomUUID(),
      })).status === 200,
      "stored result replayed",
    );
    assert(!calls.includes("lab_dispatch"), "replay never dispatches");
    replay = false;
    calls = [];
    const graphBody = {
      question: "What is affected?",
      graphContext: {
        nodes: [{ id: "n", label: "Node", type: "Requirement" }],
        links: [],
        schema: { nodeTypes: ["Requirement"] },
      },
    };
    const invalid = await invoke(graph, {
      ...graphBody,
      graphContext: { nodes: [null], links: [] },
    });
    assert(
      invalid.status === 400 && !calls.includes("lab_reserve"),
      "invalid graph free",
    );
    const valid = await invoke(graph, graphBody);
    assert(
      valid.status === 200,
      "valid graph calls provider: " + await valid.text(),
    );
    calls = [];
    failProvider = true;
    assert(
      (await invoke(graph, graphBody)).status === 502,
      "provider failures reported",
    );
    assert(
      calls.filter((name) => name === "provider").length === 1 &&
        calls.includes("lab_complete"),
      "failed dispatch recorded once",
    );
    let oversized = false;
    try {
      await readBody(
        new Request("https://fixture", {
          method: "POST",
          body: "x".repeat(101),
        }),
        100,
      );
    } catch (error: any) {
      oversized = error.status === 413;
    }
    assert(oversized, "oversized streamed body stopped");
  } finally {
    (Deno as any).serve = originalServe;
    globalThis.fetch = originalFetch;
    names.forEach((name, index) =>
      previous[index] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, previous[index]!)
    );
  }
});
