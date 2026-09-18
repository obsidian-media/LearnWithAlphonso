/**
 * Seeds the curriculum-data tables (supabase/migrations/20260918120000_curriculum_data_tables.sql)
 * from the static curriculum.ts/etc. TS files, via buildFullSeed() in
 * src/lib/curriculum-seed.ts. Idempotent -- upserts by primary key, so
 * re-running after curriculum.ts changes just updates existing rows.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
 * (service role, since these tables have no INSERT/UPDATE policy for
 * anon/authenticated -- see the migration's RLS section). Points at
 * whatever SUPABASE_URL resolves to: a local `supabase start` instance,
 * or a real project if you've deliberately set that up. This script does
 * NOT default to or assume a production target.
 *
 * Usage: node_modules/.bin/tsx scripts/seed-curriculum-db.ts
 */
import { createClient } from "@supabase/supabase-js";
import { buildFullSeed } from "../src/lib/curriculum-seed";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CHUNK_SIZE = 500;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function upsertTable<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
) {
  if (rows.length === 0) {
    console.log(`${table}: 0 rows, skipping`);
    return;
  }
  let written = 0;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(
        `${table}: upsert failed on batch starting at row ${written}: ${error.message}`,
      );
    }
    written += batch.length;
  }
  console.log(`${table}: upserted ${written} rows`);
}

async function main() {
  const seed = buildFullSeed();

  // FK-safe order: levels -> units -> lessons -> questions; the rest have
  // no FK dependents so their order doesn't matter.
  await upsertTable("levels", seed.levels, "id");
  await upsertTable("units", seed.units, "id");
  await upsertTable("lessons", seed.lessons, "id");
  await upsertTable("questions", seed.questions, "lesson_id,id");
  await upsertTable("vocab_images", seed.vocabImages, "term");
  await upsertTable("placement_questions", seed.placementQuestions, "id");
  await upsertTable("scenarios", seed.scenarios, "id");

  console.log("Curriculum seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
