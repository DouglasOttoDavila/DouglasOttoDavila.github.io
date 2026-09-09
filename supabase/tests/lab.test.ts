import { alice, baseline, bob, owner, pending } from "./fixture.ts";
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test("Lab authorization, settings, shared quotas, replay, day boundary and durable emails", async () => {
  const db = new PGlite();
  try {
    await db.exec(baseline);
    await db.exec(
      await Deno.readTextFile(
        new URL("../migrations/202609080001_lab_access.sql", import.meta.url),
      ),
    );
    const rpc = async (name: string, args: unknown[]) => {
      const r = await db.query<{ v: any }>(
        `select public.${name}(${
          args.map((_, i) => "$" + (i + 1)).join(",")
        }) as v`,
        args,
      );
      return r.rows[0].v;
    };
    const fails = async (fn: () => Promise<unknown>, fragment: string) => {
      try {
        await fn();
        throw new Error("Expected rejection: " + fragment);
      } catch (e) {
        assert(String(e).includes(fragment), "Unexpected error: " + e);
      }
    };
    let state = await rpc("lab_status", [pending]);
    assert(state.access.state === "pending", "new pending");
    await rpc("lab_status", [pending]);
    assert(
      (await db.query<{ n: number }>(
        "select count(*)::int n from lab_email_outbox",
      )).rows[0].n === 1,
      "request email deduplicated",
    );
    await fails(
      () =>
        rpc("lab_admin", [alice, "review", {
          user_id: pending,
          state: "approved",
        }]),
      "Administrator access required",
    );
    await rpc("lab_admin", [owner, "review", {
      user_id: pending,
      state: "approved",
    }]);
    assert(
      (await rpc("lab_status", [pending])).access.state === "approved",
      "owner approval",
    );
    assert(
      (await db.query<{ n: number }>(
        "select count(*)::int n from lab_email_outbox",
      )).rows[0].n === 2,
      "approval email queued",
    );
    await fails(
      () =>
        rpc("lab_admin", [owner, "review", {
          user_id: owner,
          state: "revoked",
        }]),
      "Administrator access cannot",
    );
    const settings = {
      lifetime_limit: 3,
      daily_limit: 2,
      timezone: "America/Sao_Paulo",
      notification_email: "owner@example.test",
      paused: false,
    };
    await rpc("lab_admin", [owner, "settings", settings]);
    const hash = "a".repeat(64), id = crypto.randomUUID();
    const first = await rpc("lab_reserve", [
      alice,
      id,
      "user-story-analyzer",
      hash,
    ]);
    assert(first.replay === false && first.usage.daily_used === 1, "reserve");
    const replay = await rpc("lab_reserve", [
      alice,
      id,
      "user-story-analyzer",
      hash,
    ]);
    assert(replay.replay, "in-flight dedup");
    await fails(
      () =>
        rpc("lab_reserve", [alice, id, "operational-graph-assistant", hash]),
      "different input",
    );
    await rpc("lab_dispatch", [first.execution.id]);
    await rpc("lab_complete", [first.execution.id, { answer: 42 }, null]);
    assert(
      (await rpc("lab_reserve", [alice, id, "user-story-analyzer", hash]))
        .execution.result.answer === 42,
      "stored replay",
    );
    const bobRun = await rpc("lab_reserve", [
      bob,
      crypto.randomUUID(),
      "operational-graph-assistant",
      hash,
    ]);
    await rpc("lab_dispatch", [bobRun.execution.id]);
    await fails(
      () =>
        rpc("lab_reserve", [
          owner,
          crypto.randomUUID(),
          "user-story-analyzer",
          hash,
        ]),
      "Shared daily execution limit",
    );
    await db.exec(
      "update lab_executions set created_at=(date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')-interval '1 second'",
    );
    const afterMidnight = await rpc("lab_status", [alice]);
    assert(
      afterMidnight.usage.daily_used === 0 &&
        afterMidnight.usage.lifetime_used === 1,
      "timezone day reset preserves lifetime",
    );
    await rpc("lab_admin", [owner, "settings", {
      ...settings,
      lifetime_limit: 1,
    }]);
    await fails(
      () =>
        rpc("lab_reserve", [
          alice,
          crypto.randomUUID(),
          "user-story-analyzer",
          hash,
        ]),
      "Lifetime execution limit",
    );
    await rpc("lab_admin", [owner, "review", {
      user_id: alice,
      state: "revoked",
    }]);
    await fails(
      () => rpc("lab_reserve", [alice, id, "user-story-analyzer", hash]),
      "not approved",
    );
    await rpc("lab_admin", [owner, "settings", { ...settings, paused: true }]);
    await fails(
      () =>
        rpc("lab_reserve", [
          owner,
          crypto.randomUUID(),
          "user-story-analyzer",
          hash,
        ]),
      "paused",
    );
    await fails(
      () =>
        rpc("lab_admin", [owner, "settings", {
          ...settings,
          timezone: "Invalid/Zone",
        }]),
      "Invalid timezone",
    );
    const claimed = await db.query<{ id: string }>(
      "select id from lab_claim_emails()",
    );
    assert(
      claimed.rows.length === 1,
      "outbox claim skips superseded request email",
    );
    assert(
      (await db.query("select id from lab_claim_emails()")).rows.length === 0,
      "outbox claims exclusive",
    );
    await rpc("lab_finish_email", [claimed.rows[0].id, "temporary"]);
    await rpc("lab_admin", [owner, "retry_notifications", {}]);
    assert(
      (await db.query("select id from lab_claim_emails()")).rows.length === 1,
      "durable retry",
    );
    await rpc("lab_admin", [owner, "review", {
      user_id: pending,
      state: "revoked",
    }]);
    await db.exec(
      "update lab_email_outbox set locked_at=now()-interval '6 minutes' where status='sending'",
    );
    assert(
      (await db.query("select id from lab_claim_emails()")).rows.length === 0,
      "expired sending approval cancelled after revocation",
    );
    await rpc("lab_admin", [owner, "settings", {
      ...settings,
      paused: false,
      lifetime_limit: 10,
      daily_limit: 10,
    }]);
    const beforeLease = (await rpc("lab_status", [owner])).usage.lifetime_used;
    const abandoned = await rpc("lab_reserve", [
      owner,
      crypto.randomUUID(),
      "user-story-analyzer",
      hash,
    ]);
    await db.query(
      "update lab_executions set created_at=clock_timestamp()-interval '6 minutes' where id=$1",
      [abandoned.execution.id],
    );
    assert(
      (await rpc("lab_status", [owner])).usage.lifetime_used === beforeLease,
      "undispatched expired reservation releases allowance",
    );
    assert(
      await rpc("lab_dispatch", [abandoned.execution.id]) === false,
      "expired reservation cannot dispatch later",
    );
    await db.exec("set role authenticated");
    await fails(
      () =>
        db.query("update profiles set is_admin=true where user_id=$1", [alice]),
      "permission denied",
    );
    await fails(
      () =>
        rpc("lab_reserve", [
          alice,
          crypto.randomUUID(),
          "user-story-analyzer",
          hash,
        ]),
      "permission denied",
    );
    await fails(
      () => db.query("update lab_access set is_admin=true"),
      "permission denied",
    );
    await fails(
      () => rpc("reserve_ai_interaction", ["user-story-analyzer", {}]),
      "permission denied",
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
