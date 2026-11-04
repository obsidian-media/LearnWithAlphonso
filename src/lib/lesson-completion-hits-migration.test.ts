import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261104100100_lesson_completion_hits.sql"),
  "utf8",
);
const NOW = Date.parse("2026-11-04T12:00:00Z");

describe("consume_lesson_completion_slot (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
    `);
    await db.exec(migration);
  });
  async function slot(user: string, atMs: number, limit = 60): Promise<boolean> {
    const r = await db.query<{ ok: boolean }>(
      "SELECT public.consume_lesson_completion_slot($1::uuid, $2::timestamptz, $3::integer) AS ok",
      [user, new Date(atMs).toISOString(), limit],
    );
    return r.rows[0]!.ok;
  }

  it("allows 60 completions in an hour and refuses the 61st, recording nothing for the refusal", async () => {
    for (let i = 0; i < 60; i++) expect(await slot(U1, NOW + i * 1000)).toBe(true);
    expect(await slot(U1, NOW + 61_000)).toBe(false);
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.lesson_completion_hits",
    );
    expect(n.rows[0]!.n).toBe(60);
  });

  it("is per user", async () => {
    for (let i = 0; i < 60; i++) await slot(U1, NOW + i * 1000);
    expect(await slot(U1, NOW + 70_000)).toBe(false);
    expect(await slot(U2, NOW + 70_000)).toBe(true);
  });

  it("is a rolling hour, not a calendar bucket: an hour later the user can go on", async () => {
    for (let i = 0; i < 60; i++) await slot(U1, NOW + i * 1000);
    expect(await slot(U1, NOW + 61 * 60_000)).toBe(true);
  });

  it("an offline queue replayed after reconnecting is not refused for arriving together", async () => {
    // 150 lessons played over a long offline stretch, 2 minutes apart (30 per hour), all synced in one burst,
    // so every call happens "now" but carries its own completion instant.
    for (let i = 0; i < 150; i++) {
      expect(await slot(U1, NOW - (150 - i) * 2 * 60_000)).toBe(true);
    }
  });

  it("a replay of the same dense burst at machine pace IS refused", async () => {
    // 90 lessons all claimed within the same minute is not a human offline session.
    let refused = 0;
    for (let i = 0; i < 90; i++) if (!(await slot(U1, NOW - i * 500))) refused++;
    expect(refused).toBe(30);
  });

  it("is service-role only", async () => {
    await db.exec("SET ROLE authenticated");
    await expect(slot(U1, NOW)).rejects.toThrow(/permission denied/);
  });
});
