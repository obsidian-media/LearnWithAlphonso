import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The support inbox's staff functions (20261117100200), EXECUTED in a real Postgres (PGlite) as seeded users, on top
 * of the staff console (20261113100000) and the Help chat (20261117100000) migrations: one audit row per action,
 * rollback when the record cannot be written, status moves with solved_at set and cleared, and who is refused.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const CHAT = read("20261117100000_support_chat.sql");
const INBOX = read("20261117100200_support_staff_actions.sql");

const LEARNER = "00000000-0000-4000-8000-0000000000a1";
const LEARNER2 = "00000000-0000-4000-8000-0000000000a2";
const LEARNER3 = "00000000-0000-4000-8000-0000000000a3";
const SAM = "00000000-0000-4000-8000-0000000000b1"; // support, may read support
const OWNER = "00000000-0000-4000-8000-0000000000b2"; // implicit owner (admin_users, no staff_roles row)
const NOSCOPE = "00000000-0000-4000-8000-0000000000b3"; // support without support.read
const DISABLED = "00000000-0000-4000-8000-0000000000b4";
const AIROLE = "00000000-0000-4000-8000-0000000000b5";
const RANDOM = "00000000-0000-4000-8000-0000000000b6"; // not staff

const FUNCTIONS = [
  ["staff_support_inbox", "($1,'open','any',null,null,25)", [SAM]],
  ["staff_support_reply", "($1,'support',$2,'hi')", [SAM, "00000000-0000-4000-8000-000000000999"]],
  ["staff_support_assign", "($1,'support',$2,$1)", [SAM, "00000000-0000-4000-8000-000000000999"]],
  [
    "staff_support_set_status",
    "($1,'support',$2,'solved')",
    [SAM, "00000000-0000-4000-8000-000000000999"],
  ],
  [
    "staff_support_add_note",
    "($1,'support',$2,'note')",
    [SAM, "00000000-0000-4000-8000-000000000999"],
  ],
] as const;

