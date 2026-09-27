import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const body = readFileSync(new URL("../supabase/migrations/202609260001_commerce_release.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n").split("$$")[1];
const definition = { prosrc: body, prosecdef: true, proconfig: ["search_path=public"], result: "jsonb", language: "plpgsql" };

function check(installed, apply = true) {
  const script = `
    process.env.SUPABASE_ACCESS_TOKEN='mock';
    process.env.SUPABASE_URL='https://zlixsxbovbshsyptxymp.supabase.co';
    if (${apply}) process.argv.push('--apply');
    let requests=0;
    globalThis.fetch=async (_url, options)=>{
      const sql=JSON.parse(options.body).query;
      requests++;
      if (sql.startsWith('update')) console.log('CHECKSUM_UPDATED');
      const data=requests===1 ? [{checksum:'unverified-old-hash'}] : requests===2 ? [${JSON.stringify(installed)}] : [];
      return {ok:true,json:async()=>data};
    };
    await import(${JSON.stringify(new URL("./deploy-commerce-release.mjs", import.meta.url).href)});
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
}

test("legacy checksum reconciles only after matching the installed SQL and security settings", () => {
  const result = check(definition);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CHECKSUM_UPDATED/);
});

test("changed SQL or security settings fail closed without updating history", () => {
  for (const patch of [{ prosrc: body.replace("daily>=s.daily_limit", "false") }, { prosecdef: false }, { proconfig: ["search_path=public,evil"] }, { result: "text" }, { language: "sql" }]) {
    const result = check({ ...definition, ...patch });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /differs from the reviewed migration/);
    assert.doesNotMatch(result.stdout, /CHECKSUM_UPDATED/);
  }
});

test("read-only mode verifies equivalent SQL without updating migration history", () => {
  const result = check(definition, false);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /CHECKSUM_UPDATED/);
});
