import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");
const FILTER_V2 = "20261008130000_moderation_filter_v2.sql";
const POLICY = "20261014100000_name_policy_self_harm_drugs_sexual_impersonation.sql";
const FOLD = "20261016100000_name_fold_more_lookalikes.sql";
const SLANG = "20261018100000_name_policy_slang_terms.sql";
/** The newest migration on main when this was written; SLANG must sort after it. */
const MAIN_MAX_AT_AUTHORING = "20261017100000_revenuecat_erasure_pending.sql";

/** Slang spellings, with the digit swaps and spacing the fold already undoes. Each must be blocked after. */
const SLANG_NAMES = ["noods", "n00ds", "NOODS", "n o o d s", "pron", "pr0n", "PRON", "Pron Star"];

/** Real names and words that contain the new terms. A whole-word list must leave every one of them alone. */
const STILL_ALLOWED = ["Noodle", "Nood", "Noodles Fan", "Pronto", "Pronoun", "Apron", "Pronk", "Prona", "Leo", "Hector"];

async function database(withSlang: boolean) {
  const db = new PGlite();
  await db.exec("CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;");
  await db.exec(read(FILTER_V2));
  await db.exec(read(POLICY));
  await db.exec(read(FOLD));
  if (withSlang) await db.exec(read(SLANG));
  return db;
}
const blocked = async (db: PGlite, name: string) =>
  (await db.query<{ b: boolean }>("SELECT public.name_policy_blocked($1) AS b", [name])).rows[0]!.b;
const terms = async (db: PGlite) =>
  (await db.query<{ t: string[] }>("SELECT public.name_policy_terms() AS t")).rows[0]!.t;

describe("slang spellings in names", () => {
  let before: PGlite;
  let after: PGlite;
  beforeAll(async () => {
    [before, after] = await Promise.all([database(false), database(true)]);
  }, 180_000);
  afterAll(async () => {
    await Promise.all([before.close(), after.close()]);
  });

  it("sorts after main's newest at authoring and after the migrations it builds on, with a unique version", () => {
    const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
    expect(all).toContain(SLANG);
    expect(SLANG > MAIN_MAX_AT_AUTHORING && SLANG > POLICY && SLANG > FOLD).toBe(true);
    expect(all.filter((f) => f.slice(0, 14) === SLANG.slice(0, 14))).toHaveLength(1);
  });

  it.each(SLANG_NAMES)("blocks %s, which got through before", async (name) => {
    expect(await blocked(before, name)).toBe(false);
    expect(await blocked(after, name)).toBe(true);
  });

  it.each(STILL_ALLOWED)("still allows %s", async (name) => {
    expect(await blocked(after, name)).toBe(false);
  });

  it("is the previous list plus exactly the two new words, so nothing was dropped", async () => {
    const was = await terms(before);
    const now = await terms(after);
    expect(now.slice(0, was.length)).toEqual(was);
    expect(now.slice(was.length)).toEqual(["noods", "pron"]);
  });

  it("replaces only the word list, pins search_path, stays ASCII and has a rollback", () => {
    const sql = read(SLANG);
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1])).toEqual([
      "name_policy_terms",
    ]);
    expect(sql).toContain("SET search_path = ''");
    expect(sql).not.toMatch(/GRANT /);
    expect(sql).not.toMatch(/[^\x20-\x7E\n]/);
    expect(sql).toMatch(/Rollback/);
  });
});
