import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const E_PUB = "10000000-0000-4000-8000-000000000001"; // 600 s, published
const E_DRAFT = "10000000-0000-4000-8000-000000000002";
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261107130000_listen_progress.sql"),
  "utf8",
);

describe("listen_progress (real Postgres, run as a seeded user)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      CREATE TABLE public.podcast_episodes (id uuid PRIMARY KEY, duration_seconds integer NOT NULL, published boolean NOT NULL);
      INSERT INTO public.podcast_episodes VALUES ('${E_PUB}', 600, true), ('${E_DRAFT}', 600, false);
    `);
    await db.exec(migration);
  });

  async function asUser(uid: string | null, fn: () => Promise<void>) {
    await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
    await db.exec("SET ROLE authenticated");
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  const save = (ep: string, pos: number | null) =>
    db.query<{ position_s: number; completed_at: string | null }>(
      "SELECT * FROM public.save_listen_progress($1::uuid, $2::integer)",
      [ep, pos],
    );

  it("clamps a position past the end to the duration and above-zero floor", async () => {
    await asUser(U1, async () => {
      expect((await save(E_PUB, 99999)).rows[0]!.position_s).toBe(600);
      expect((await save(E_PUB, -50)).rows[0]!.position_s).toBe(0);
    });
  });

  it("completion needs the end of the episode and never un-completes", async () => {
    await asUser(U1, async () => {
      expect((await save(E_PUB, 100)).rows[0]!.completed_at).toBeNull();
      expect((await save(E_PUB, 590)).rows[0]!.completed_at).not.toBeNull();
      expect((await save(E_PUB, 5)).rows[0]!.completed_at).not.toBeNull();
    });
  });

  it("refuses unknown and unpublished episodes, and null input", async () => {
    await asUser(U1, async () => {
      await expect(save("10000000-0000-4000-8000-0000000000ff", 5)).rejects.toThrow(
        /unknown episode/,
      );
      await expect(save(E_DRAFT, 5)).rejects.toThrow(/unknown episode/);
      await expect(save(E_PUB, null)).rejects.toThrow(/required/);
    });
  });

  it("an anonymous caller cannot write", async () => {
    await asUser(null, async () => {
      await expect(save(E_PUB, 5)).rejects.toThrow(/not authenticated/);
    });
  });

  it("a client cannot write the table directly, and only reads its own rows", async () => {
    await asUser(U1, async () => {
      await save(E_PUB, 120);
      await expect(
        db.query(
          "INSERT INTO public.listen_progress (user_id, episode_id, position_s) VALUES ($1, $2, 9)",
          [U2, E_PUB],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE public.listen_progress SET position_s = 1")).rejects.toThrow(
        /permission denied/,
      );
    });
    await asUser(U2, async () => {
      expect((await db.query("SELECT * FROM public.listen_progress")).rows).toHaveLength(0);
      await save(E_PUB, 30);
    });
    await asUser(U1, async () => {
      const r = await db.query<{ position_s: number }>(
        "SELECT position_s FROM public.listen_progress",
      );
      expect(r.rows).toEqual([{ position_s: 120 }]);
      await db.query("DELETE FROM public.listen_progress");
    });
    const left = await db.query<{ user_id: string }>("SELECT user_id FROM public.listen_progress");
    expect(left.rows).toEqual([{ user_id: U2 }]);
  });

  it("deleting the auth user cascades", async () => {
    await asUser(U1, async () => void (await save(E_PUB, 10)));
    await db.query("DELETE FROM auth.users WHERE id = $1", [U1]);
    expect((await db.query("SELECT 1 FROM public.listen_progress")).rows).toHaveLength(0);
  });

  it("anon has no privilege on the table or function", async () => {
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM public.listen_progress")).rejects.toThrow(
      /permission denied/,
    );
    await expect(save(E_PUB, 1)).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});
