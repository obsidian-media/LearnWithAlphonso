import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin console rebuild PR 1 (20261127100000), EXECUTED in a real Postgres (PGlite) on top of the staff console and
 * Help chat migrations: the settings table and its owner-only writer, ticket numbers and hand-off times (the backfill
 * and the trigger), the waiting rule, the replaced inbox (per-row waiting/breaching, the new counts, the breaching
 * filter, and proof that the setting is READ, not a constant), and the Home metric counts.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const CHAT = read("20261117100000_support_chat.sql");
const INBOX = read("20261117100200_support_staff_actions.sql");
const MIGRATION = read("20261127100000_admin_settings_ticket_numbers.sql");

const L1 = "00000000-0000-4000-8000-0000000000a1";
const L2 = "00000000-0000-4000-8000-0000000000a2";
const L3 = "00000000-0000-4000-8000-0000000000a3";
const L4 = "00000000-0000-4000-8000-0000000000a4";
const L5 = "00000000-0000-4000-8000-0000000000a5";
const SAM = "00000000-0000-4000-8000-0000000000b1"; // support
const OWNER = "00000000-0000-4000-8000-0000000000b2"; // implicit owner (admin_users, no staff_roles row)
const NOSCOPE = "00000000-0000-4000-8000-0000000000b3";
const DISABLED = "00000000-0000-4000-8000-0000000000b4";
const AIROLE = "00000000-0000-4000-8000-0000000000b5";
const RANDOM = "00000000-0000-4000-8000-0000000000b6"; // not staff
const OWNER2 = "00000000-0000-4000-8000-0000000000b7"; // an owner with a staff_roles row

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
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.lesson_completions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, lesson_id text NOT NULL, completed_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.learning_days (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL, PRIMARY KEY (user_id, day));
    INSERT INTO auth.users(id, email) VALUES
      ('${L1}', 'l1@example.com'), ('${L2}', 'l2@example.com'), ('${L3}', 'l3@example.com'),
      ('${L4}', 'l4@example.com'), ('${L5}', 'l5@example.com'),
      ('${SAM}', 'sam@staff.example'), ('${OWNER}', 'owner@staff.example'), ('${NOSCOPE}', 'ns@staff.example'),
      ('${DISABLED}', 'off@staff.example'), ('${AIROLE}', 'ai@staff.example'), ('${RANDOM}', 'rnd@example.com'),
      ('${OWNER2}', 'owner2@staff.example');
    INSERT INTO public.profiles(id, display_name) VALUES ('${SAM}', 'Sam'), ('${L1}', 'Ada');
    INSERT INTO public.admin_users(user_id) VALUES ('${SAM}'), ('${OWNER}'), ('${NOSCOPE}'), ('${DISABLED}'), ('${AIROLE}'), ('${OWNER2}');
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
      ('${AIROLE}', 'support_ai', ARRAY[]::text[]),
      ('${OWNER2}', 'owner', ARRAY[]::text[]);
    UPDATE public.staff_roles SET disabled_at = now() WHERE user_id = '${DISABLED}';
  `);

  // Chats that exist BEFORE the migration, to prove the backfill: ai (no ticket), new (hand-off line), open, solved.
  await db.exec(`
    INSERT INTO public.support_conversations (id, user_id, status, topic, handoff_reason, created_at, updated_at)
    VALUES
      ('${cid(901)}', '${L1}', 'solved', 'billing', 'learner_asked', timestamptz '2026-11-01T10:00:00Z', timestamptz '2026-11-01T12:00:00Z'),
      ('${cid(902)}', '${L2}', 'new', 'pro', 'ai_unsure', timestamptz '2026-11-02T10:00:00Z', timestamptz '2026-11-02T10:05:00Z'),
      ('${cid(903)}', '${L3}', 'open', 'bug', 'learner_asked', timestamptz '2026-11-03T10:00:00Z', timestamptz '2026-11-03T11:00:00Z'),
      ('${cid(904)}', '${L4}', 'ai', NULL, NULL, timestamptz '2026-11-04T10:00:00Z', timestamptz '2026-11-04T10:00:00Z');
    INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body, created_at) VALUES
      ('${cid(902)}', '${L2}', 'system', 'A person will reply here.', timestamptz '2026-11-02T10:04:00Z');
  `);
  await db.exec(MIGRATION);
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
const one = async <T = unknown>(sql: string, params: unknown[] = []) =>
  (await server(() => db.query<{ v: T }>(`SELECT ${sql} AS v`, params))).rows[0]!.v;
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

const setHours = (n: number | string) =>
  one<boolean>(
    "public.staff_set_setting($1,'owner','support_breach_hours',$2::jsonb,'tune the clock')",
    [OWNER, JSON.stringify(n)],
  );

type Inbox = {
  tickets: {
    id: string;
    ticketNo: number | null;
    status: string;
    waitingSince: string | null;
    breaching: boolean;
  }[];
  total: number;
  counts: Record<string, number | string | null>;
  breachHours: number | null;
};
const inbox = (actor: string, filter = "open", assigned = "any") =>
  one<Inbox>("public.staff_support_inbox($1,$2,$3,null,null,25)", [actor, filter, assigned]);

describe("the migration on a database that already has chats (backfill)", () => {
  it("numbers the chats that are with a person in the order they were created, and leaves the AI one without", async () => {
    const rows = (
      await db.query<{ id: string; ticket_no: string | null }>(
        "SELECT id, ticket_no::text FROM public.support_conversations ORDER BY created_at",
      )
    ).rows;
    expect(rows.map((r) => [r.id, r.ticket_no])).toEqual([
      [cid(901), "1"],
      [cid(902), "2"],
      [cid(903), "3"],
      [cid(904), null],
    ]);
  });

  it("handed_off_at is the hand-off line's time when there is one, else the chat's creation time", async () => {
    const at = async (n: number) =>
      (
        await db.query<{ t: string | null }>(
          "SELECT to_char(handed_off_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI') t FROM public.support_conversations WHERE id=$1",
          [cid(n)],
        )
      ).rows[0]!.t;
    expect(await at(902)).toBe("2026-11-02T10:04");
    expect(await at(903)).toBe("2026-11-03T10:00");
    expect(await at(904)).toBeNull();
  });

  it("the next ticket continues after the highest number", async () => {
    await db.query("UPDATE public.support_conversations SET status='new' WHERE id=$1", [cid(904)]);
    const r = (
      await db.query<{ ticket_no: string; h: boolean }>(
        "SELECT ticket_no::text, handed_off_at IS NOT NULL h FROM public.support_conversations WHERE id=$1",
        [cid(904)],
      )
    ).rows[0]!;
    expect(r).toEqual({ ticket_no: "4", h: true });
    // a second move (new -> open) never renumbers it
    await db.query("UPDATE public.support_conversations SET status='open' WHERE id=$1", [cid(904)]);
    expect(
      (
        await db.query<{ n: string }>(
          "SELECT ticket_no::text n FROM public.support_conversations WHERE id=$1",
          [cid(904)],
        )
      ).rows[0]!.n,
    ).toBe("4");
  });

  it("the real hand-off function (support_handoff) gives a new chat its number and time through the trigger", async () => {
    await db.query(
      "INSERT INTO public.support_conversations (id, user_id, status) VALUES ($1,$2,'ai')",
      [cid(905), L5],
    );
    await server(() =>
      db.query("SELECT public.support_handoff($1,$2,'learner_asked','billing','summary')", [
        L5,
        cid(905),
      ]),
    );
    const r = (
      await db.query<{ ticket_no: string; s: string }>(
        "SELECT ticket_no::text, status s FROM public.support_conversations WHERE id=$1",
        [cid(905)],
      )
    ).rows[0]!;
    expect(r).toEqual({ ticket_no: "5", s: "new" });
  });

  it("ticket numbers are unique", async () => {
    await expect(
      db.query("UPDATE public.support_conversations SET ticket_no = 1 WHERE id = $1", [cid(903)]),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("admin_settings", () => {
  it("is seeded with support_breach_hours = 8 and read by any active staff member", async () => {
    expect(await one("public.staff_get_settings($1)", [SAM])).toEqual({ support_breach_hours: 8 });
    expect(await one("public.staff_get_settings($1)", [OWNER])).toEqual({
      support_breach_hours: 8,
    });
  });

  it("a non-staff, disabled or support_ai caller is refused the read", async () => {
    for (const who of [RANDOM, DISABLED, AIROLE]) {
      await rejects(one("public.staff_get_settings($1)", [who]), "42501");
    }
  });

  it("only an owner can write: support, a spoofed role label, non-staff and disabled callers are refused", async () => {
    await rejects(
      one("public.staff_set_setting($1,'support','support_breach_hours','12','a reason')", [SAM]),
      "42501",
    );
    // the caller claims to be an owner but the database knows better
    await rejects(
      one("public.staff_set_setting($1,'owner','support_breach_hours','12','a reason')", [SAM]),
      "42501",
    );
    for (const who of [RANDOM, DISABLED, AIROLE, NOSCOPE]) {
      await rejects(
        one("public.staff_set_setting($1,'owner','support_breach_hours','12','a reason')", [who]),
        "42501",
      );
    }
    expect(await one("public.staff_get_settings($1)", [OWNER])).toEqual({
      support_breach_hours: 8,
    });
  });

  it("anon and authenticated cannot execute any of the new functions; the table is closed to them too", async () => {
    const calls = [
      `public.staff_get_settings('${OWNER}')`,
      `public.staff_set_setting('${OWNER}','owner','support_breach_hours','9','a reason')`,
      "public.staff_home_metrics('today')",
      `public.staff_active_role('${OWNER}')`,
      `public.support_waiting_since('${cid(901)}','open',now(),now())`,
      `public.staff_support_inbox('${OWNER}','open','any',null,null,25)`,
    ];
    for (const role of ["anon", "authenticated"]) {
      for (const call of calls) {
        await asRole(role, () => rejects(db.query(`SELECT ${call}`), "42501"), OWNER);
      }
      await asRole(
        role,
        () => rejects(db.query("SELECT * FROM public.admin_settings"), "42501"),
        OWNER,
      );
    }
  });

  it("service_role cannot write the table directly (the function is the only writer)", async () => {
    await server(() =>
      rejects(
        db.query(
          "UPDATE public.admin_settings SET value = '99'::jsonb WHERE key='support_breach_hours'",
        ),
        "42501",
      ),
    );
  });

  it("an owner changes it with a reason: one record row with before and after, same value is a no-op", async () => {
    const before = Number(
      (await db.query<{ n: string }>("SELECT count(*)::text n FROM public.staff_audit_log"))
        .rows[0]!.n,
    );
    expect(await setHours(12)).toBe(true);
    expect(await one("public.staff_get_settings($1)", [SAM])).toEqual({ support_breach_hours: 12 });
    const rows = (
      await db.query<{
        actor_user_id: string;
        actor_role: string;
        target_user_id: string | null;
        reason: string;
        before: unknown;
        after: unknown;
      }>("SELECT * FROM public.staff_audit_log WHERE action = 'settings.update' ORDER BY id")
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: OWNER,
      actor_role: "owner",
      target_user_id: null,
      reason: "tune the clock",
      before: { key: "support_breach_hours", value: 8 },
      after: { key: "support_breach_hours", value: 12 },
    });
    expect(await setHours(12)).toBe(false);
    expect(
      Number(
        (await db.query<{ n: string }>("SELECT count(*)::text n FROM public.staff_audit_log"))
          .rows[0]!.n,
      ),
    ).toBe(before + 1);
    // an owner with a staff_roles row works too
    expect(
      await one<boolean>(
        "public.staff_set_setting($1,'owner','support_breach_hours','8','back to eight')",
        [OWNER2],
      ),
    ).toBe(true);
  });

  it("a 9.0 write is stored as 9, reads back as 9, and the inbox still works", async () => {
    const raw = (v: string) =>
      one<boolean>(
        "public.staff_set_setting($1,'owner','support_breach_hours',$2::jsonb,'tune the clock')",
        [OWNER, v],
      );
    expect(await raw("9.0")).toBe(true);
    expect(await one("public.staff_get_settings($1)", [SAM])).toEqual({ support_breach_hours: 9 });
    const stored = (
      await db.query<{ t: string }>(
        "SELECT value::text t FROM public.admin_settings WHERE key = 'support_breach_hours'",
      )
    ).rows[0]!.t;
    expect(stored).toBe("9");
    expect((await inbox(SAM)).breachHours).toBe(9);
    // an old non-canonical row (written before this fix) must not break the inbox either
    await db.exec("UPDATE public.admin_settings SET value = '9.0'::jsonb");
    expect((await inbox(SAM)).breachHours).toBe(9);
    await db.exec("UPDATE public.admin_settings SET value = '8'::jsonb");
    // writing 8.0 over 8 is the same value: nothing changes
    expect(await raw("8.0")).toBe(false);
  });

  it("refuses a bad value, a short reason and an unknown key, and records nothing", async () => {
    const count = async () =>
      Number(
        (await db.query<{ n: string }>("SELECT count(*)::text n FROM public.staff_audit_log"))
          .rows[0]!.n,
      );
    const before = await count();
    for (const bad of [0, 169, 1.5, -3, '"eight"']) {
      await rejects(
        one("public.staff_set_setting($1,'owner','support_breach_hours',$2::jsonb,'a reason')", [
          OWNER,
          typeof bad === "string" ? bad : JSON.stringify(bad),
        ]),
        "22023",
      );
    }
    await rejects(
      one("public.staff_set_setting($1,'owner','support_breach_hours','9','no')", [OWNER]),
      "22023",
    );
    await rejects(
      one("public.staff_set_setting($1,'owner','support_breach_hours','9','  ')", [OWNER]),
      "22023",
    );
    await rejects(
      one("public.staff_set_setting($1,'owner','something_else','9','a reason')", [OWNER]),
      "22023",
    );
    expect(await count()).toBe(before);
    expect(await one("public.staff_get_settings($1)", [OWNER])).toEqual({
      support_breach_hours: 8,
    });
  });
});

describe("the waiting rule and the replaced inbox", () => {
  const hoursAgo = (h: number) => `now() - interval '${h} hours'`;

  async function reset() {
    await db.exec("DELETE FROM public.support_conversations");
    await db.exec("UPDATE public.admin_settings SET value = '8'::jsonb");
  }
  async function conv(
    n: number,
    user: string,
    status: string,
    o: { handedOffHoursAgo?: number; assignedTo?: string; updatedHoursAgo?: number } = {},
  ) {
    await db.exec(`INSERT INTO public.support_conversations
      (id, user_id, status, assigned_to, topic, handoff_reason, ticket_no, handed_off_at, created_at, updated_at)
      VALUES ('${cid(n)}', '${user}', '${status}', ${o.assignedTo ? `'${o.assignedTo}'` : "null"},
        'billing', 'learner_asked', ${100 + n},
        ${o.handedOffHoursAgo !== undefined ? hoursAgo(o.handedOffHoursAgo) : "null"},
        ${hoursAgo(30)}, ${hoursAgo(o.updatedHoursAgo ?? 1)})`);
  }
  async function msg(
    n: number,
    user: string,
    kind: "learner" | "staff",
    hours: number,
    by?: string,
  ) {
    await db.exec(`INSERT INTO public.support_messages
      (conversation_id, user_id, author_kind, author_id, body, created_at)
      VALUES ('${cid(n)}', '${user}', '${kind}', ${by ? `'${by}'` : "null"}, 'text', ${hoursAgo(hours)})`);
  }
  const hoursSince = (iso: string | null) =>
    iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : null;

  it("waiting starts at the hand-off when no person has replied", async () => {
    await reset();
    await conv(1, L1, "open", { handedOffHoursAgo: 3 });
    const r = await inbox(SAM);
    expect(hoursSince(r.tickets[0]!.waitingSince)).toBeGreaterThan(2.9);
    expect(hoursSince(r.tickets[0]!.waitingSince)).toBeLessThan(3.1);
    expect(r.tickets[0]).toMatchObject({ ticketNo: 101, status: "open", breaching: false });
  });

  it("after a staff reply, waiting starts again at the learner's next message", async () => {
    await reset();
    await conv(1, L1, "open", { handedOffHoursAgo: 20 });
    await msg(1, L1, "learner", 19);
    await msg(1, L1, "staff", 10, SAM);
    await msg(1, L1, "learner", 5);
    await msg(1, L1, "learner", 4);
    const r = await inbox(SAM);
    expect(hoursSince(r.tickets[0]!.waitingSince)).toBeGreaterThan(4.9);
    expect(hoursSince(r.tickets[0]!.waitingSince)).toBeLessThan(5.1);
  });

  it("a ticket waiting on the learner or solved has no wait and can never breach", async () => {
    await reset();
    await conv(1, L1, "waiting_learner", { handedOffHoursAgo: 50 });
    await conv(2, L2, "solved", { handedOffHoursAgo: 50 });
    const all = await inbox(SAM, "all");
    expect(all.tickets.map((t) => [t.status, t.waitingSince, t.breaching]).sort()).toEqual([
      ["solved", null, false],
      ["waiting_learner", null, false],
    ]);
    expect(all.counts.breaching).toBe(0);
    expect(all.counts.oldestWaitingSince).toBeNull();
  });

  it("BREACHING READS THE SETTING: the same ticket breaches at 2 hours and not at 8", async () => {
    await reset();
    await conv(1, L1, "open", { handedOffHoursAgo: 3 });
    expect((await inbox(SAM)).tickets[0]!.breaching).toBe(false);
    expect((await inbox(SAM)).counts.breaching).toBe(0);
    expect((await inbox(SAM, "breaching")).tickets).toHaveLength(0);

    expect(await setHours(2)).toBe(true);
    const r = await inbox(SAM);
    expect(r.breachHours).toBe(2);
    expect(r.tickets[0]!.breaching).toBe(true);
    expect(r.counts.breaching).toBe(1);
    const only = await inbox(SAM, "breaching");
    expect(only.tickets.map((t) => t.id)).toEqual([cid(1)]);
    expect(only.total).toBe(1);

    expect(await setHours(4)).toBe(true);
    expect((await inbox(SAM)).tickets[0]!.breaching).toBe(false);
  });

  it("a missing setting means breaching is unknown (null), never 0", async () => {
    await reset();
    await conv(1, L1, "open", { handedOffHoursAgo: 99 });
    await db.exec("DELETE FROM public.admin_settings");
    const r = await inbox(SAM);
    expect(r.breachHours).toBeNull();
    expect(r.counts.breaching).toBeNull();
    expect(r.tickets[0]!.breaching).toBe(false);
    expect((await inbox(SAM, "breaching")).tickets).toHaveLength(0);
    await db.exec(
      "INSERT INTO public.admin_settings (key, value) VALUES ('support_breach_hours','8'::jsonb)",
    );
  });

  it("the new counts: mine, openUnassigned and the oldest wait are about tickets that need a reply", async () => {
    await reset();
    await conv(1, L1, "new", { handedOffHoursAgo: 6 }); // unassigned, oldest
    await conv(2, L2, "open", { handedOffHoursAgo: 2, assignedTo: SAM });
    await conv(3, L3, "open", { handedOffHoursAgo: 1, assignedTo: OWNER });
    await conv(4, L4, "waiting_learner", { handedOffHoursAgo: 40 }); // not a reply
    const r = await inbox(SAM);
    expect(r.counts).toMatchObject({
      open: 3,
      openUnassigned: 1,
      mine: 1,
      unassigned: 2,
      waiting: 1,
      all: 4,
    });
    expect(hoursSince(r.counts.oldestWaitingSince as string)).toBeGreaterThan(5.9);
    // "mine" is the caller's own, not the page's
    expect((await inbox(OWNER)).counts.mine).toBe(1);
    expect((await inbox(RANDOM)).counts.mine).toBe(0);
    const mine = await inbox(SAM, "open", "me");
    expect(mine.tickets.map((t) => t.id)).toEqual([cid(2)]);
  });

  it("keeps what the old inbox did: filters, the snippet, no learner name, the AI chats stay out", async () => {
    await reset();
    await conv(1, L1, "open", { handedOffHoursAgo: 1 });
    await msg(1, L1, "learner", 2);
    await db.exec(
      `INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(9)}', '${L5}', 'ai')`,
    );
    const r = await inbox(SAM, "all");
    expect(r.tickets).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("l1@example.com");
    expect(JSON.stringify(r)).not.toContain("Ada");
    await rejects(one("public.staff_support_inbox($1,'nope','any',null,null,25)", [SAM]), "22023");
  });
});

