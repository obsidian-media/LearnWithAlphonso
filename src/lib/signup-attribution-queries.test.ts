import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const doc = readFileSync(path.join(process.cwd(), "docs/attribution.md"), "utf8");
const queries = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]!);

const u = (n: number) => `00000000-0000-4000-8000-00000000${String(n).padStart(4, "0")}`;

describe("docs/attribution.md queries (real Postgres, seeded)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL);
      CREATE TABLE public.signup_attribution(user_id uuid PRIMARY KEY, utm_source text);
      CREATE TABLE public.activity_days(user_id uuid, day date, PRIMARY KEY(user_id, day));
      CREATE TABLE public.lesson_completions(user_id uuid, lesson_id text);
    `);
    // Cohort starts 20 days ago so every user is old enough for day 1 and day 7.
    const d0 = "current_date - 20";
    // 1,2: tagged "site"; 1 returns on day 1 and day 7, 2 never returns.
    // 3: tagged "r_testflight", returns on day 3 only (weekly return, not D1/D7).
    // 4: untagged, no activity.
    for (const n of [1, 2, 3, 4]) {
      await db.query(
        `INSERT INTO auth.users VALUES ($1, (${d0})::timestamptz + interval '12 hours')`,
        [u(n)],
      );
    }
    await db.query(
      "INSERT INTO public.signup_attribution VALUES ($1,'site'), ($2,'site'), ($3,'r_testflight')",
      [u(1), u(2), u(3)],
    );
    await db.query(
      `INSERT INTO public.activity_days VALUES ($1, ${d0}), ($1, ${d0} + 1), ($1, ${d0} + 7), ($2, ${d0} + 3)`,
      [u(1), u(3)],
    );
    await db.query("INSERT INTO public.lesson_completions VALUES ($1,'a'), ($2,'a')", [u(1), u(3)]);
    // A user from before the campaign must not appear.
    await db.query("INSERT INTO auth.users VALUES ($1, now() - interval '200 days')", [u(9)]);
    // The queries ship with a 2026-10-19 default start; move it so the seeded cohort is inside it.
  }, 120_000);
  afterAll(async () => {
    await db.close();
  });

  const run = (sql: string) =>
    db.query<Record<string, string | number>>(sql.replace("2026-10-19", "2000-01-01"));

  it("finds the three documented queries", () => {
    expect(queries).toHaveLength(3);
  });

  it("1. counts sign-ups by source, with untagged shown as (none)", async () => {
    const r = await run(queries[0]!);
    const by = Object.fromEntries(r.rows.map((x) => [x.source, Number(x.signups)]));
    expect(by).toMatchObject({ site: 2, r_testflight: 1 });
    expect(by["(none)"]).toBe(2); // user 4 and the pre-campaign user 9 (since moved to 2000-01-01)
  });

  it("2. counts a lesson, day-1 return and day-7 return per source", async () => {
    const r = await run(queries[1]!);
    const site = r.rows.find((x) => x.source === "site")!;
    expect(Number(site.signups)).toBe(2);
    expect(Number(site.finished_a_lesson)).toBe(1);
    expect(Number(site.old_enough_d1)).toBe(2);
    expect(Number(site.returned_d1)).toBe(1);
    expect(Number(site.returned_d7)).toBe(1);
    const tf = r.rows.find((x) => x.source === "r_testflight")!;
    expect(Number(tf.returned_d1)).toBe(0);
    expect(Number(tf.returned_d7)).toBe(0);
  });

  it("3. weekly return counts any activity in days 1 to 7", async () => {
    const r = await run(queries[2]!);
    const tf = r.rows.find((x) => x.source === "r_testflight")!;
    expect(Number(tf.returned_within_week)).toBe(1);
    const site = r.rows.find((x) => x.source === "site")!;
    expect(Number(site.returned_within_week)).toBe(1);
  });

  it("does not count a brand-new learner as a day-7 failure", async () => {
    await db.query("INSERT INTO auth.users VALUES ($1, now())", [u(20)]);
    const r = await run(queries[1]!);
    const none = r.rows.find((x) => x.source === "(none)")!;
    // user 20 signed up today: counted as a sign-up, but in neither old_enough bucket.
    expect(Number(none.signups)).toBe(Number(none.old_enough_d1) + 1);
  });
});
