import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");
const FILTER_V2 = "20261008130000_moderation_filter_v2.sql";
const POLICY = "20261014100000_name_policy_self_harm_drugs_sexual_impersonation.sql";
const FOLD = "20261016100000_name_fold_more_lookalikes.sql";

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const CYR = { M: cp(0x41c), T: cp(0x422), K: cp(0x41a), H: cp(0x41d), B: cp(0x412), a: cp(0x430) };

/** Staff look-alikes that swap in a letter the old fold did not know. Each must be blocked after the migration. */
const EVASIONS = [
  `AD${CYR.M}IN`,
  `SUPPOR${CYR.T}`,
  `${CYR.M}OD`,
  `${cp(0x43c)}0d`,
  `${CYR.M}oderator`,
  `${CYR.a}${cp(0x501)}m${cp(0x456)}n`, // Cyrillic a, komi de, m, Cyrillic i, n
  `${cp(0x251)}dmin`, // Latin script a
  `off${cp(0x131)}c${cp(0x131)}al`, // dotless i
  `Alphonso ${CYR.H}elp`,
  `Alphonso ${CYR.B}ot`,
];

/**
 * Real names and words written in Cyrillic, chosen because they are made mostly of the letters this migration
 * folds. None may become blocked: a filter that rejects "Марк" or "Вера" is worse than the gap it closes.
 */
const REAL_CYRILLIC = [
  "Анна",
  "Мария",
  "Вера",
  "Марк",
  "Роман",
  "Антон",
  "Тома",
  "Макар",
  "Виктор",
  "Катя",
  "Настя",
  "Наташа",
  "Татьяна",
  "Светлана",
  "Оксана",
  "Тарас",
  "Максим",
  "Никита",
  "Иван",
  "Михаил",
  "Артем",
  "Матвей",
  "Тимур",
  "Карина",
  "Марина",
  "Ксения",
  "Вероника",
  "Варвара",
  "Константин",
  "Станислав",
  "Нестор",
  "Тихон",
  "Мирон",
  "Арсен",
  "Мама",
  "Кот",
  "Сом",
  "Вова",
  "Катерина",
  "Тамара",
  "Нонна",
  "Венера",
  "Мартин",
  "Ахмет",
  "Томас",
  "Хома",
  "Сева",
  "Вектор",
  "Монета",
];

async function database(withFold: boolean) {
  const db = new PGlite();
  await db.exec("CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;");
  await db.exec(read(FILTER_V2));
  await db.exec(read(POLICY));
  if (withFold) await db.exec(read(FOLD));
  return db;
}
const blocked = async (db: PGlite, name: string) =>
  (await db.query<{ b: boolean }>("SELECT public.name_policy_blocked($1) AS b", [name])).rows[0]!.b;

describe("look-alike letters in names", () => {
  let before: PGlite;
  let after: PGlite;
  beforeAll(async () => {
    [before, after] = await Promise.all([database(false), database(true)]);
  }, 180_000);
  afterAll(async () => {
    await Promise.all([before.close(), after.close()]);
  });

  it("sorts after the filter and the name policy it builds on", () => {
    expect(FILTER_V2 < FOLD && POLICY < FOLD).toBe(true);
  });

  it.each(EVASIONS)("blocks %s, which got through before", async (name) => {
    expect(await blocked(before, name)).toBe(false);
    expect(await blocked(after, name)).toBe(true);
  });

  it.each(REAL_CYRILLIC)("still allows the real name %s", async (name) => {
    expect(await blocked(after, name)).toBe(false);
  });

  it("changes no verdict for plain Latin names and for spellings it already caught", async () => {
    for (const name of ["Mark", "Vera", "Thomas", "Hector", "Alphonso Fan", "Kim", "Tom", "Beth"]) {
      expect(await blocked(after, name), name).toBe(await blocked(before, name));
    }
    for (const name of ["admin", "adm1n", "@dmin", "m0d3r4t0r", "0ff1c1al", "$upport"]) {
      expect(await blocked(before, name), name).toBe(true);
      expect(await blocked(after, name), name).toBe(true);
    }
  });

  it("keeps the function's shape: one replacement, search_path pinned, map strings the same length", () => {
    const sql = read(FOLD);
    expect(sql.match(/^CREATE OR REPLACE FUNCTION/gm)).toHaveLength(1);
    expect(sql).toContain("SET search_path = ''");
    // Letters are written as codepoints, never pasted: a look-alike in the source is unreviewable.
    expect(sql).not.toMatch(/[^\x20-\x7E\n]/);
    const from = 11 + (sql.match(/chr\(\d+\)/g) ?? []).length;
    const to = [...sql.matchAll(/'([a-z]+)'(?= \|\||\);)/g)].map((m) => m[1]).join("").length;
    expect(from).toBe(38);
    expect(to).toBe(38);
  });
});