describe("staff_home_metrics", () => {
  it("counts new learners, lessons and today's active learners; the range changes the first two, not the third", async () => {
    await db.exec(`
      DELETE FROM public.lesson_completions; DELETE FROM public.learning_days;
      DELETE FROM public.profiles WHERE id NOT IN ('${SAM}', '${L1}');
      UPDATE public.profiles SET created_at = now() - interval '200 days';
    `);
    await db.exec(`
      INSERT INTO public.profiles(id, display_name, created_at) VALUES
        ('${L2}', 'a', now()), ('${L3}', 'b', now() - interval '3 days'), ('${L4}', 'c', now() - interval '20 days');
      INSERT INTO public.lesson_completions(user_id, lesson_id, completed_at) VALUES
        ('${L2}', 'x1', now()), ('${L2}', 'x2', now()), ('${L3}', 'x3', now() - interval '3 days'),
        ('${L4}', 'x4', now() - interval '20 days'), ('${L4}', 'x5', now() - interval '60 days');
      INSERT INTO public.learning_days(user_id, day) VALUES
        ('${L2}', (now() AT TIME ZONE 'UTC')::date), ('${L3}', (now() AT TIME ZONE 'UTC')::date),
        ('${L4}', (now() AT TIME ZONE 'UTC')::date - 1);
    `);
    const m = (range: string) =>
      one<Record<string, number>>("public.staff_home_metrics($1)", [range]);
    expect(await m("today")).toEqual({ newLearners: 1, lessons: 2, activeToday: 2 });
    expect(await m("7")).toEqual({ newLearners: 2, lessons: 3, activeToday: 2 });
    expect(await m("30")).toEqual({ newLearners: 3, lessons: 4, activeToday: 2 });
  });

  it("the range tests are sargable (no date cast on the column) and the indexes exist", async () => {
    expect(MIGRATION).not.toMatch(/created_at AT TIME ZONE 'UTC'\)::date >= first_day/);
    expect(MIGRATION).not.toMatch(/completed_at AT TIME ZONE 'UTC'\)::date >= first_day/);
    const idx = (
      await db.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE indexname IN ('lesson_completions_completed_at','profiles_created_at')",
      )
    ).rows.map((r) => r.indexname);
    expect(idx.sort()).toEqual(["lesson_completions_completed_at", "profiles_created_at"]);
  });

  it("a row at UTC midnight of the first day counts, one a second earlier does not (boundary kept)", async () => {
    await db.exec(`
      DELETE FROM public.lesson_completions;
      INSERT INTO public.lesson_completions(user_id, lesson_id, completed_at) VALUES
        ('${L2}', 'b1', ((now() AT TIME ZONE 'UTC')::date - 6)::timestamp AT TIME ZONE 'UTC'),
        ('${L2}', 'b2', ((now() AT TIME ZONE 'UTC')::date - 6)::timestamp AT TIME ZONE 'UTC' - interval '1 second');
    `);
    expect((await one<Record<string, number>>("public.staff_home_metrics('7')")).lessons).toBe(1);
  });

  it("a real zero is a number (the database counted nothing), and a bad range is refused", async () => {
    await db.exec("DELETE FROM public.lesson_completions; DELETE FROM public.learning_days");
    const r = await one<Record<string, number>>("public.staff_home_metrics('today')");
    expect(r.lessons).toBe(0);
    expect(r.activeToday).toBe(0);
    await rejects(one("public.staff_home_metrics('90')"), "22023");
    await rejects(one("public.staff_home_metrics(null)"), "22023");
  });
});
