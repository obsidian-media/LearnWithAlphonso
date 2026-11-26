import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DAILY_LIMITS } from "./ai-quota.server";

/**
 * The call recap migration (20261119100000), EXECUTED in a real Postgres (PGlite) as seeded users: who can read and
 * delete memory, that only the server writes it, that a delete removes the matching events and review items, that
 * "forget everything" keeps lessons / stars / saved words, that a recap is claimed once, and every quota limit.
 */
const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261119100000_call_recap_memory.sql"),
  "utf8",
);

const RETRY_MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261128150000_call_recap_retryable_claim.sql"),
  "utf8",
);

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const CALL = "00000000-0000-4000-8000-0000000000c1";
const CALL2 = "00000000-0000-4000-8000-0000000000c2";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}');
    CREATE TABLE public.practice_calls (id uuid PRIMARY KEY, user_id uuid NOT NULL, finished_at timestamptz);
    CREATE TABLE public.weakness_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      category text NOT NULL, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.review_items (user_id uuid NOT NULL, item_key text NOT NULL, language text NOT NULL DEFAULT 'en',
      source text NOT NULL DEFAULT 'lesson', weakness_label text, PRIMARY KEY (user_id, item_key, language));
    CREATE TABLE public.practice_stars (user_id uuid NOT NULL, item_key text NOT NULL, best_stars int NOT NULL);
    CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day, kind));
    CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, minute_bucket));
    INSERT INTO public.practice_calls VALUES ('${CALL}', '${A}', now()), ('${CALL2}', '${A}', NULL);
  `);
  await db.exec(MIGRATION);
  await db.exec(RETRY_MIGRATION);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>, uid = "") => {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => asRole("authenticated", fn, uid);
const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);
const mistakes = (...topics: string[]) =>
  JSON.stringify(topics.map((t) => ({ topic: t, text: `said ${t} -> fixed ${t}` })));
const remember = (user: string, call: string, topics: string[], save: boolean) =>
  server(() =>
    db.query(
      `SELECT public.remember_call_recap('${user}', 'es', '${call}', $1::text[], $2::jsonb, ${save})`,
      [`{${topics.join(",")}}`, mistakes(...topics)],
    ),
  );

describe("claim_call_recap", () => {
  it("claims a finished call once, never an unfinished or foreign one", async () => {
    const claim = (u: string, c: string) =>
      server(
        async () =>
          (await db.query<{ r: boolean }>(`SELECT public.claim_call_recap('${u}', '${c}') r`))
            .rows[0]!.r,
      );
    expect(await claim(A, CALL2)).toBe(false); // not finished
    expect(await claim(B, CALL)).toBe(false); // someone else's
    expect(await claim(A, CALL)).toBe(true);
    expect(await claim(A, CALL)).toBe(false); // already claimed
  });

  it("is not callable by a signed-in learner", async () => {
    await expect(
      asUser(A, () => db.query(`SELECT public.claim_call_recap('${A}', '${CALL}')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("what a learner can touch in tutor_memory", () => {
  it("cannot insert or update; the server writes", async () => {
    await expect(
      asUser(A, () =>
        db.query(
          `INSERT INTO public.tutor_memory (user_id, course, kind, memory_key, text) VALUES ('${A}','es','mistake','x','y')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () => db.query(`UPDATE public.tutor_memory SET text = 'z'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("anon has no access at all", async () => {
    await expect(
      asRole("anon", () => db.query("SELECT * FROM public.tutor_memory")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("remember_call_recap", () => {
  it("a free learner (_save false) gets weakness events and no memory lines", async () => {
    await remember(B, CALL2, ["ser-estar"], false);
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE user_id = '${B}'`)).toBe(
      0,
    );
    expect(
      await n(`SELECT count(*)::text n FROM public.weakness_events WHERE user_id = '${B}'`),
    ).toBe(1);
  });

  it("a Pro learner's mistakes are one line per topic, counted per call", async () => {
    await remember(A, CALL, ["ser-estar", "por-para"], true);
    await remember(A, CALL, ["ser-estar"], true); // same call again: no extra count
    await remember(A, CALL2, ["ser-estar"], true); // a new call: counted
    const rows = (
      await db.query<{ memory_key: string; seen_count: number }>(
        `SELECT memory_key, seen_count FROM public.tutor_memory WHERE user_id = '${A}' AND kind = 'mistake' ORDER BY memory_key`,
      )
    ).rows;
    expect(rows).toEqual([
      { memory_key: "por-para", seen_count: 1 },
      { memory_key: "ser-estar", seen_count: 2 },
    ]);
  });

  it("an owner reads their own lines and only theirs", async () => {
    expect((await asUser(A, () => db.query("SELECT 1 FROM public.tutor_memory"))).rows.length).toBe(
      2,
    );
    expect((await asUser(B, () => db.query("SELECT 1 FROM public.tutor_memory"))).rows.length).toBe(
      0,
    );
  });

  it("an owner cannot delete someone else's line, can delete their own", async () => {
    const id = (
      await db.query<{ id: string }>(
        `SELECT id FROM public.tutor_memory WHERE user_id = '${A}' LIMIT 1`,
      )
    ).rows[0]!.id;
    await asUser(B, () => db.query(`DELETE FROM public.tutor_memory WHERE id = '${id}'`));
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE id = '${id}'`)).toBe(1);
    await asUser(A, () => db.query(`DELETE FROM public.tutor_memory WHERE id = '${id}'`));
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE id = '${id}'`)).toBe(0);
    await remember(A, CALL, ["ser-estar", "por-para"], true); // restore the line for the next tests
  });
});

describe("delete paths", () => {
  it("deleting a mistake line removes its events and weakness review items, keeps the rest", async () => {
    await db.exec(`
      INSERT INTO public.review_items (user_id, item_key, language, source, weakness_label) VALUES
        ('${A}', 'recap:aaa', 'es', 'weakness', 'ser-estar'),
        ('${A}', 'recap:bbb', 'es', 'weakness', 'por-para'),
        ('${A}', 'weakness:lessonx', 'es', 'weakness', 'ser-estar'),
        ('${A}', 'savedword:hola', 'es', 'saved_word', NULL),
        ('${A}', 'l1:q1', 'es', 'lesson', NULL);
      INSERT INTO public.practice_stars VALUES ('${A}', 'item', 3);
    `);
    const id = (
      await db.query<{ id: string }>(
        `SELECT id FROM public.tutor_memory WHERE user_id = '${A}' AND memory_key = 'ser-estar'`,
      )
    ).rows[0]!.id;
    const out = await server(
      async () =>
        (
          await db.query<{ r: Record<string, number> }>(
            `SELECT public.delete_tutor_memory_line('${A}', '${id}') r`,
          )
        ).rows[0]!.r,
    );
    expect(out.memory).toBe(1);
    expect(out.review).toBe(1);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.weakness_events WHERE user_id='${A}' AND category='ser-estar'`,
      ),
    ).toBe(0);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.weakness_events WHERE user_id='${A}' AND category='por-para'`,
      ),
    ).toBeGreaterThan(0);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.review_items WHERE user_id='${A}' AND weakness_label='por-para'`,
      ),
    ).toBe(1);
    // a weak spot found in a lesson, same topic, stays
    expect(
      await n(`SELECT count(*)::text n FROM public.review_items WHERE item_key='weakness:lessonx'`),
    ).toBe(1);
  });

  it("refuses another learner's line", async () => {
    const id = (
      await db.query<{ id: string }>(
        `SELECT id FROM public.tutor_memory WHERE user_id = '${A}' LIMIT 1`,
      )
    ).rows[0]!.id;
    const out = await server(
      async () =>
        (
          await db.query<{ r: Record<string, number> }>(
            `SELECT public.delete_tutor_memory_line('${B}', '${id}') r`,
          )
        ).rows[0]!.r,
    );
    expect(out).toEqual({ memory: 0, events: 0, review: 0 });
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE id='${id}'`)).toBe(1);
  });

  it("a phrase line deletes the review item it added", async () => {
    await server(() =>
      db.query(
        `SELECT public.remember_recap_phrase('${A}', 'es', '${CALL}', '¿Me trae la cuenta?', 'Could you bring me the bill?', 'recap:ccc')`,
      ),
    );
    await db.exec(
      `INSERT INTO public.review_items (user_id, item_key, language, source) VALUES ('${A}', 'recap:ccc', 'es', 'saved_word')`,
    );
    const id = (
      await db.query<{ id: string }>(`SELECT id FROM public.tutor_memory WHERE kind = 'phrase'`)
    ).rows[0]!.id;
    await server(() => db.query(`SELECT public.delete_tutor_memory_line('${A}', '${id}')`));
    expect(
      await n(`SELECT count(*)::text n FROM public.review_items WHERE item_key = 'recap:ccc'`),
    ).toBe(0);
    expect(
      await n(`SELECT count(*)::text n FROM public.review_items WHERE item_key = 'savedword:hola'`),
    ).toBe(1);
  });

  it("forget everything deletes memory, events and weakness items, and keeps lessons, stars and saved words", async () => {
    await server(() =>
      db.query(
        `SELECT public.remember_recap_phrase('${A}', 'es', '${CALL}', 'Quisiera un café', 'I would like a coffee', 'recap:ddd')`,
      ),
    );
    await db.exec(
      `INSERT INTO public.review_items (user_id, item_key, language, source) VALUES ('${A}', 'recap:ddd', 'es', 'saved_word')`,
    );
    await remember(B, CALL2, ["word-order"], true); // another learner's line must survive
    await server(() => db.query(`SELECT public.forget_tutor_memory('${A}')`));
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE user_id='${A}'`)).toBe(
      0,
    );
    expect(
      await n(`SELECT count(*)::text n FROM public.weakness_events WHERE user_id='${A}'`),
    ).toBe(0);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.review_items WHERE user_id='${A}' AND item_key LIKE 'recap:%'`,
      ),
    ).toBe(0);
    // lesson-made weak spots and their progress stay
    expect(
      await n(`SELECT count(*)::text n FROM public.review_items WHERE item_key='weakness:lessonx'`),
    ).toBe(1);
    expect(
      await n(`SELECT count(*)::text n FROM public.review_items WHERE item_key='recap:ddd'`),
    ).toBe(0);
    // kept
    expect(
      await n(
        `SELECT count(*)::text n FROM public.review_items WHERE item_key IN ('savedword:hola','l1:q1')`,
      ),
    ).toBe(2);
    expect(await n(`SELECT count(*)::text n FROM public.practice_stars WHERE user_id='${A}'`)).toBe(
      1,
    );
    expect(
      await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE user_id='${B}'`),
    ).toBeGreaterThan(0);
    expect(
      await n(`SELECT count(*)::text n FROM public.weakness_events WHERE user_id='${B}'`),
    ).toBeGreaterThan(0);
  });

  it("neither function is callable by a signed-in learner", async () => {
    await expect(
      asUser(A, () => db.query(`SELECT public.forget_tutor_memory('${A}')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () => db.query(`SELECT public.delete_tutor_memory_line('${A}', '${CALL}')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("account deletion", () => {
  it("cascades from auth.users", async () => {
    await db.exec("DELETE FROM auth.users WHERE id = '" + B + "'");
    expect(await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE user_id='${B}'`)).toBe(
      0,
    );
  });
});

describe("the recap quota kind", () => {
  it("is 30 a day and 5 a minute, matching DAILY_LIMITS", async () => {
    expect(DAILY_LIMITS.recap).toBe(30);
    const quota = await asUser(
      A,
      async () =>
        (
          await db.query<{ allowed: boolean; quota: number }>(
            "SELECT * FROM public.consume_ai_quota('recap')",
          )
        ).rows[0]!,
    );
    expect(quota).toMatchObject({ allowed: true, quota: 30 });
    let last = true;
    for (let i = 0; i < 6; i++) {
      last = await asUser(
        A,
        async () =>
          (
            await db.query<{ allowed: boolean }>(
              "SELECT * FROM public.consume_ai_rate_limit('recap')",
            )
          ).rows[0]!.allowed,
      );
    }
    expect(last).toBe(false);
  });

  it("restates every older limit unchanged", async () => {
    const expected: Record<string, number> = {
      chat: 60,
      stt: 120,
      tts: 80,
      translate: 60,
      define: 40,
      hector: 150,
      explain: 40,
      support: 30,
    };
    for (const [kind, limit] of Object.entries(expected)) {
      const q = await asUser(
        A,
        async () =>
          (await db.query<{ quota: number }>(`SELECT * FROM public.consume_ai_quota('${kind}')`))
            .rows[0]!.quota,
      );
      expect(q).toBe(limit);
      expect(DAILY_LIMITS[kind as keyof typeof DAILY_LIMITS]).toBe(limit);
    }
  });
});

describe("a failed recap attempt does not consume the call (20261128150000)", () => {
  const CALL3 = "00000000-0000-4000-8000-0000000000c3";
  const CALL4 = "00000000-0000-4000-8000-0000000000c4";
  const q = async (sql: string) => (await server(() => db.query<{ r: unknown }>(sql))).rows[0]!.r;
  const claim = (id = CALL3) => q(`SELECT public.claim_call_recap('${A}', '${id}') r`);
  const finish = (topics: string[]) =>
    server(
      async () =>
        (
          await db.query<{ r: number }>(
            `SELECT public.finish_call_recap('${A}', 'es', '${CALL3}', $1::text[], $2::jsonb, true) r`,
            [`{${topics.join(",")}}`, mistakes(...topics)],
          )
        ).rows[0]!.r,
    );
  const completed = (id: string) =>
    n(
      `SELECT count(*)::text n FROM public.practice_calls WHERE id = '${id}' AND recap_at IS NOT NULL`,
    );
  const events = (cat: string) =>
    n(
      `SELECT count(*)::text n FROM public.weakness_events WHERE user_id = '${A}' AND category = '${cat}'`,
    );

  it("an open claim blocks a second, a release re-opens it, and an expired lease re-opens it", async () => {
    await db.exec(
      `INSERT INTO public.practice_calls (id, user_id, finished_at) VALUES ('${CALL3}', '${A}', now()), ('${CALL4}', '${A}', now())`,
    );
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false); // lease still held
    await server(() => db.query(`SELECT public.release_call_recap('${A}', '${CALL3}')`));
    expect(await claim()).toBe(true); // released: a retry may go
    await db.exec(
      `UPDATE public.practice_calls SET recap_claimed_at = now() - interval '3 minutes' WHERE id = '${CALL3}'`,
    );
    expect(await claim()).toBe(true); // lease ran out
    expect(await completed(CALL3)).toBe(0); // claiming never marks it completed
  });

  it("only finish_call_recap completes the call, once, and writes the memory in the same step", async () => {
    expect(await finish(["tiempo"])).toBe(1);
    expect(await completed(CALL3)).toBe(1);
    expect(await events("tiempo")).toBe(1);
    // A second finish (a retry, another device) writes nothing and says so.
    expect(await finish(["tiempo"])).toBe(-1);
    expect(await events("tiempo")).toBe(1);
    // Once completed, neither claim nor release touches it.
    expect(await claim()).toBe(false);
    expect(await q(`SELECT public.release_call_recap('${A}', '${CALL3}') r`)).toBe(false);
  });

  it("a finish that fails part-way rolls back, so the call stays retryable", async () => {
    await expect(
      server(() =>
        db.query(
          `SELECT public.finish_call_recap('${A}', 'es', '${CALL4}', '{x}'::text[], '[{"topic":"x"}]'::jsonb, true)`,
        ),
      ),
    ).rejects.toThrow(); // tutor_memory.text is NOT NULL: the memory write fails after the event insert
    expect(await completed(CALL4)).toBe(0);
    expect(await events("x")).toBe(0);
    expect(await claim(CALL4)).toBe(true);
  });

  it("is not callable by a signed-in learner", async () => {
    await expect(
      asUser(A, () => db.query(`SELECT public.release_call_recap('${A}', '${CALL3}')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () =>
        db.query(`SELECT public.finish_call_recap('${A}', 'es', '${CALL3}', '{}', '[]', false)`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
