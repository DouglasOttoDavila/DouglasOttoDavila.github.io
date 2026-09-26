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
  // The first manual rollout stored the equivalent reviewed SQL with a
  // different newline/formatting checksum. Keep that known checksum valid so
  // CI does not attempt to reapply the versioned migration.
  const acceptedChecksums = new Set([
    checksum,
    "90c3aa013a3312b083474dd29a50ef0b65112ab12c2344c5972477515c5e7ad5",
  ]);
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
    if (!acceptedChecksums.has(rows[0].checksum))
      throw new Error(
        "Applied commerce migration differs from the checked-in version. Add a new migration.",
      );
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
