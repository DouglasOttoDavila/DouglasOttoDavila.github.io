import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { alice, baseline, pending } from "./fixture.ts";
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test(
  "commerce quota migration retains approval, idempotency and shared accounting",
  async () => {
    const db = new PGlite();
    try {
      await db.exec(baseline);
      await db.exec(
        await Deno.readTextFile(
          new URL("../migrations/202609080001_lab_access.sql", import.meta.url),
        ),
      );
      await db.exec(
        await Deno.readTextFile(
          new URL(
            "../migrations/202609260001_commerce_release.sql",
            import.meta.url,
          ),
        ),
      );
      await db.exec(
        "update public.lab_settings set lifetime_limit=10,daily_limit=10,paused=false",
      );
      async function reserve(user: string, id: string, tool: string) {
        const result = await db.query<{ v: any }>(
          "select public.lab_reserve($1,$2,$3,$4) as v",
          [user, id, tool, "a".repeat(64)],
        );
        return result.rows[0].v;
      }
      const id = crypto.randomUUID();
      const first = await reserve(alice, id, "commerce-release-analyst");
      assert(!first.replay, "first execution reserves");
      const replay = await reserve(alice, id, "commerce-release-analyst");
      assert(
        replay.replay && replay.execution.id === first.execution.id,
        "duplicate ID replays",
      );
      for (const tool of [
        "quality-twin-analyst",
        "operational-graph-assistant",
        "user-story-analyzer",
      ])
        await reserve(alice, crypto.randomUUID(), tool);
      assert(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from public.lab_executions",
          )
        ).rows[0].n === 4,
        "same accounting table; no duplicate",
      );
      async function rejects(fn: () => Promise<unknown>, text: string) {
        let message = "";
        try {
          await fn();
        } catch (e) {
          message = String(e);
        }
        assert(
          message.includes(text),
          "Expected rejection: " + text + "; got: " + message,
        );
      }
      await rejects(
        () => reserve(pending, crypto.randomUUID(), "commerce-release-analyst"),
        "not approved",
      );
      await rejects(
        () => reserve(alice, id, "quality-twin-analyst"),
        "different input",
      );
      await rejects(
        () => reserve(alice, crypto.randomUUID(), "invented-tool"),
        "Invalid execution",
      );
      await db.exec("update public.lab_settings set daily_limit=4");
      await rejects(
        () => reserve(alice, crypto.randomUUID(), "commerce-release-analyst"),
        "Shared daily execution limit",
      );
    } finally {
      await db.close();
    }
  },
);
