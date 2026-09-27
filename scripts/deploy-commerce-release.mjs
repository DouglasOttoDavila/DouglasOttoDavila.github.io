// Explicit, versioned migration; token never leaves the management request headers.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function main() {
  const project = "zlixsxbovbshsyptxymp";
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  if (
    process.env.SUPABASE_URL?.replace(/\/$/, "") !==
    `https://${project}.supabase.co`
  )
    throw new Error("Expected SUPABASE_URL for the portfolio project.");
  const migration = (
    await readFile(
      new URL(
        "../supabase/migrations/202609260001_commerce_release.sql",
        import.meta.url,
      ),
      "utf8",
    )
  )
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  const checksum = createHash("sha256").update(migration).digest("hex");
  async function query(sql) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${project}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Commerce migration failed (${response.status}); inspect database state before retrying.`,
      );
    return response.json();
  }
  const rows = await query(
    "select checksum from public.lab_schema_migrations where version='202609260001'",
  );
  if (rows.length) {
    if (rows[0].checksum !== checksum) {
      // A historical checksum alone cannot establish SQL equivalence. Check
      // the actual installed body and security settings before reconciling it.
      const [installed] = await query("select prosrc, prosecdef, proconfig, pg_get_function_result(oid) as result, (select lanname from pg_language where oid=prolang) as language from pg_proc where oid='public.lab_reserve(uuid,uuid,text,text)'::regprocedure");
      const expectedBody = migration.split("$$")[1];
      if (!expectedBody || installed?.prosrc?.replace(/\r\n/g, "\n").trim() !== expectedBody.trim() ||
          installed.prosecdef !== true || installed.result !== "jsonb" || installed.language !== "plpgsql" ||
          JSON.stringify(installed.proconfig) !== JSON.stringify(["search_path=public"]))
        throw new Error("Applied commerce SQL differs from the reviewed migration. Add a new migration.");
      if (process.argv.includes("--apply")) {
        await query(`update public.lab_schema_migrations set checksum='${checksum}' where version='202609260001' and checksum='${rows[0].checksum.replace(/'/g, "''")}'`);
      }
      console.log("Installed commerce SQL verified against the reviewed migration.");
    }
    console.log("Commerce release migration already applied.");
    return;
  }
  if (!process.argv.includes("--apply")) {
    console.log("Commerce release migration pending. Use --apply to apply it.");
    return;
  }
  await query(`begin;
select pg_advisory_xact_lock(202609260001);
${migration}
insert into public.lab_schema_migrations(version,checksum) values('202609260001','${checksum}') on conflict (version) do nothing;
commit;`);
  console.log("Commerce release quota allowlist applied.");
}
await main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
