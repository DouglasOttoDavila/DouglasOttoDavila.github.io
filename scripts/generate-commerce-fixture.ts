// Materialize canonical evidence for both browser and Edge runtimes.
// Deno: deno run --allow-read --allow-write scripts/generate-commerce-fixture.ts
import { getSnapshot, tracePath } from "../supabase/functions/_shared/twin/domain.ts";

const snapshot = getSnapshot("A", null);
const ids = ["story-A", "ac-A", "pr-A1", "file-A1", "payment", "api-payment", "cap-A", "inv-A", "test-A1", "test-A2", "test-A3", "test-A4", "checkout", "inventory", "pr-A2"];
const entities = ids.map(id => {
  const entity = snapshot.entities.find(e => e.id === id);
  if (!entity) throw new Error(`Missing canonical evidence: ${id}`);
  return entity;
});
const projection = {
  fixtureRevision: snapshot.fixtureRevision,
  entities,
  relationships: tracePath("pr-A1", "test-A1", snapshot),
};
const path = new URL("../supabase/functions/_shared/commerce/fixture.json", import.meta.url);
const content = JSON.stringify(projection, null, 2) + "\n";
if (Deno.args.includes("--check")) {
  if ((await Deno.readTextFile(path)).replace(/\r\n/g, "\n") !== content)
    throw new Error("Commerce evidence is stale. Run scripts/generate-commerce-fixture.ts.");
  console.log("Commerce evidence matches the canonical twin.");
} else {
  await Deno.writeTextFile(path, content);
}