const cid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, added_at timestamptz NOT NULL DEFAULT now(), added_by uuid, note text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text);
    INSERT INTO auth.users(id, email) VALUES
      ('${LEARNER}', 'ada.lovelace@example.com'), ('${LEARNER2}', 'grace@example.com'), ('${LEARNER3}', 'linus@example.com'),
      ('${SAM}', 'sam@staff.example'), ('${OWNER}', 'owner@staff.example'), ('${NOSCOPE}', 'ns@staff.example'),
      ('${DISABLED}', 'off@staff.example'), ('${AIROLE}', 'ai@staff.example'), ('${RANDOM}', 'rnd@example.com');
    INSERT INTO public.profiles VALUES ('${LEARNER}', 'Ada Lovelace'), ('${LEARNER2}', 'Grace Hopper'), ('${SAM}', 'Sam');
    INSERT INTO public.admin_users(user_id) VALUES ('${SAM}'), ('${OWNER}'), ('${NOSCOPE}'), ('${DISABLED}'), ('${AIROLE}');
    CREATE TABLE public.app_switches (
      key text PRIMARY KEY CHECK (key IN ('ai', 'tutor')),
      enabled boolean NOT NULL DEFAULT true, note text, updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.app_switches (key) VALUES ('ai'), ('tutor');
  `);
  await db.exec(STAFF_CONSOLE);
  await db.exec(CHAT);
  await db.exec(INBOX);
  await db.exec(`
    INSERT INTO public.staff_roles (user_id, role, scopes) VALUES
      ('${SAM}', 'support', ARRAY['support.read','support.reply','support.assign']),
      ('${NOSCOPE}', 'support', ARRAY['users.read']),
      ('${DISABLED}', 'support', ARRAY['support.read']),
      ('${AIROLE}', 'support_ai', ARRAY[]::text[]);
    UPDATE public.staff_roles SET disabled_at = now() WHERE user_id = '${DISABLED}';
  `);
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
const one = async <T = unknown>(sql: string, params: unknown[] = []) =>
  (await server(() => db.query<{ v: T }>(`SELECT ${sql} AS v`, params))).rows[0]!.v;

// The action record is append-only, so tests count its rows relative to a starting point instead of clearing it.
async function reset() {
  await db.exec("DELETE FROM public.support_conversations");
}
async function auditRows(where = "true") {
  return (
    await db.query<{
      action: string;
      actor_user_id: string;
      actor_role: string;
      target_user_id: string;
      reason: string;
      before: unknown;
      after: Record<string, unknown> | null;
    }>(
      `SELECT action, actor_user_id, actor_role, target_user_id, reason, before, after
         FROM public.staff_audit_log WHERE ${where} ORDER BY id`,
    )
  ).rows;
}
/** A conversation row with a given status, plus an optional first learner message. */
async function ticket(
  n: number,
  user: string,
  status: string,
  opts: { body?: string; assignedTo?: string | null; updated?: string } = {},
) {
  await db.exec(
    `INSERT INTO public.support_conversations (id, user_id, status, assigned_to, topic, handoff_reason, updated_at, solved_at)
     VALUES ('${cid(n)}', '${user}', '${status}', ${opts.assignedTo ? `'${opts.assignedTo}'` : "null"},
       ${status === "ai" ? "null" : "'billing'"}, ${status === "ai" ? "null" : "'learner_asked'"},
       ${opts.updated ? `'${opts.updated}'` : "now()"}, ${status === "solved" ? "now()" : "null"})`,
  );
  if (opts.body) {
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) VALUES ($1,$2,'learner',$3)",
      [cid(n), user, opts.body],
    );
  }
  return cid(n);
}
const reply = (actor: string, conv: string, body: string, role = "support") =>
  server(() =>
    db.query<{ v: string }>("SELECT public.staff_support_reply($1,$2,$3,$4) AS v", [
      actor,
      role,
      conv,
      body,
    ]),
  );
const setStatus = (actor: string, conv: string, status: string) =>
  one<boolean>("public.staff_support_set_status($1,'support',$2,$3)", [actor, conv, status]);
const assign = (actor: string, conv: string, assignee: string | null) =>
  one<boolean>("public.staff_support_assign($1,'support',$2,$3)", [actor, conv, assignee]);
const note = (actor: string, conv: string, body: string) =>
  one<string>("public.staff_support_add_note($1,'support',$2,$3)", [actor, conv, body]);
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

describe("support staff migration: who can call what", () => {
  it("applies cleanly after the chat and staff migrations", async () => {
    expect(await count("support_conversations")).toBe(0);
  });

  it("anon and authenticated cannot execute any of the five functions; service_role can", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const [fn, args, params] of FUNCTIONS) {
        await asRole(
          role,
          () =>
            expect(db.query(`SELECT public.${fn}${args}`, [...params])).rejects.toMatchObject({
              code: "42501",
            }),
          SAM,
        );
      }
    }
    // service_role reaches them (a missing ticket is P0002, not a permission error)
    await rejects(reply(SAM, cid(999), "hello"), "P0002");
  });
});

describe("support staff migration: reply", () => {
  it("writes a staff message, moves the ticket to waiting on the learner, and records one row without the text", async () => {
    await reset();
    const conv = await ticket(1, LEARNER, "open", { body: "Pro is not showing" });
    const before = await count("staff_audit_log");
    const id = (await reply(SAM, conv, "  SECRET-REPLY-TEXT  ")).rows[0]!.v;

    const msg = (
      await db.query<{ author_kind: string; author_id: string; body: string; user_id: string }>(
        "SELECT author_kind, author_id, body, user_id FROM public.support_messages WHERE id = $1",
        [id],
      )
    ).rows[0]!;
    expect(msg).toEqual({
      author_kind: "staff",
      author_id: SAM,
      body: "SECRET-REPLY-TEXT",
      user_id: LEARNER,
    });
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.support_conversations WHERE id=$1",
          [conv],
        )
      ).rows[0]!.status,
    ).toBe("waiting_learner");

    expect(await count("staff_audit_log")).toBe(before + 1);
    const [row] = await auditRows(
      `action = 'support.reply' AND after->>'conversation_id' = '${conv}'`,
    );
    expect(row).toMatchObject({
      actor_user_id: SAM,
      actor_role: "support",
      target_user_id: LEARNER,
      reason: "ticket reply",
      before: { status: "open" },
    });
    expect(row!.after).toMatchObject({ status: "waiting_learner", conversation_id: conv });
    expect(JSON.stringify(await auditRows())).not.toContain("SECRET-REPLY-TEXT");

    // the learner sees it as "support", with no author id
    const view = (await one<{ messages: Record<string, unknown>[] }>(
      "public.support_learner_view($1)",
      [LEARNER],
    ))!;
    const last = view.messages.at(-1)!;
    expect(last).toMatchObject({ kind: "support", body: "SECRET-REPLY-TEXT" });
    expect(Object.keys(last).sort()).toEqual(["at", "body", "id", "kind"]);
    await reset();
  });

  it("is refused while the conversation is with the AI, once solved, for the actor's own account, and for bad bodies; nothing is written", async () => {
    await reset();
    const ai = await ticket(2, LEARNER, "ai", { body: "hello" });
    const solved = await ticket(3, LEARNER2, "solved", { body: "thanks" });
    const own = await ticket(4, SAM, "open", { body: "my own" });
    const open = await ticket(5, LEARNER3, "open", { body: "x" });
    const msgs = await count("support_messages");
    const audit = await count("staff_audit_log");

    await rejects(reply(SAM, ai, "hi"), "55000");
    await rejects(reply(SAM, solved, "hi"), "55000");
    await rejects(reply(SAM, own, "hi"), "42501");
    await rejects(reply(SAM, open, "   "), "22023");
    await rejects(reply(SAM, open, "x".repeat(4001)), "22023");
    await rejects(
      server(() => db.query("SELECT public.staff_support_reply(null,'support',$1,'hi')", [open])),
      "22023",
    );

    expect(await count("support_messages")).toBe(msgs);
    expect(await count("staff_audit_log")).toBe(audit);
    await reset();
  });

  it("if the record cannot be written the reply is rolled back with it (one transaction)", async () => {
    await reset();
    const conv = await ticket(6, LEARNER, "open", { body: "help" });
    const msgs = await count("support_messages");
    const audit = await count("staff_audit_log");
    // an unknown role makes staff_record raise AFTER the message was inserted
    await rejects(reply(SAM, conv, "will be rolled back", "not-a-role"), "22023");
    expect(await count("support_messages")).toBe(msgs);
    expect(await count("staff_audit_log")).toBe(audit);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.support_conversations WHERE id=$1",
          [conv],
        )
      ).rows[0]!.status,
    ).toBe("open");
    await reset();
  });
});

describe("support staff migration: assign", () => {
  it("assigns, moves a new ticket to open, records before and after, and is a no-op the second time", async () => {
    await reset();
    const conv = await ticket(10, LEARNER, "new", { body: "hi" });
    const audits = await count("staff_audit_log", "action = 'support.assign'");
    expect(await assign(SAM, conv, SAM)).toBe(true);
    const row = (
      await db.query<{ assigned_to: string; status: string }>(
        "SELECT assigned_to, status FROM public.support_conversations WHERE id=$1",
        [conv],
      )
    ).rows[0]!;
    expect(row).toEqual({ assigned_to: SAM, status: "open" });
    const [rec] = await auditRows(
      `action = 'support.assign' AND after->>'conversation_id' = '${conv}'`,
    );
    expect(rec).toMatchObject({
      actor_user_id: SAM,
      target_user_id: LEARNER,
      before: { assigned_to: null, status: "new" },
    });
    expect(rec!.after).toMatchObject({ assigned_to: SAM, status: "open" });

    // same assignee again: false, nothing new recorded
    expect(await assign(SAM, conv, SAM)).toBe(false);
    expect(await count("staff_audit_log", "action = 'support.assign'")).toBe(audits + 1);

    // an implicit owner (admin_users, no staff_roles row) can take it; unassigning leaves the status alone
    expect(await assign(SAM, conv, OWNER)).toBe(true);
    expect(await assign(SAM, conv, null)).toBe(true);
    expect(
      (
        await db.query<{ assigned_to: string | null; status: string }>(
          "SELECT assigned_to, status FROM public.support_conversations WHERE id=$1",
          [conv],
        )
      ).rows[0],
    ).toEqual({ assigned_to: null, status: "open" });
    await reset();
  });

  it("refuses an assignee who is not active staff who may read support, and the AI, solved-less cases", async () => {
    await reset();
    const conv = await ticket(11, LEARNER, "open", { body: "hi" });
    const audits = await count("staff_audit_log", "action = 'support.assign'");
    for (const who of [RANDOM, NOSCOPE, DISABLED, AIROLE, LEARNER]) {
      await rejects(assign(SAM, conv, who), "22023");
    }
    await rejects(assign(SAM, await ticket(12, LEARNER2, "ai"), SAM), "55000");
    await rejects(assign(SAM, await ticket(13, SAM, "open"), SAM), "42501");
    expect(await count("staff_audit_log", "action = 'support.assign'")).toBe(audits);
    await reset();
  });
});

describe("support staff migration: status", () => {
  it("solving sets solved_at and tells the learner; reopening clears solved_at and tells the learner", async () => {
    await reset();
    const conv = await ticket(20, LEARNER, "open", { body: "hi" });
    expect(await setStatus(SAM, conv, "solved")).toBe(true);
    const solved = (
      await db.query<{ status: string; solved_at: string | null }>(
        "SELECT status, solved_at FROM public.support_conversations WHERE id=$1",
        [conv],
      )
    ).rows[0]!;
    expect(solved.status).toBe("solved");
    expect(solved.solved_at).not.toBeNull();

    expect(await setStatus(SAM, conv, "open")).toBe(true);
    const reopened = (
      await db.query<{ status: string; solved_at: string | null }>(
        "SELECT status, solved_at FROM public.support_conversations WHERE id=$1",
        [conv],
      )
    ).rows[0]!;
    expect(reopened).toEqual({ status: "open", solved_at: null });

    const system = (
      await db.query<{ body: string }>(
        "SELECT body FROM public.support_messages WHERE conversation_id=$1 AND author_kind='system' ORDER BY id",
        [conv],
      )
    ).rows.map((r) => r.body);
    expect(system).toEqual([
      "This chat was marked solved.",
      "This chat was reopened. A person will reply here.",
    ]);

    const rows = await auditRows(
      `action = 'support.status' AND after->>'conversation_id' = '${conv}'`,
    );
    expect(rows.map((r) => [r.before, r.after && { status: r.after.status }])).toEqual([
      [{ status: "open" }, { status: "solved" }],
      [{ status: "solved" }, { status: "open" }],
    ]);
    expect(rows.every((r) => r.reason === "ticket status" && r.target_user_id === LEARNER)).toBe(
      true,
    );
    await reset();
  });

  it("open to waiting_learner writes no system line; a learner message brings it back to open", async () => {
    await reset();
    const conv = await ticket(21, LEARNER, "open", { body: "hi" });
    expect(await setStatus(SAM, conv, "waiting_learner")).toBe(true);
    expect(
      await count("support_messages", `conversation_id='${conv}' AND author_kind='system'`),
    ).toBe(0);
    await server(() =>
      db.query("SELECT public.support_add_learner_message($1,$2,'back again',null)", [
        LEARNER,
        conv,
      ]),
    );
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.support_conversations WHERE id=$1",
          [conv],
        )
      ).rows[0]!.status,
    ).toBe("open");
    await reset();
  });

  it("is a no-op for the same status, and refuses new, ai, unknown, solved to waiting, ai tickets and one's own", async () => {
    await reset();
    const conv = await ticket(22, LEARNER, "open", { body: "hi" });
    const audits = await count("staff_audit_log", "action = 'support.status'");
    expect(await setStatus(SAM, conv, "open")).toBe(false);
    expect(await count("staff_audit_log", "action = 'support.status'")).toBe(audits);
    for (const bad of ["new", "ai", "closed"]) await rejects(setStatus(SAM, conv, bad), "22023");
    await setStatus(SAM, conv, "solved");
    await rejects(setStatus(SAM, conv, "waiting_learner"), "22023");
    await rejects(setStatus(SAM, await ticket(23, LEARNER2, "ai"), "solved"), "55000");
    await rejects(setStatus(SAM, await ticket(24, SAM, "open"), "solved"), "42501");
    await reset();
  });

  it("refuses to reopen a solved ticket when the learner already has a live conversation (the index decides)", async () => {
    await reset();
    const audits = await count("staff_audit_log", "action = 'support.status'");
    const old = await ticket(25, LEARNER, "solved", { body: "old" });
    await ticket(26, LEARNER, "open", { body: "new one" });
    await rejects(setStatus(SAM, old, "open"), "23505");
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM public.support_conversations WHERE id=$1",
          [old],
        )
      ).rows[0]!.status,
    ).toBe("solved");
    expect(await count("staff_audit_log", "action = 'support.status'")).toBe(audits);
    await reset();
  });
});

describe("support staff migration: notes", () => {
  it("stores the note, records its id and length but not its text, and no learner function returns it", async () => {
    await reset();
    const conv = await ticket(30, LEARNER, "open", { body: "hi" });
    const id = await note(SAM, conv, "  INTERNAL-NOTE-SENTINEL  ");
    expect(
      (
        await db.query<{ body: string; author_id: string }>(
          "SELECT body, author_id FROM public.support_notes WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ body: "INTERNAL-NOTE-SENTINEL", author_id: SAM });
    const [rec] = await auditRows(
      `action = 'support.note' AND after->>'conversation_id' = '${conv}'`,
    );
    expect(rec).toMatchObject({
      actor_user_id: SAM,
      target_user_id: LEARNER,
      reason: "ticket note",
    });
    expect(rec!.after).toMatchObject({ note_id: id, length: 22, conversation_id: conv });
    expect(JSON.stringify(await auditRows())).not.toContain("INTERNAL-NOTE-SENTINEL");
    const view = await one<unknown>("public.support_learner_view($1)", [LEARNER]);
    expect(JSON.stringify(view)).not.toContain("INTERNAL-NOTE-SENTINEL");
    await reset();
  });

  it("refuses empty or long notes, AI conversations and one's own account", async () => {
    await reset();
    const conv = await ticket(31, LEARNER, "open", { body: "hi" });
    await rejects(note(SAM, conv, "  "), "22023");
    await rejects(note(SAM, conv, "x".repeat(2001)), "22023");
    await rejects(note(SAM, await ticket(32, LEARNER2, "ai"), "n"), "55000");
    await rejects(note(SAM, await ticket(33, SAM, "open"), "n"), "42501");
    expect(await count("support_notes")).toBe(0);
    await reset();
  });
});

describe("support staff migration: the inbox list", () => {
  it("filters, counts, and leaves out conversations still with the AI", async () => {
    await reset();
    await ticket(40, LEARNER, "new", { body: "first ticket" });
    await ticket(41, LEARNER2, "open", { body: "second", assignedTo: SAM });
    await ticket(42, LEARNER3, "waiting_learner", { body: "third", assignedTo: OWNER });
    await ticket(43, SAM, "solved", { body: "fourth" });
    await ticket(44, RANDOM, "ai", { body: "private AI chat" });
    const inbox = (filter: string, assigned = "any") =>
      one<{
        tickets: { id: string; status: string }[];
        total: number;
        counts: Record<string, number>;
      }>("public.staff_support_inbox($1,$2,$3,null,null,25)", [SAM, filter, assigned]);

    const open = await inbox("open");
    expect(open.tickets.map((t) => t.status).sort()).toEqual(["new", "open"]);
    expect(open.counts).toEqual({ open: 2, waiting: 1, solved: 1, all: 4, unassigned: 1 });
    expect((await inbox("waiting")).tickets.map((t) => t.id)).toEqual([cid(42)]);
    expect((await inbox("solved")).tickets.map((t) => t.id)).toEqual([cid(43)]);
    const all = await inbox("all");
    expect(all.total).toBe(4);
    expect(all.tickets.map((t) => t.id)).not.toContain(cid(44));
    expect((await inbox("all", "me")).tickets.map((t) => t.id)).toEqual([cid(41)]);
    expect((await inbox("all", "unassigned")).tickets.map((t) => t.id).sort()).toEqual(
      [cid(40), cid(43)].sort(),
    );
    await reset();
  });

  it("shows no learner name or email, a first-message snippet, and the assignee's name", async () => {
    await reset();
    await ticket(45, LEARNER, "open", { body: "Pro is not showing for me", assignedTo: SAM });
    await db.query(
      "INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body) VALUES ($1,$2,'learner','a later message')",
      [cid(45), LEARNER],
    );
    const text = JSON.stringify(
      await one("public.staff_support_inbox($1,'all','any',null,null,25)", [SAM]),
    );
    for (const secret of ["ada.lovelace@example.com", "Ada Lovelace", "Lovelace", LEARNER])
      expect(text).not.toContain(secret);
    const { tickets } = (await one<{ tickets: Record<string, unknown>[] }>(
      "public.staff_support_inbox($1,'all','any',null,null,25)",
      [SAM],
    ))!;
    expect(tickets[0]).toMatchObject({
      snippet: "Pro is not showing for me",
      assignedName: "Sam",
      assignedTo: SAM,
      topic: "billing",
      handoffReason: "learner_asked",
      channel: "web",
    });
    expect(Object.keys(tickets[0]!).sort()).toEqual(
      [
        "assignedName",
        "assignedTo",
        "channel",
        "createdAt",
        "handoffReason",
        "id",
        "snippet",
        "status",
        "topic",
        "unopened",
        "updatedAt",
      ].sort(),
    );
    await reset();
  });

  it("marks a new or open ticket unopened until a user.view row exists for that learner since it began", async () => {
    await reset();
    await ticket(46, LEARNER, "new", { body: "hi" });
    const unopened = async () =>
      (await one<{ tickets: { unopened: boolean }[] }>(
        "public.staff_support_inbox($1,'all','any',null,null,25)",
        [SAM],
      ))!.tickets[0]!.unopened;
    expect(await unopened()).toBe(true);
    // a view of ANOTHER learner does not count
    await one("public.staff_record($1,'support','user.view',$2,null,null,null,null)", [
      SAM,
      LEARNER2,
    ]);
    expect(await unopened()).toBe(true);
    await one("public.staff_record($1,'support','user.view',$2,null,null,null,null)", [
      SAM,
      LEARNER,
    ]);
    expect(await unopened()).toBe(false);
    await reset();
  });

  it("pages by (updated_at, id) with a cursor and says when there is no more", async () => {
    await reset();
    await ticket(50, LEARNER, "open", { body: "a", updated: "2026-11-14T10:00:00Z" });
    await ticket(51, LEARNER2, "open", { body: "b", updated: "2026-11-14T11:00:00Z" });
    await ticket(52, LEARNER3, "open", { body: "c", updated: "2026-11-14T12:00:00Z" });
    type Page = {
      tickets: { id: string }[];
      total: number;
      next: { at: string; id: string } | null;
    };
    const p1 = (await one<Page>("public.staff_support_inbox($1,'open','any',null,null,2)", [SAM]))!;
    expect(p1.tickets.map((t) => t.id)).toEqual([cid(52), cid(51)]);
    expect(p1.total).toBe(3);
    expect(p1.next).not.toBeNull();
    const p2 = (await one<Page>("public.staff_support_inbox($1,'open','any',$2,$3,2)", [
      SAM,
      p1.next!.at,
      p1.next!.id,
    ]))!;
    expect(p2.tickets.map((t) => t.id)).toEqual([cid(50)]);
    expect(p2.next).toBeNull();
    await reset();
  });

  it("refuses unknown filters and a half cursor", async () => {
    await rejects(
      server(() =>
        db.query("SELECT public.staff_support_inbox($1,'nope','any',null,null,25)", [SAM]),
      ),
      "22023",
    );
    await rejects(
      server(() =>
        db.query("SELECT public.staff_support_inbox($1,'open','nope',null,null,25)", [SAM]),
      ),
      "22023",
    );
    await rejects(
      server(() =>
        db.query("SELECT public.staff_support_inbox($1,'open','any',now(),null,25)", [SAM]),
      ),
      "22023",
    );
  });
});

describe("support staff migration: the record stays append-only", () => {
  it("the staff functions cannot be used to rewrite it", async () => {
    await server(() =>
      expect(db.query("UPDATE public.staff_audit_log SET reason = 'x'")).rejects.toMatchObject({
        code: "42501",
      }),
    );
  });
});
