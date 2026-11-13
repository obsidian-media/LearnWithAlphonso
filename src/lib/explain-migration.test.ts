import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const U1 = "00000000-0000-4000-8000-000000000001";
const KEY = "a".repeat(64);
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261112100000_explain_in_my_language.sql"),
  "utf8",
);

describe("explain in my language migration (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U1}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
        count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, day, kind));
      CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
        count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, kind, minute_bucket));
    `);
    await db.exec(migration);
  });

  async function asRole(role: "authenticated" | "service_role", fn: () => Promise<void>) {
    await db.query("SELECT set_config('test.uid', $1, false)", [U1]);
    await db.exec(`SET ROLE ${role}`);
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  const insert = (key = KEY, extra = "") =>
    db.query(
      `INSERT INTO public.explanation_cache (cache_key, kind, course, native_language, explanation${extra ? ", " + extra.split("=")[0] : ""})
       VALUES ($1, 'word', 'en', 'fa', 'x'${extra ? ", " + extra.split("=")[1] : ""})`,
      [key],
    );

  it("a signed-in learner cannot read, write or delete the cache", async () => {
    await asRole("service_role", async () => void (await insert()));
    await asRole("authenticated", async () => {
      await expect(db.query("SELECT * FROM public.explanation_cache")).rejects.toThrow(
        /permission denied/,
      );
      await expect(insert("b".repeat(64))).rejects.toThrow(/permission denied/);
      await expect(db.query("DELETE FROM public.explanation_cache")).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("the server (service role) can write and read it", async () => {
    await asRole("service_role", async () => {
      await insert();
      const r = await db.query<{ explanation: string }>(
        "SELECT explanation FROM public.explanation_cache",
      );
      expect(r.rows[0]!.explanation).toBe("x");
    });
  });

  it("anon has no access either", async () => {
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM public.explanation_cache")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");
  });

  it("the key is a sha-256 hex, the language a short code, the text bounded", async () => {
    await asRole("service_role", async () => {
      await expect(insert("not-a-hash")).rejects.toThrow(/cache_key/);
      await expect(
        db.query(
          `INSERT INTO public.explanation_cache (cache_key, kind, course, native_language, explanation)
           VALUES ($1, 'word', 'en', 'Persian!', 'x')`,
          ["c".repeat(64)],
        ),
      ).rejects.toThrow(/native_language/);
      await expect(
        db.query(
          `INSERT INTO public.explanation_cache (cache_key, kind, course, native_language, explanation)
           VALUES ($1, 'essay', 'en', 'fa', 'x')`,
          ["d".repeat(64)],
        ),
      ).rejects.toThrow(/kind/);
      await expect(
        db.query(
          `INSERT INTO public.explanation_cache (cache_key, kind, course, native_language, explanation)
           VALUES ($1, 'word', 'en', 'fa', $2)`,
          ["e".repeat(64), "y".repeat(3000)],
        ),
      ).rejects.toThrow(/explanation/);
    });
  });

  it("the same key cannot be stored twice", async () => {
    await asRole("service_role", async () => {
      await insert();
      await expect(insert()).rejects.toThrow(/duplicate key/);
    });
  });

  it("'explain' has its own 40 a day: the 40th is allowed, the 41st is not", async () => {
    await asRole("authenticated", async () => {
      let last: { allowed: boolean; used: number; quota: number } | undefined;
      for (let i = 0; i < 40; i++) {
        last = (
          await db.query<{ allowed: boolean; used: number; quota: number }>(
            "SELECT * FROM public.consume_ai_quota('explain')",
          )
        ).rows[0];
      }
      expect(last).toEqual({ allowed: true, used: 40, quota: 40 });
      const over = (
        await db.query<{ allowed: boolean }>("SELECT * FROM public.consume_ai_quota('explain')")
      ).rows[0]!;
      expect(over.allowed).toBe(false);
      // Spending it never touches chat's budget.
      const chat = (
        await db.query<{ allowed: boolean; used: number }>(
          "SELECT * FROM public.consume_ai_quota('chat')",
        )
      ).rows[0]!;
      expect(chat).toMatchObject({ allowed: true, used: 1 });
    });
  });

  it("'explain' is limited to 10 a minute", async () => {
    await asRole("authenticated", async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 11; i++) {
        results.push(
          (
            await db.query<{ allowed: boolean }>(
              "SELECT * FROM public.consume_ai_rate_limit('explain')",
            )
          ).rows[0]!.allowed,
        );
      }
      expect(results.slice(0, 10).every(Boolean)).toBe(true);
      expect(results[10]).toBe(false);
    });
  });

  it("an unknown kind is still refused (the other kinds were restated, not dropped)", async () => {
    await asRole("authenticated", async () => {
      expect(
        (await db.query<{ allowed: boolean }>("SELECT * FROM public.consume_ai_quota('bogus')"))
          .rows[0]!.allowed,
      ).toBe(false);
      for (const [k, limit] of [
        ["chat", 60],
        ["stt", 120],
        ["tts", 80],
        ["translate", 60],
        ["define", 40],
        ["hector", 150],
      ] as const) {
        expect(
          (await db.query<{ quota: number }>("SELECT * FROM public.consume_ai_quota($1)", [k]))
            .rows[0]!.quota,
        ).toBe(limit);
      }
    });
  });
});
