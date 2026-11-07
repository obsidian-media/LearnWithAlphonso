import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Profile data (20261107120000), EXECUTED in a real Postgres (PGlite) as seeded users: learning minutes, mastered
 * words, time zone, skills, league standing. Dates come from the database's own clock.
 */
const FILE = "20261107120000_profile_data.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const U3 = "00000000-0000-4000-8000-000000000003";
const U4 = "00000000-0000-4000-8000-000000000004";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ('${U1}'), ('${U2}'), ('${U3}'), ('${U4}');
    CREATE TABLE public.review_items(
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
      item_key text NOT NULL, language text NOT NULL, source text,
      weakness_label text, due_on date NOT NULL,
      last_reviewed_at timestamptz, ease real, interval_days integer, repetitions integer, lapses integer
    );
    CREATE TABLE public.weakness_events(user_id uuid NOT NULL, category text NOT NULL, event_type text NOT NULL);
    CREATE TABLE public.review_grade_attempts(
      user_id uuid NOT NULL, attempt_id text NOT NULL, item_key text NOT NULL, language text NOT NULL,
      result jsonb NOT NULL, PRIMARY KEY (user_id, attempt_id));
    CREATE TABLE public.language_progress(
      user_id uuid NOT NULL, language text NOT NULL, league_tier text NOT NULL DEFAULT 'bronze',
      PRIMARY KEY (user_id, language));
    CREATE TABLE public.weekly_xp_totals(user_id uuid NOT NULL, week_start date NOT NULL, xp integer NOT NULL,
      PRIMARY KEY (user_id, week_start));
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(sqlText);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asServer = async <T>(fn: () => Promise<T>) => {
  await db.exec("SET ROLE service_role");
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
};
const asClient = async <T>(uid: string, fn: () => Promise<T>, role = "authenticated") => {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const dbToday = async () =>
  (await db.query<{ d: string }>("SELECT (now() AT TIME ZONE 'UTC')::date::text AS d")).rows[0]!.d;
const rejects = (p: Promise<unknown>, code = "22023") =>
  expect(p).rejects.toMatchObject({ code: expect.stringMatching(new RegExp(`^${code}$`)) });

describe("learning_days", () => {
  it("adds lesson and practice seconds to the UTC day and clamps one call at an hour each", async () => {
    const today = await dbToday();
    const add = (l: number, p: number) =>
      db.query<{ d: string }>("SELECT public.add_learning_seconds($1,$2,$3)::text AS d", [
        U1,
        l,
        p,
      ]);
    await asServer(async () => {
      expect((await add(120, 0)).rows[0]!.d).toBe(today);
      await add(30, 45);
      await rejects(add(3601, 0));
      await rejects(add(0, 3601));
      await rejects(add(-1, 0));
    });
    const { rows } = await db.query<{ l: number; p: number }>(
      "SELECT lesson_seconds l, practice_seconds p FROM public.learning_days WHERE user_id=$1 AND day=$2::date",
      [U1, today],
    );
    expect(rows[0]).toEqual({ l: 150, p: 45 });
  });
  it("a client cannot call or write it, and reads only its own rows", async () => {
    await asClient(U2, () =>
      rejects(db.query("SELECT public.add_learning_seconds($1,9999,0)", [U2]), "42501"),
    );
    await asClient(U2, () =>
      rejects(
        db.query(
          "INSERT INTO public.learning_days(user_id,day,lesson_seconds) VALUES ($1,current_date,1)",
          [U2],
        ),
        "42501",
      ),
    );
    await asClient(U2, () =>
      rejects(db.query("UPDATE public.learning_days SET lesson_seconds = 0"), "42501"),
    );
    await asClient(
      U2,
      () => rejects(db.query("SELECT public.add_learning_seconds($1,1,1)", [U2]), "42501"),
      "anon",
    );
    expect(
      (await asClient(U2, () => db.query("SELECT * FROM public.learning_days"))).rows,
    ).toHaveLength(0);
    expect(
      (await asClient(U1, () => db.query("SELECT * FROM public.learning_days"))).rows,
    ).toHaveLength(1);
  });
});

describe("mastered words", () => {
  const grade = (key: string, retired: boolean) =>
    db.query<{ r: { status: string } }>(
      `SELECT public.apply_review_grade($1::uuid,$2,'en',NULL,NULL,current_date,$3,true,current_date,2.5,3,3,0) AS r`,
      [U1, key, retired],
    );
  it("keeps a retired saved word as mastered, still deletes it from review, and counts it once", async () => {
    await db.query(
      `INSERT INTO public.review_items(id,user_id,item_key,language,source,due_on) VALUES
       (gen_random_uuid(),$1,'saved:hello','en','saved_word',current_date),
       (gen_random_uuid(),$1,'saved:keep','en','saved_word',current_date),
       (gen_random_uuid(),$1,'lesson:x','en','lesson',current_date)`,
      [U1],
    );
    await asServer(async () => {
      expect((await grade("saved:hello", true)).rows[0]!.r.status).toBe("applied");
      await grade("saved:keep", false); // answered but not retired: not mastered
      await grade("lesson:x", true); // a lesson item is not a saved word
    });
    const left = await db.query<{ item_key: string }>(
      "SELECT item_key FROM public.review_items ORDER BY 1",
    );
    expect(left.rows.map((r) => r.item_key)).toEqual(["saved:keep"]);
    const m = await db.query<{ item_key: string }>("SELECT item_key FROM public.mastered_words");
    expect(m.rows.map((r) => r.item_key)).toEqual(["saved:hello"]);
    // saved and mastered again: still one marker
    await db.query(
      `INSERT INTO public.review_items(id,user_id,item_key,language,source,due_on)
       VALUES (gen_random_uuid(),$1,'saved:hello','en','saved_word',current_date)`,
      [U1],
    );
    await asServer(() => grade("saved:hello", true));
    expect((await db.query("SELECT 1 FROM public.mastered_words")).rows).toHaveLength(1);
  });
  it("is read-only for clients", async () => {
    await asClient(U1, () => rejects(db.query("DELETE FROM public.mastered_words"), "42501"));
    expect(
      (await asClient(U2, () => db.query("SELECT * FROM public.mastered_words"))).rows,
    ).toHaveLength(0);
  });
});

describe("time zone", () => {
  const set = (u: string, tz: string | null) =>
    db.query("SELECT public.set_learner_time_zone($1,$2)", [u, tz]);
  it("stores a real IANA name, replaces it, and refuses anything else", async () => {
    await asServer(async () => {
      await set(U1, "Europe/Paris");
      await set(U1, "America/Toronto");
      await rejects(set(U1, "Mars/Olympus"));
      await rejects(set(U1, "x".repeat(65)));
      await rejects(set(U1, null));
    });
    const { rows } = await db.query<{ time_zone: string }>(
      "SELECT time_zone FROM public.learner_time_zones WHERE user_id=$1",
      [U1],
    );
    expect(rows).toEqual([{ time_zone: "America/Toronto" }]);
    await asClient(U1, () => rejects(set(U1, "Europe/Paris"), "42501"));
  });
});

describe("skill_days", () => {
  const add = (u: string, results: unknown) =>
    db.query<{ n: number }>("SELECT public.add_skill_results($1,$2::jsonb) AS n", [
      u,
      JSON.stringify(results),
    ]);
  it("adds right and total per skill per day", async () => {
    await asServer(async () => {
      expect(
        (
          await add(U1, [
            { skill: "listening", right: 3, total: 4 },
            { skill: "grammar", right: 1, total: 1 },
          ])
        ).rows[0]!.n,
      ).toBe(2);
      await add(U1, [{ skill: "listening", right: 1, total: 2 }]);
    });
    const { rows } = await db.query<{ skill: string; r: number; t: number }>(
      "SELECT skill, right_answers r, total_answers t FROM public.skill_days WHERE user_id=$1 ORDER BY skill",
      [U1],
    );
    expect(rows).toEqual([
      { skill: "grammar", r: 1, t: 1 },
      { skill: "listening", r: 4, t: 6 },
    ]);
  });
  it("refuses forged or malformed results and writes nothing from a bad batch", async () => {
    await asServer(async () => {
      await rejects(add(U1, [{ skill: "listening", right: 5, total: 4 }]));
      await rejects(add(U1, [{ skill: "listening", right: 0, total: 201 }]));
      await rejects(add(U1, [{ skill: "dancing", right: 1, total: 1 }]));
      await rejects(add(U1, [{ skill: "reading", right: -1, total: 1 }]));
      await rejects(add(U1, [{ skill: "reading", right: 1.5, total: 2 }]));
      await rejects(
        add(U1, [
          { skill: "reading", right: 1, total: 1 },
          { skill: "reading", right: 1, total: 1 },
        ]),
      );
      await rejects(
        add(U1, [
          { skill: "reading", right: 1, total: 1 },
          { skill: "bad", right: 1, total: 1 },
        ]),
      );
      await rejects(add(U1, { skill: "reading" }));
    });
    const { rows } = await db.query("SELECT 1 FROM public.skill_days WHERE skill = 'reading'");
    expect(rows).toHaveLength(0);
    await asClient(U1, () =>
      rejects(
        db.query(
          "INSERT INTO public.skill_days(user_id,day,skill,right_answers,total_answers) VALUES ($1,current_date,'reading',9,9)",
          [U1],
        ),
        "42501",
      ),
    );
    await asClient(U1, () => rejects(add(U1, [{ skill: "reading", right: 9, total: 9 }]), "42501"));
  });
});

describe("get_my_league_standing", () => {
  it("ranks the caller among same-tier learners of this week, with ties sharing rank and the week's end", async () => {
    const wk = (
      await db.query<{ w: string }>(
        "SELECT ((now() AT TIME ZONE 'UTC')::date - (extract(isodow FROM (now() AT TIME ZONE 'UTC')::date)::int - 1))::text AS w",
      )
    ).rows[0]!.w;
    await db.query(
      `INSERT INTO public.language_progress(user_id,language,league_tier) VALUES
       ($1,'en','silver'),($2,'en','silver'),($3,'en','silver'),($4,'en','gold'),($1,'fr','bronze')`,
      [U1, U2, U3, U4],
    );
    await db.query(
      `INSERT INTO public.weekly_xp_totals VALUES
       ($1,$5::date,50),($2,$5::date,120),($3,$5::date,50),($4,$5::date,900),($2,($5::date - 7),9999)`,
      [U1, U2, U3, U4, wk],
    );
    const standing = (u: string, course = "en") =>
      asClient(u, () =>
        db.query<{
          league_tier: string;
          rank: number;
          size: number;
          week_start: string;
          week_end: string;
          week_xp: number;
        }>(
          "SELECT league_tier, rank, size, week_start::text, week_end::text, week_xp FROM public.get_my_league_standing($1)",
          [course],
        ),
      );
    const me = (await standing(U1)).rows[0]!;
    expect(me).toMatchObject({
      league_tier: "silver",
      rank: 2,
      size: 3,
      week_start: wk,
      week_xp: 50,
    });
    expect(me.week_end).toBe(
      (await db.query<{ e: string }>("SELECT ($1::date + 6)::text AS e", [wk])).rows[0]!.e,
    );
    expect((await standing(U3)).rows[0]).toMatchObject({ rank: 2, size: 3 }); // tie with U1
    expect((await standing(U2)).rows[0]).toMatchObject({ rank: 1, size: 3 }); // last week's XP does not count
    expect((await standing(U4)).rows[0]).toMatchObject({ league_tier: "gold", rank: 1, size: 1 });
    expect((await standing(U1, "fr")).rows[0]).toMatchObject({ rank: 1, size: 1 }); // a different course
    expect((await standing(U1, "es")).rows).toHaveLength(0);
    // a learner with no XP this week is last in a league of the active ones
    await db.query("DELETE FROM public.weekly_xp_totals WHERE user_id = $1", [U1]);
    expect((await standing(U1)).rows[0]).toMatchObject({ rank: 3, size: 3, week_xp: 0 });
    // no caller, no standing; anon cannot call it
    expect((await db.query("SELECT * FROM public.get_my_league_standing('en')")).rows).toHaveLength(
      0,
    );
    await asClient(
      U1,
      () => rejects(db.query("SELECT * FROM public.get_my_league_standing('en')"), "42501"),
      "anon",
    );
  });
});

describe("privileges (the grant itself, not only the row policy that would also refuse)", () => {
  const tables = ["learning_days", "mastered_words", "learner_time_zones", "skill_days"];
  it("clients hold SELECT only on the new tables; anon holds nothing", async () => {
    for (const t of tables) {
      for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          "SELECT has_table_privilege('authenticated', $1, $2) AS ok",
          [`public.${t}`, priv],
        );
        expect(rows[0]!.ok, `${t} ${priv}`).toBe(false);
      }
      const sel = await db.query<{ a: boolean; n: boolean }>(
        "SELECT has_table_privilege('authenticated', $1, 'SELECT') a, has_table_privilege('anon', $1, 'SELECT') n",
        [`public.${t}`],
      );
      expect(sel.rows[0]).toEqual({ a: true, n: false });
    }
  });
  it("the write functions are executable by service_role only", async () => {
    const fns = [
      "add_learning_seconds(uuid, integer, integer)",
      "add_skill_results(uuid, jsonb)",
      "set_learner_time_zone(uuid, text)",
      "apply_review_grade(uuid,text,text,text,timestamptz,date,boolean,boolean,date,real,integer,integer,integer)",
    ];
    for (const f of fns) {
      const { rows } = await db.query<{ s: boolean; a: boolean; n: boolean }>(
        `SELECT has_function_privilege('service_role', $1, 'EXECUTE') s,
                has_function_privilege('authenticated', $1, 'EXECUTE') a,
                has_function_privilege('anon', $1, 'EXECUTE') n`,
        [`public.${f}`],
      );
      expect(rows[0], f).toEqual({ s: true, a: false, n: false });
    }
  });
});

describe("accounts", () => {
  it("deleting the account removes every new row", async () => {
    await db.query("DELETE FROM public.review_items WHERE user_id=$1", [U1]);
    await db.query("DELETE FROM auth.users WHERE id=$1", [U1]);
    for (const t of ["learning_days", "mastered_words", "learner_time_zones", "skill_days"]) {
      expect(
        (await db.query(`SELECT 1 FROM public.${t} WHERE user_id=$1`, [U1])).rows,
        t,
      ).toHaveLength(0);
    }
  });
});
