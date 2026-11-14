import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Help chat's tables and functions (20261117100000, 20261117100100), EXECUTED in a real Postgres (PGlite) as
 * seeded users: who can touch what, one live conversation per learner, the 7-day reopen rule, append-only messages,
 * the caps, and every AI quota limit (the restate-by-copy risk).
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const CHAT = read("20261117100000_support_chat.sql");
const QUOTA = read("20261117100100_support_quota_kind.sql");

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000c3";
const TABLES = ["support_conversations", "support_messages", "support_notes"] as const;
const LEARNER_FUNCTIONS = [
  "support_open_conversation",
  "support_add_learner_message",
  "support_add_ai_message",
  "support_handoff",
  "support_learner_view",
] as const;

let db: PGlite;
async function freshDb(): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}'), ('${STAFF}');
    CREATE TABLE public.app_switches (
      key text PRIMARY KEY CHECK (key IN ('ai', 'tutor')),
      enabled boolean NOT NULL DEFAULT true, note text, updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.app_switches (key) VALUES ('ai'), ('tutor');
    CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, day, kind));
    CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, minute_bucket));
  `);
  await d.exec(CHAT);
  await d.exec(QUOTA);
  return d;
}

beforeAll(async () => {
  db = await freshDb();
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
const count = async (table: string, where = "true") =>
  Number(
    (await db.query<{ n: string }>(`SELECT count(*)::text n FROM public.${table} WHERE ${where}`))
      .rows[0]!.n,
  );
const open = async (user: string, channel = "web") =>
  (
    await server(() =>
      db.query<{ id: string }>("SELECT public.support_open_conversation($1,$2) AS id", [
        user,
        channel,
      ]),
    )
  ).rows[0]!.id;
const say = (user: string, conv: string, body: string, clientId: string | null = null) =>
  server(() =>
    db.query<{ id: string }>("SELECT public.support_add_learner_message($1,$2,$3,$4) AS id", [
      user,
      conv,
      body,
      clientId,
    ]),
  );
const cid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function reset() {
  await db.exec(
    "DELETE FROM public.support_conversations; DELETE FROM public.ai_usage; DELETE FROM public.ai_rate_limits",
  );
}

describe("support chat migration: who can touch what", () => {
  it("applies cleanly (the three tables exist and are empty)", async () => {
    for (const t of TABLES) expect(await count(t)).toBe(0);
  });

  it("anon and authenticated have no privilege of any kind on the three tables", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const t of TABLES) {
        for (const sql of [
          `SELECT * FROM public.${t}`,
          `UPDATE public.${t} SET created_at = now()`,
          `DELETE FROM public.${t}`,
          `TRUNCATE public.${t}`,
        ]) {
          await asRole(
            role,
            () => expect(db.query(sql)).rejects.toMatchObject({ code: "42501" }),
            A,
          );
        }
      }
      await asRole(
        role,
        () =>
          expect(
            db.query(
              "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) VALUES (gen_random_uuid(), $1, 'staff', 'forged')",
              [A],
            ),
          ).rejects.toMatchObject({ code: "42501" }),
        A,
      );
    }
  });

  it("client roles cannot execute any support function", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(
        role,
        () =>
          expect(
            db.query("SELECT public.support_open_conversation($1,'web')", [B]),
          ).rejects.toMatchObject({ code: "42501" }),
        A,
      );
      await asRole(
        role,
        () =>
          expect(db.query("SELECT public.support_learner_view($1)", [B])).rejects.toMatchObject({
            code: "42501",
          }),
        A,
      );
    }
  });

  it("even the service role can only read the tables: no direct INSERT, UPDATE or DELETE", async () => {
    const conv = await open(A);
    await server(() =>
      expect(
        db.query(
          "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) VALUES ($1, $2, 'staff', 'forged')",
          [conv, A],
        ),
      ).rejects.toMatchObject({ code: "42501" }),
    );
    await server(() =>
      expect(
        db.query("UPDATE public.support_conversations SET status = 'solved'"),
      ).rejects.toMatchObject({ code: "42501" }),
    );
    await server(() =>
      expect(db.query("DELETE FROM public.support_conversations")).rejects.toMatchObject({
        code: "42501",
      }),
    );
    await reset();
  });

  it("no learner-facing function can reach the staff notes", async () => {
    for (const fn of LEARNER_FUNCTIONS) {
      const { rows } = await db.query<{ def: string }>(
        "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
        [fn],
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.def).not.toMatch(/support_notes/);
    }
    // The learner view returns exactly these keys per message and these per conversation.
    await reset();
    await db.exec(`INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(1)}', '${A}', 'open');
      INSERT INTO public.support_notes (conversation_id, author_id, body) VALUES ('${cid(1)}', '${STAFF}', 'INTERNAL-NOTE-SENTINEL');`);
    await say(A, cid(1), "hello");
    const view = (
      await server(() =>
        db.query<{ v: Record<string, unknown> }>("SELECT public.support_learner_view($1) v", [A]),
      )
    ).rows[0]!.v as { status: string; messages: Record<string, unknown>[] };
    expect(Object.keys(view).sort()).toEqual(["messages", "status", "unread"]);
    expect(Object.keys(view.messages[0]!).sort()).toEqual(["at", "body", "id", "kind"]);
    expect(JSON.stringify(view)).not.toContain("INTERNAL-NOTE-SENTINEL");
    await reset();
  });
});

describe("support chat migration: one live conversation per learner", () => {
  it("a second open returns the same id; another learner gets their own", async () => {
    await reset();
    const first = await open(A, "ios");
    expect(await open(A, "web")).toBe(first);
    const other = await open(B);
    expect(other).not.toBe(first);
    expect(await count("support_conversations", `user_id='${A}'`)).toBe(1);
    // The first call's channel stuck; an unknown channel falls back to web.
    expect(await count("support_conversations", `id='${first}' AND channel='ios'`)).toBe(1);
    expect(await count("support_conversations", `id='${other}' AND channel='web'`)).toBe(1);
    await reset();
  });

  it("parallel calls settle on one conversation", async () => {
    await reset();
    const ids = await Promise.all([open(A), open(A), open(A)]);
    expect(new Set(ids).size).toBe(1);
    expect(await count("support_conversations", `user_id='${A}'`)).toBe(1);
    await reset();
  });

  it("the database itself refuses a second live row (the index, not just the function)", async () => {
    await reset();
    await open(A);
    await expect(
      db.query("INSERT INTO public.support_conversations (user_id) VALUES ($1)", [A]),
    ).rejects.toMatchObject({ code: "23505" });
    await reset();
  });

  it("solved less than 7 days ago reopens the same conversation; older starts a new one", async () => {
    await reset();
    const recent = await open(A);
    await db.query(
      "UPDATE public.support_conversations SET status='solved', solved_at = now() - interval '6 days 23 hours' WHERE id=$1",
      [recent],
    );
    expect(await open(A)).toBe(recent);
    expect(
      (
        await db.query<{ status: string; solved_at: string | null }>(
          "SELECT status, solved_at FROM public.support_conversations WHERE id=$1",
          [recent],
        )
      ).rows[0],
    ).toEqual({ status: "open", solved_at: null });

    await db.query(
      "UPDATE public.support_conversations SET status='solved', solved_at = now() - interval '7 days 1 hour' WHERE id=$1",
      [recent],
    );
    const fresh = await open(A);
    expect(fresh).not.toBe(recent);
    expect(await count("support_conversations", `user_id='${A}'`)).toBe(2);
    expect(await count("support_conversations", `id='${fresh}' AND status='ai'`)).toBe(1);
    await reset();
  });
});

describe("support chat migration: messages", () => {
  it("are append-only: UPDATE, DELETE and TRUNCATE raise even for the table owner", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "hello");
    await expect(db.query("UPDATE public.support_messages SET body = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query("DELETE FROM public.support_messages")).rejects.toThrow(/append-only/);
    await expect(db.query("TRUNCATE public.support_messages")).rejects.toThrow(/append-only/);
    expect(await count("support_messages")).toBe(1);
    await reset();
  });

  it("the retention setting lets the purge delete, nothing else does", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "hello");
    await db.exec("BEGIN; SELECT set_config('lwa.support_retention', 'on', true)");
    await db.exec("DELETE FROM public.support_messages");
    await db.exec("COMMIT");
    expect(await count("support_messages")).toBe(0);
    await reset();
  });

  it("deleting the account removes conversations, messages and notes (the cascade is allowed)", async () => {
    await reset();
    const extra = "00000000-0000-4000-8000-0000000000d4";
    await db.exec(`INSERT INTO auth.users(id) VALUES ('${extra}')`);
    const conv = await open(extra);
    await say(extra, conv, "hello");
    await db.query(
      "INSERT INTO public.support_notes (conversation_id, author_id, body) VALUES ($1, $2, 'n')",
      [conv, STAFF],
    );
    await db.exec(`DELETE FROM auth.users WHERE id = '${extra}'`);
    expect(await count("support_conversations", `user_id='${extra}'`)).toBe(0);
    expect(await count("support_messages", `user_id='${extra}'`)).toBe(0);
    expect(await count("support_notes")).toBe(0);
    await reset();
  });

  it("a learner message goes in as 'learner', trimmed, owned by that learner", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "  my streak vanished  ");
    expect(
      (
        await db.query(
          "SELECT author_kind, user_id, body, author_id, ai_facts FROM public.support_messages",
        )
      ).rows,
    ).toEqual([
      {
        author_kind: "learner",
        user_id: A,
        body: "my streak vanished",
        author_id: null,
        ai_facts: null,
      },
    ]);
    await expect(say(A, conv, "   ")).rejects.toMatchObject({ code: "22023" });
    await expect(say(A, conv, "x".repeat(2001))).rejects.toMatchObject({ code: "22023" });
    await reset();
  });

  it("a learner cannot add to someone else's conversation or hand it off", async () => {
    await reset();
    const convB = await open(B);
    await expect(say(A, convB, "intruder")).rejects.toMatchObject({ code: "42501" });
    await expect(
      server(() =>
        db.query("SELECT public.support_handoff($1,$2,'learner_asked','other',null)", [A, convB]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await count("support_messages")).toBe(0);
    // And A's own view never shows B's conversation.
    await say(B, convB, "private to B");
    await open(A);
    const view = (
      await server(() =>
        db.query<{ v: { messages: unknown[] } }>("SELECT public.support_learner_view($1) v", [A]),
      )
    ).rows[0]!.v;
    expect(JSON.stringify(view)).not.toContain("private to B");
    expect(view.messages).toEqual([]);
    await reset();
  });

  it("a retried clientId does not double-post, and a retry after the cap is still free", async () => {
    await reset();
    const conv = await open(A);
    const first = (await say(A, conv, "hello", cid(1))).rows[0]!.id;
    const again = (await say(A, conv, "hello", cid(1))).rows[0]!.id;
    expect(again).toBe(first);
    expect(await count("support_messages")).toBe(1);
    // Fill the day, then retry the first message: it returns the stored row instead of raising.
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) SELECT $1, $2, 'learner', 'fill' FROM generate_series(1, 49)",
      [conv, A],
    );
    expect((await say(A, conv, "hello", cid(1))).rows[0]!.id).toBe(first);
    await reset();
  });

  it("the 51st learner message in a day is refused; another learner is unaffected", async () => {
    await reset();
    const conv = await open(A);
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) SELECT $1, $2, 'learner', 'fill' FROM generate_series(1, 50)",
      [conv, A],
    );
    await expect(say(A, conv, "one more")).rejects.toThrow(/support_daily_cap/);
    const convB = await open(B);
    await expect(say(B, convB, "fine")).resolves.toBeTruthy();
    await reset();
  });

  it("the daily cap counts today only (yesterday's messages do not)", async () => {
    await reset();
    const conv = await open(A);
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body, created_at) SELECT $1, $2, 'learner', 'old', now() - interval '2 days' FROM generate_series(1, 60)",
      [conv, A],
    );
    // 60 old messages: over the per-conversation cap (100)? No, still room, so this one goes in.
    await expect(say(A, conv, "today")).resolves.toBeTruthy();
    await reset();
  });

  it("the 101st learner message in one conversation is refused", async () => {
    await reset();
    const conv = await open(A);
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body, created_at) SELECT $1, $2, 'learner', 'old', now() - interval '2 days' FROM generate_series(1, 100)",
      [conv, A],
    );
    await expect(say(A, conv, "one more")).rejects.toThrow(/support_conversation_cap/);
    await reset();
  });

  it("a learner writing while a person waits on them moves it back to 'open'", async () => {
    await reset();
    const conv = await open(A);
    await db.query("UPDATE public.support_conversations SET status='waiting_learner' WHERE id=$1", [
      conv,
    ]);
    await say(A, conv, "here is more detail");
    expect(await count("support_conversations", `id='${conv}' AND status='open'`)).toBe(1);
    await reset();
  });

  it("an AI reply with a hand-off moves 'ai' to 'new' and records why; the AI row keeps its facts", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "refund please");
    const facts = { pro: { active: true } };
    const r = await server(() =>
      db.query<{ id: string | null }>(
        "SELECT public.support_add_ai_message($1,$2,$3::jsonb,$4::jsonb) AS id",
        [
          conv,
          "I can't change anything on your account, a person can.",
          JSON.stringify(facts),
          JSON.stringify({
            reason: "ai_unsure",
            topic: "billing",
            summary: "Asked about a refund.",
          }),
        ],
      ),
    );
    expect(r.rows[0]!.id).not.toBeNull();
    expect(
      (
        await db.query(
          "SELECT status, handoff_reason, topic, ai_summary FROM public.support_conversations WHERE id=$1",
          [conv],
        )
      ).rows[0],
    ).toEqual({
      status: "new",
      handoff_reason: "ai_unsure",
      topic: "billing",
      ai_summary: "Asked about a refund.",
    });
    expect(
      (
        await db.query("SELECT author_kind, ai_facts FROM public.support_messages ORDER BY id")
      ).rows.map((m) => (m as { author_kind: string }).author_kind),
    ).toEqual(["learner", "ai", "system"]);
    expect(await count("support_messages", "author_kind='ai' AND ai_facts IS NOT NULL")).toBe(1);
    // Once a person has it, a late AI reply writes nothing.
    const late = await server(() =>
      db.query<{ id: string | null }>(
        "SELECT public.support_add_ai_message($1,'late',null,null) AS id",
        [conv],
      ),
    );
    expect(late.rows[0]!.id).toBeNull();
    expect(await count("support_messages")).toBe(3);
    await reset();
  });

  it("an AI hand-off with a reason outside the list or a summary over 600 characters is refused", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "hi");
    await expect(
      server(() =>
        db.query("SELECT public.support_add_ai_message($1,'x',null,$2::jsonb)", [
          conv,
          JSON.stringify({ reason: "because", topic: "billing" }),
        ]),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      server(() =>
        db.query("SELECT public.support_add_ai_message($1,'x',null,$2::jsonb)", [
          conv,
          JSON.stringify({ reason: "ai_unsure", topic: "billing", summary: "s".repeat(601) }),
        ]),
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await reset();
  });

  it("the Talk to a person button hands off once and says so; a second press changes nothing", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "help");
    const press = () =>
      server(() =>
        db.query<{ moved: boolean }>(
          "SELECT public.support_handoff($1,$2,'learner_asked','other',null) AS moved",
          [A, conv],
        ),
      );
    expect((await press()).rows[0]!.moved).toBe(true);
    expect((await press()).rows[0]!.moved).toBe(false);
    expect(await count("support_messages", "author_kind='system'")).toBe(1);
    expect(
      await count(
        "support_conversations",
        `id='${conv}' AND status='new' AND handoff_reason='learner_asked'`,
      ),
    ).toBe(1);
    await reset();
  });

  it("the learner view maps kinds, hides internals, counts unread staff replies and marks read", async () => {
    await reset();
    const conv = await open(A);
    await say(A, conv, "hello");
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, author_id, body) VALUES ($1,$2,'staff',$3,'We fixed it')",
      [conv, A, STAFF],
    );
    const view = () =>
      server(() =>
        db.query<{ v: { unread: number; messages: { kind: string }[] } }>(
          "SELECT public.support_learner_view($1) v",
          [A],
        ),
      );
    const first = (await view()).rows[0]!.v;
    expect(first.messages.map((m) => m.kind)).toEqual(["you", "support"]);
    expect(first.unread).toBe(1);
    expect(JSON.stringify(first)).not.toContain(STAFF);
    expect((await view()).rows[0]!.v.unread).toBe(0);
    const none = await server(() =>
      db.query<{ v: unknown }>("SELECT public.support_learner_view($1) v", [B]),
    );
    expect(none.rows[0]!.v).toBeNull();
    await reset();
  });
});

describe("support chat migration: the 'support' AI quota kind", () => {
  const consume = (uid: string, kind: string) =>
    asRole(
      "authenticated",
      async () =>
        (
          await db.query<{ allowed: boolean; used: number; quota: number }>(
            "SELECT * FROM public.consume_ai_quota($1)",
            [kind],
          )
        ).rows[0]!,
      uid,
    );
  const rate = (uid: string, kind: string) =>
    asRole(
      "authenticated",
      async () =>
        (
          await db.query<{ allowed: boolean; count: number; per_minute_limit: number }>(
            "SELECT * FROM public.consume_ai_rate_limit($1)",
            [kind],
          )
        ).rows[0]!,
      uid,
    );

  it("allows the 30th AI answer a day and refuses the 31st", async () => {
    await reset();
    let last: { allowed: boolean; used: number; quota: number } | undefined;
    for (let i = 0; i < 30; i++) last = await consume(A, "support");
    expect(last).toEqual({ allowed: true, used: 30, quota: 30 });
    expect(await consume(A, "support")).toEqual({ allowed: false, used: 31, quota: 30 });
    // Per learner.
    expect((await consume(B, "support")).allowed).toBe(true);
    await reset();
  });

  it("allows 5 a minute and refuses the 6th", async () => {
    await reset();
    let last: { allowed: boolean; count: number; per_minute_limit: number } | undefined;
    for (let i = 0; i < 5; i++) last = await rate(A, "support");
    expect(last).toEqual({ allowed: true, count: 5, per_minute_limit: 5 });
    expect(await rate(A, "support")).toEqual({ allowed: false, count: 6, per_minute_limit: 5 });
    await reset();
  });

  it("every older kind keeps its old daily and per-minute limit; an unknown kind is refused", async () => {
    const daily: Record<string, number> = {
      chat: 60,
      stt: 120,
      tts: 80,
      translate: 60,
      define: 40,
      hector: 150,
      explain: 40,
      support: 30,
    };
    const perMinute: Record<string, number> = {
      chat: 10,
      stt: 10,
      tts: 15,
      translate: 10,
      define: 10,
      hector: 10,
      explain: 10,
      support: 5,
    };
    await reset();
    for (const [kind, limit] of Object.entries(daily)) {
      expect((await consume(A, kind)).quota, `daily ${kind}`).toBe(limit);
    }
    for (const [kind, limit] of Object.entries(perMinute)) {
      expect((await rate(A, kind)).per_minute_limit, `per minute ${kind}`).toBe(limit);
    }
    expect((await consume(A, "nonsense")).allowed).toBe(false);
    expect((await rate(A, "nonsense")).allowed).toBe(false);
    await reset();
  });
});

describe("support chat migration: the support_ai switch", () => {
  it("is added OFF, and the key list still refuses anything unknown", async () => {
    const rows = (
      await db.query<{ key: string; enabled: boolean }>(
        "SELECT key, enabled FROM public.app_switches ORDER BY key",
      )
    ).rows;
    expect(rows).toEqual([
      { key: "ai", enabled: true },
      { key: "support_ai", enabled: false },
      { key: "tutor", enabled: true },
    ]);
    await expect(
      db.query("INSERT INTO public.app_switches (key) VALUES ('other')"),
    ).rejects.toMatchObject({
      code: "23514",
    });
  });
});

describe("support chat migrations against the whole migration history", () => {
  const MINE = ["20261117100000_support_chat.sql", "20261117100100_support_quota_kind.sql"];
  const OLD_KINDS = ["chat", "stt", "tts", "translate", "define", "hector", "explain", "nonsense"];

  it("apply after every older migration, and change no older quota limit (the restate-by-copy check)", async () => {
    const { buildFullSchema } = await import("./__testutils__/full-schema");
    // The milestone 3 staff functions depend on these two, so they wait until MINE has been applied.
    const history = await buildFullSchema({
      skip: [...MINE, "20261117100200_support_staff_actions.sql"],
    });
    try {
      const limits = async () => {
        const out: Record<string, unknown> = {};
        for (const kind of OLD_KINDS) {
          await history.exec(`SELECT set_config('app.uid', '${A}', false)`);
          await history.exec(`INSERT INTO auth.users(id) VALUES ('${A}') ON CONFLICT DO NOTHING`);
          await history.exec("SET ROLE authenticated");
          const d = await history.query("SELECT allowed, quota FROM public.consume_ai_quota($1)", [
            kind,
          ]);
          const m = await history.query(
            "SELECT allowed, per_minute_limit FROM public.consume_ai_rate_limit($1)",
            [kind],
          );
          await history.exec("RESET ROLE");
          out[kind] = { daily: d.rows[0], perMinute: m.rows[0] };
        }
        await history.exec("DELETE FROM public.ai_usage; DELETE FROM public.ai_rate_limits");
        return out;
      };
      const before = await limits();
      for (const f of MINE) await history.exec(read(f));
      const after = await limits();
      expect(after).toEqual(before);
      // And the real switch table accepted the new key, OFF.
      const sw = await history.query<{ enabled: boolean }>(
        "SELECT enabled FROM public.app_switches WHERE key = 'support_ai'",
      );
      expect(sw.rows).toEqual([{ enabled: false }]);
      const other = await history.query<{ enabled: boolean }>(
        "SELECT key, enabled FROM public.app_switches WHERE key IN ('ai','tutor') ORDER BY key",
      );
      expect(other.rows.length).toBe(2);
    } finally {
      await history.close();
    }
  }, 600_000);
});
