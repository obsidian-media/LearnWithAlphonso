/**
 * Controlled reseed of public.vocab_images ONLY: the spec 3.5 freeze exception for this pipeline.
 * Never run scripts/seed-curriculum-db.ts during the freeze. OWNER-RUN (service role).
 * Dry run unless --apply.
 *   export SUPABASE_URL=https://qhcjpfbxfcltjbiuknyt.supabase.co
 *   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
 *   bun scripts/seed-vocab-images-db.ts            # prints the plan
 *   bun scripts/seed-vocab-images-db.ts --apply    # upserts, deletes stale rows, verifies
 */
import { createClient } from "@supabase/supabase-js";
import { buildVocabImageRows } from "../src/lib/curriculum-seed";
import { SUPABASE_PROJECT_ORIGIN } from "../src/lib/vocab-images/url-policy";
import { PAGE_SIZE, planVocabImageSync } from "../src/lib/vocab-images/db-sync";

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (values are never printed).",
  );
  process.exit(1);
}
if (url !== SUPABASE_PROJECT_ORIGIN) {
  console.error(
    `SUPABASE_URL must be ${SUPABASE_PROJECT_ORIGIN}: the recorded image URLs point there.`,
  );
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function existing(): Promise<{ terms: string[]; total: number }> {
  const head = await db.from("vocab_images").select("term", { count: "exact", head: true });
  if (head.error) throw new Error(`count: ${head.error.message}`);
  const terms: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("vocab_images")
      .select("term")
      .order("term")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`read: ${error.message}`);
    terms.push(...data.map((r: { term: string }) => r.term));
    if (data.length < PAGE_SIZE) break;
  }
  return { terms, total: head.count ?? -1 };
}

async function main() {
  console.log(`target: ${new URL(url!).host}${APPLY ? "" : " (dry run)"}`);
  const rows = buildVocabImageRows();
  const plan = planVocabImageSync(await existing(), rows);
  console.log(`upsert ${plan.upserts.length}, delete ${plan.deletes.length} stale row(s)`);
  if (!APPLY) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("vocab_images")
      .upsert(rows.slice(i, i + 500), { onConflict: "term" });
    if (error) throw new Error(`upsert at ${i}: ${error.message}`);
  }
  for (let i = 0; i < plan.deletes.length; i += 200) {
    const { error } = await db
      .from("vocab_images")
      .delete()
      .in("term", plan.deletes.slice(i, i + 200));
    if (error) throw new Error(`delete at ${i}: ${error.message}`);
  }
  const after = await existing();
  const dead = await db
    .from("vocab_images")
    .select("term", { count: "exact", head: true })
    .like("url", "%pixabay.com/get%");
  console.log(
    `after: ${after.total} rows (expected ${rows.length}); pixabay /get rows: ${dead.count}`,
  );
  if (after.total !== rows.length || dead.count !== 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
