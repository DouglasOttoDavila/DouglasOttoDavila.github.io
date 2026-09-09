// Uses an ephemeral native PostgreSQL 17 cluster bound only to loopback.
import * as binaries from "npm:@embedded-postgres/windows-x64@17.6.0-beta.15";
import pg from "npm:pg@8.16.3";
import { spawn } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { alice, baseline, bob, owner } from "./fixture.ts";
const run = (file: string, args: string[], _options: unknown) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once(
      "exit",
      (code) =>
        code === 0
          ? resolve()
          : reject(new Error("PostgreSQL utility exited " + code)),
    );
  });
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test({
  name:
    "Native PostgreSQL concurrent transactions enforce last global slot and same-ID dispatch once",
  sanitizeOps: false,
  sanitizeResources: false,
  ignore: Deno.build.os !== "windows",
  fn: async () => {
    const testRoot = resolve("supabase/tests");
    const data = await Deno.makeTempDir({
      dir: testRoot,
      prefix: ".postgres-",
    });
    const port = 54320 + Math.floor(Math.random() * 5000);
    let started = false;
    const pool = new pg.Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
      max: 4,
    });
    try {
      await run(binaries.initdb, [
        "-D",
        data,
        "-U",
        "postgres",
        "-A",
        "trust",
        "--encoding=UTF8",
        "--locale=C",
      ], { windowsHide: true });
      await run(binaries.pg_ctl, [
        "-D",
        data,
        "-l",
        resolve(data, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port}`,
        "-w",
        "start",
      ], { windowsHide: true });
      started = true;
      await pool.query(baseline);
      await pool.query(
        await Deno.readTextFile(
          new URL("../migrations/202609080001_lab_access.sql", import.meta.url),
        ),
      );
      const settings = {
        lifetime_limit: 10,
        daily_limit: 1,
        timezone: "America/Sao_Paulo",
        notification_email: "owner@example.test",
        paused: false,
      };
      await pool.query("select lab_admin($1,$2,$3)", [
        owner,
        "settings",
        settings,
      ]);
      const one = await pool.connect(), two = await pool.connect();
      const hash = "f".repeat(64);
      try {
        await one.query("begin");
        await one.query("select lab_reserve($1,$2,$3,$4)", [
          alice,
          crypto.randomUUID(),
          "user-story-analyzer",
          hash,
        ]);
        let secondSettled = false;
        const contender = two.query("select lab_reserve($1,$2,$3,$4)", [
          bob,
          crypto.randomUUID(),
          "operational-graph-assistant",
          hash,
        ]).then(
          () => ({ ok: true, error: "" }),
          (e: unknown) => ({ ok: false, error: String(e) }),
        ).finally(() => {
          secondSettled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert(
          !secondSettled,
          "second transaction must wait for global quota row",
        );
        await one.query("commit");
        const outcome = await contender;
        assert(
          !outcome.ok && outcome.error.includes("Shared daily execution limit"),
          "second transaction sees committed global consumption",
        );
        assert(
          (await pool.query("select count(*)::int n from lab_executions"))
            .rows[0].n === 1,
          "only one dispatch reserved",
        );
        await pool.query("select lab_admin($1,$2,$3)", [owner, "settings", {
          ...settings,
          daily_limit: 10,
        }]);
        const duplicateId = crypto.randomUUID();
        await one.query("begin");
        const reserved = (await one.query("select lab_reserve($1,$2,$3,$4) v", [
          alice,
          duplicateId,
          "user-story-analyzer",
          hash,
        ])).rows[0].v;
        const duplicate = two.query("select lab_reserve($1,$2,$3,$4) v", [
          alice,
          duplicateId,
          "user-story-analyzer",
          hash,
        ]);
        await one.query("commit");
        const replay = (await duplicate).rows[0].v;
        assert(
          replay.replay && replay.execution.id === reserved.execution.id,
          "concurrent identical request replays same reservation",
        );
        assert(
          (await pool.query("select count(*)::int n from lab_executions"))
            .rows[0].n === 2,
          "duplicate did not increment count",
        );
      } finally {
        await one.query("rollback");
        one.release();
        two.release();
      }
    } finally {
      await pool.end();
      if (started) {
        await run(binaries.pg_ctl, ["-D", data, "-m", "fast", "-w", "stop"], {
          windowsHide: true,
        });
      }
      // Only delete the unique scratch cluster created by this test, after stopping it.
      if (
        dirname(resolve(data)) !== testRoot ||
        !basename(data).startsWith(".postgres-")
      ) throw new Error("Unexpected scratch path; cleanup refused");
      await Deno.remove(data, { recursive: true });
    }
  },
});
