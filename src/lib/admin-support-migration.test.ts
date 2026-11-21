import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Admin console rebuild PR 2 (20261127110000), EXECUTED in a real Postgres (PGlite) on top of the staff console, Help
 * chat, support-actions and PR 1 migrations: a reason on every status change and on handing a ticket to someone else
 * (a self-claim stays reason-free), Hand to owner (N-13: reassign to an owner + urgent, with a reason and a record), the
 * owner's Clear urgent, and the inbox that sorts an owner's urgent tickets first and pages them stably.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const CHAT = read("20261117100000_support_chat.sql");
const INBOX = read("20261117100200_support_staff_actions.sql");
const PR1 = read("20261127100000_admin_settings_ticket_numbers.sql");
const MIGRATION = read("20261127110000_admin_support_screen.sql");

const uid = (prefix: number, n: number) =>
  `00000000-0000-4000-8000-${String(prefix * 1000 + n).padStart(12, "0")}`;
const learner = (n: number) => uid(1, n);
const SAM = uid(2, 1); // support, read+reply+assign
const SUE = uid(2, 2); // a second support agent
const OWNER = uid(2, 3); // implicit owner (admin_users, no staff_roles row)
const OWNER2 = uid(2, 4); // an owner with a staff_roles row
const OWNER_OFF = uid(2, 5); // a disabled owner
const NOSCOPE = uid(2, 6); // support role without support.read
const DISABLED = uid(2, 7); // disabled support
const AIROLE = uid(2, 8);
const RANDOM = uid(2, 9); // not staff
const cid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  const learners = Array.from({ length: 40 }, (_, i) => learner(i + 1));
  const staff = [SAM, SUE, OWNER, OWNER2, OWNER_OFF, NOSCOPE, DISABLED, AIROLE, RANDOM];
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
    CREATE TABLE public.app_switches (
      key text PRIMARY KEY CHECK (key IN ('ai', 'tutor')),
      enabled boolean NOT NULL DEFAULT true, note text, updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.app_switches (key) VALUES ('ai'), ('tutor');
  `);
  await db.exec(
    [...learners, ...staff]
      .map((id, i) => `INSERT INTO auth.users(id, email) VALUES ('${id}', 'u${i}@example.com');`)
      .join("\n"),
  );
  await db.exec(`
    INSERT INTO public.profiles(id, display_name) VALUES
      ('${SAM}', 'Sam'), ('${SUE}', 'Sue'), ('${OWNER}', 'Olive'), ('${OWNER2}', 'Otto');
    INSERT INTO public.admin_users(user_id) VALUES
      ('${SAM}'), ('${SUE}'), ('${OWNER}'), ('${OWNER2}'), ('${OWNER_OFF}'), ('${NOSCOPE}'), ('${DISABLED}'), ('${AIROLE}');
  `);
  await db.exec(STAFF_CONSOLE);
  await db.exec(CHAT);
  await db.exec(INBOX);
  await db.exec(`
    INSERT INTO public.staff_roles (user_id, role, scopes) VALUES
      ('${SAM}', 'support', ARRAY['support.read','support.reply','support.assign']),
      ('${SUE}', 'support', ARRAY['support.read','support.reply','support.assign']),
      ('${NOSCOPE}', 'support', ARRAY['users.read']),
      ('${DISABLED}', 'support', ARRAY['support.read']),
      ('${AIROLE}', 'support_ai', ARRAY[]::text[]),
      ('${OWNER2}', 'owner', ARRAY[]::text[]),
      ('${OWNER_OFF}', 'owner', ARRAY[]::text[]);
    UPDATE public.staff_roles SET disabled_at = now() WHERE user_id IN ('${DISABLED}', '${OWNER_OFF}');
  `);
  await db.exec(PR1);
  await db.exec(MIGRATION);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>) => {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const one = async <T = unknown>(sql: string, params: unknown[] = []) =>
  (await server(() => db.query<{ v: T }>(`SELECT ${sql} AS v`, params))).rows[0]!.v;
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

/** A ticket that reached a person: created with the AI, then moved on (so the trigger numbers it). */
async function ticket(
  n: number,
  learnerN: number,
  status = "open",
  assignedTo: string | null = null,
) {
  await db.exec(`
    INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(n)}', '${learner(learnerN)}', 'ai');
    UPDATE public.support_conversations SET status = '${status}', topic = 'bug',
      assigned_to = ${assignedTo ? `'${assignedTo}'` : "NULL"}${status === "solved" ? ", solved_at = now()" : ""}
     WHERE id = '${cid(n)}';
  `);
}
const row = async (n: number) =>
  (
    await db.query<{
      status: string;
      assigned_to: string | null;
      urgent: boolean;
      solved_at: string | null;
    }>(
      "SELECT status, assigned_to, urgent, solved_at FROM public.support_conversations WHERE id = $1",
      [cid(n)],
    )
  ).rows[0]!;
const audit = async (action: string, conv?: number) =>
  (
    await db.query<{
      actor_user_id: string;
      actor_role: string;
      reason: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }>(
      `SELECT actor_user_id, actor_role, reason, before, after FROM public.staff_audit_log
        WHERE action = $1 ${conv ? "AND after->>'conversation_id' = $2" : ""} ORDER BY id`,
      conv ? [action, cid(conv)] : [action],
    )
  ).rows;

const setStatus = (
  actor: string,
  conv: number,
  status: string,
  reason: string | null,
  role = "support",
) =>
  one<boolean>("public.staff_support_set_status($1,$2,$3,$4,$5)", [
    actor,
    role,
    cid(conv),
    status,
    reason,
  ]);
const assign = (
  actor: string,
  conv: number,
  to: string | null,
  reason: string | null,
  role = "support",
) =>
  one<boolean>("public.staff_support_assign($1,$2,$3,$4,$5)", [actor, role, cid(conv), to, reason]);
const handToOwner = (actor: string, conv: number, reason: string | null, role = "support") =>
  one<boolean>("public.staff_support_hand_to_owner($1,$2,$3,$4)", [actor, role, cid(conv), reason]);
const clearUrgent = (actor: string, conv: number, reason: string | null, role = "owner") =>
  one<boolean>("public.staff_support_clear_urgent($1,$2,$3,$4)", [actor, role, cid(conv), reason]);

describe("staff_support_set_status needs a reason (N-8)", () => {
  it("refuses a missing, blank, short or too-long reason, and changes nothing", async () => {
    await ticket(1, 1);
    for (const bad of [null, "", "   ", "ab", "x".repeat(501)]) {
      await rejects(setStatus(SAM, 1, "solved", bad), "22023");
    }
    expect((await row(1)).status).toBe("open");
    expect(await audit("support.status", 1)).toEqual([]);
  });

  it("solves with a reason: the data, the learner's system line and the record commit together", async () => {
    await ticket(2, 2, "open", SAM);
    await db.exec(`UPDATE public.support_conversations SET urgent = true WHERE id = '${cid(2)}'`);
    expect(await setStatus(SAM, 2, "solved", "  Fixed the streak for them  ")).toBe(true);
    const r = await row(2);
    expect(r.status).toBe("solved");
    expect(r.solved_at).not.toBeNull();
    expect(r.urgent).toBe(false); // solving clears the urgent flag
    const msgs = (
      await db.query<{ body: string }>(
        "SELECT body FROM public.support_messages WHERE conversation_id = $1 AND author_kind = 'system'",
        [cid(2)],
      )
    ).rows.map((m) => m.body);
    expect(msgs).toContain("This chat was marked solved.");
    const [rec] = await audit("support.status", 2);
    expect(rec).toMatchObject({
      actor_user_id: SAM,
      actor_role: "support",
      reason: "Fixed the streak for them",
    });
    expect(rec!.before).toMatchObject({ status: "open", urgent: true });
    expect(rec!.after).toMatchObject({ status: "solved" });
  });

  it("a reopen and a waiting-on-learner change each need a reason too", async () => {
    await ticket(3, 3);
    await rejects(setStatus(SAM, 3, "waiting_learner", null), "22023");
    expect(await setStatus(SAM, 3, "waiting_learner", "asked for a screenshot")).toBe(true);
    expect(await setStatus(SAM, 3, "solved", "done")).toBe(true);
    await rejects(setStatus(SAM, 3, "open", ""), "22023");
    expect(await setStatus(SAM, 3, "open", "they wrote back")).toBe(true);
    expect((await row(3)).solved_at).toBeNull();
    expect((await audit("support.status", 3)).map((r) => r.reason)).toEqual([
      "asked for a screenshot",
      "done",
      "they wrote back",
    ]);
  });

  it("a change to the status it already has writes nothing and records nothing", async () => {
    await ticket(4, 4);
    expect(await setStatus(SAM, 4, "open", "no change")).toBe(false);
    expect(await audit("support.status", 4)).toEqual([]);
  });

  it("keeps its other refusals: unknown status, no ticket, AI chat, own account, a solved ticket", async () => {
    await rejects(setStatus(SAM, 4, "new", "because"), "22023");
    await rejects(setStatus(SAM, 999, "solved", "because"), "P0002");
    await db.exec(
      `INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(5)}', '${learner(5)}', 'ai')`,
    );
    await rejects(setStatus(SAM, 5, "solved", "because"), "55000");
    await ticket(6, 6);
    await rejects(setStatus(learner(6), 6, "solved", "because"), "42501");
    await ticket(7, 7, "solved");
    await rejects(setStatus(SAM, 7, "waiting_learner", "because"), "22023");
  });

  it("the old four-argument function is gone, and only the server can call the new one", async () => {
    await rejects(
      one("public.staff_support_set_status($1,'support',$2,'open')", [SAM, cid(1)]),
      "42883",
    );
    await rejects(
      asRole("authenticated", () =>
        db.query("SELECT public.staff_support_set_status($1,'support',$2,'open','why')", [
          SAM,
          cid(1),
        ]),
      ),
      "42501",
    );
  });
});

describe("staff_support_assign needs a reason only for someone else (N-8)", () => {
  it("a self-claim and giving back your own ticket are reason-free (the fixed words are recorded)", async () => {
    await ticket(10, 10, "new");
    expect(await assign(SAM, 10, SAM, null)).toBe(true);
    expect((await row(10)).status).toBe("open"); // taking a new ticket opens it
    expect(await assign(SAM, 10, null, null)).toBe(true);
    expect((await audit("support.assign", 10)).map((r) => r.reason)).toEqual([
      "ticket assignment",
      "ticket assignment",
    ]);
  });

  it("handing to someone else needs a reason, and records it", async () => {
    await ticket(11, 11);
    for (const bad of [null, "", " ", "ab", "x".repeat(501)]) {
      await rejects(assign(OWNER, 11, SUE, bad, "owner"), "22023");
    }
    expect((await row(11)).assigned_to).toBeNull();
    expect(await assign(OWNER, 11, SUE, " Sue knows billing ", "owner")).toBe(true);
    expect((await audit("support.assign", 11))[0]).toMatchObject({
      actor_user_id: OWNER,
      actor_role: "owner",
      reason: "Sue knows billing",
    });
  });

  it("taking back (unassigning) someone else's ticket needs a reason; giving back your own does not", async () => {
    await ticket(12, 12, "open", SUE);
    await rejects(assign(OWNER, 12, null, null, "owner"), "22023");
    expect(await assign(OWNER, 12, null, "Sue is away", "owner")).toBe(true);
    await ticket(13, 13, "open", SAM);
    expect(await assign(SAM, 13, null, null)).toBe(true);
  });

  it("a support agent taking a ticket another agent holds for themselves is still a self-claim: reason-free", async () => {
    await ticket(14, 14, "open", SUE);
    expect(await assign(SAM, 14, SAM, null)).toBe(true);
  });

  it("a repeated assignment to the same person is a no-op even without a reason, and records nothing", async () => {
    await ticket(15, 15, "open", SUE);
    expect(await assign(OWNER, 15, SUE, null, "owner")).toBe(false);
    expect(await audit("support.assign", 15)).toEqual([]);
  });

  it("refuses an assignee who cannot work support, the learner, a missing ticket, an AI chat, an own-account ticket", async () => {
    await ticket(16, 16);
    for (const bad of [DISABLED, AIROLE, NOSCOPE, OWNER_OFF, RANDOM, learner(16)]) {
      await rejects(assign(OWNER, 16, bad, "because", "owner"), "22023");
    }
    await rejects(assign(OWNER, 999, SAM, "because", "owner"), "P0002");
    await db.exec(
      `INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(17)}', '${learner(17)}', 'ai')`,
    );
    await rejects(assign(OWNER, 17, SAM, "because", "owner"), "55000");
    await rejects(assign(learner(16), 16, SAM, "because", "owner"), "42501");
  });

  it("the old four-argument function is gone, and only the server can call the new one", async () => {
    await rejects(one("public.staff_support_assign($1,'support',$2,$1)", [SAM, cid(16)]), "42883");
    await rejects(
      asRole("anon", () =>
        db.query("SELECT public.staff_support_assign($1,'support',$2,$1,null)", [SAM, cid(16)]),
      ),
      "42501",
    );
  });
});

describe("Hand to owner (N-13)", () => {
  it("reassigns to an owner, sets urgent, moves a new ticket to open and writes one record with the reason", async () => {
    await ticket(20, 20, "new", SAM);
    expect(await handToOwner(SAM, 20, "  The learner is threatening a chargeback ")).toBe(true);
    const r = await row(20);
    expect(r.urgent).toBe(true);
    expect(r.status).toBe("open");
    expect([OWNER, OWNER2]).toContain(r.assigned_to);
    const recs = await audit("support.handoff", 20);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      actor_user_id: SAM,
      actor_role: "support",
      reason: "The learner is threatening a chargeback",
    });
    expect(recs[0]!.before).toMatchObject({ assigned_to: SAM, urgent: false, status: "new" });
    expect(recs[0]!.after).toMatchObject({
      assigned_to: r.assigned_to,
      urgent: true,
      status: "open",
    });
  });

  it("a second hand-over of the same ticket is a no-op: false, nothing written, no second record", async () => {
    expect(await handToOwner(SAM, 20, "trying again")).toBe(false);
    expect(await audit("support.handoff", 20)).toHaveLength(1);
  });

  it("refuses a missing or short reason, someone who is not active staff, and a ticket that cannot be handed over", async () => {
    await ticket(21, 21);
    for (const bad of [null, "", "  ", "ab", "x".repeat(501)]) {
      await rejects(handToOwner(SAM, 21, bad), "22023");
    }
    for (const actor of [RANDOM, DISABLED, AIROLE, OWNER_OFF]) {
      await rejects(handToOwner(actor, 21, "because"), "42501");
    }
    await rejects(handToOwner(SAM, 999, "because"), "P0002");
    await rejects(handToOwner(learner(21), 21, "because"), "42501");
    await db.exec(
      `INSERT INTO public.support_conversations (id, user_id, status) VALUES ('${cid(22)}', '${learner(22)}', 'ai')`,
    );
    await rejects(handToOwner(SAM, 22, "because"), "55000");
    await ticket(23, 23, "solved");
    await rejects(handToOwner(SAM, 23, "because"), "55000");
    const r = await row(21);
    expect([r.urgent, r.assigned_to]).toEqual([false, null]);
    expect(await audit("support.handoff", 21)).toEqual([]);
  });

  it("keeps a ticket with the owner who already holds it, otherwise picks the least-loaded active owner", async () => {
    // OWNER holds nothing yet from this block; give OWNER2 two unsolved tickets so OWNER is the lighter one.
    await db.exec(
      `DELETE FROM public.support_conversations WHERE assigned_to IN ('${OWNER}', '${OWNER2}')`,
    );
    await ticket(30, 30, "open", OWNER2);
    await ticket(31, 31, "open", OWNER2);
    await ticket(32, 32, "open", SAM);
    expect(await handToOwner(SAM, 32, "needs an owner")).toBe(true);
    expect((await row(32)).assigned_to).toBe(OWNER); // the disabled owner is never chosen, the lighter one is
    // already with an owner: stays with that owner even though the other is lighter
    await ticket(33, 33, "open", OWNER2);
    expect(await handToOwner(SAM, 33, "flag it please")).toBe(true);
    expect((await row(33)).assigned_to).toBe(OWNER2);
    expect((await row(33)).urgent).toBe(true);
  });

  it("an owner who is the learner is never chosen, and with no active owner it refuses (LW002) and changes nothing", async () => {
    await ticket(34, 34, "open", SAM);
    await db.exec(`UPDATE public.staff_roles SET disabled_at = now() WHERE user_id = '${OWNER2}'`);
    await db.exec(`DELETE FROM public.admin_users WHERE user_id = '${OWNER}'`);
    try {
      await rejects(handToOwner(SAM, 34, "no one to take it"), "LW002");
      expect((await row(34)).urgent).toBe(false);
      expect(await audit("support.handoff", 34)).toEqual([]);
    } finally {
      await db.exec(`UPDATE public.staff_roles SET disabled_at = NULL WHERE user_id = '${OWNER2}'`);
      await db.exec(`INSERT INTO public.admin_users(user_id) VALUES ('${OWNER}')`);
    }
  });

  it("only the server can call it", async () => {
    await rejects(
      asRole("authenticated", () =>
        db.query("SELECT public.staff_support_hand_to_owner($1,'support',$2,'why')", [
          SAM,
          cid(21),
        ]),
      ),
      "42501",
    );
  });
});

describe("Clear urgent", () => {
  it("is for an owner only, needs a reason, and writes a record", async () => {
    await ticket(40, 9, "open", SAM); // learner 9
    await handToOwner(SAM, 40, "urgent please");
    await rejects(clearUrgent(SAM, 40, "ok then", "support"), "42501"); // wrong role
    await rejects(clearUrgent(SAM, 40, "ok then", "owner"), "42501"); // claims owner, is not
    await rejects(clearUrgent(OWNER_OFF, 40, "ok then"), "42501"); // disabled owner
    await rejects(clearUrgent(RANDOM, 40, "ok then"), "42501");
    for (const bad of [null, "", "ab"]) await rejects(clearUrgent(OWNER, 40, bad), "22023");
    await rejects(clearUrgent(OWNER, 999, "ok then"), "P0002");
    expect((await row(40)).urgent).toBe(true);
    expect(await clearUrgent(OWNER, 40, " handled it ")).toBe(true);
    expect((await row(40)).urgent).toBe(false);
    expect((await audit("support.urgent_clear", 40))[0]).toMatchObject({
      actor_user_id: OWNER,
      actor_role: "owner",
      reason: "handled it",
    });
  });

  it("clearing a ticket that is not urgent is a no-op (false, no record)", async () => {
    expect(await clearUrgent(OWNER, 40, "again")).toBe(false);
    expect(await audit("support.urgent_clear", 40)).toHaveLength(1);
  });

  it("only the server can call it", async () => {
    await rejects(
      asRole("authenticated", () =>
        db.query("SELECT public.staff_support_clear_urgent($1,'owner',$2,'why')", [OWNER, cid(40)]),
      ),
      "42501",
    );
  });
});

type Page = {
  tickets: { id: string; urgent: boolean; status: string }[];
  total: number;
  counts: Record<string, number | null>;
  next: { at: string; id: string; urgent: boolean } | null;
};
const inbox = (
  actor: string,
  filter = "open",
  assigned = "any",
  limit = 25,
  cursor?: Page["next"],
) =>
  one<Page>("public.staff_support_inbox($1,$2,$3,$4,$5,$6,$7)", [
    actor,
    filter,
    assigned,
    cursor?.at ?? null,
    cursor?.id ?? null,
    limit,
    cursor?.urgent ?? false,
  ]);

describe("the inbox sorts an owner's urgent tickets first, and pages them stably", () => {
  const ids = Array.from({ length: 9 }, (_, i) => 100 + i);
  beforeAll(async () => {
    // Isolate from the tickets above: a clean slate of nine open tickets with chosen times and flags.
    await db.exec("DELETE FROM public.support_conversations");
    for (const [i, n] of ids.entries()) {
      await db.exec(`
        INSERT INTO public.support_conversations (id, user_id, status, topic, urgent, updated_at, created_at)
        VALUES ('${cid(n)}', '${learner(i + 1)}', 'open', 'bug', ${[1, 4, 7].includes(i)}, timestamptz '2026-11-20T10:00:00Z' + interval '${i} minutes', timestamptz '2026-11-20T09:00:00Z');
      `);
    }
    // a solved ticket that still has the flag set (never shown as urgent)
    await db.exec(`
      INSERT INTO public.support_conversations (id, user_id, status, urgent, solved_at, updated_at)
      VALUES ('${cid(120)}', '${learner(20)}', 'solved', true, now(), now());
    `);
  });

  it("an owner sees urgent first (newest first inside each group); a support agent sees plain newest-first", async () => {
    const owner = await inbox(OWNER);
    const urgentIds = [107, 104, 101].map(cid);
    const restIds = [108, 106, 105, 103, 102, 100].map(cid);
    expect(owner.tickets.map((t) => t.id)).toEqual([...urgentIds, ...restIds]);
    expect(owner.tickets.slice(0, 3).every((t) => t.urgent)).toBe(true);
    const agent = await inbox(SAM);
    expect(agent.tickets.map((t) => t.id)).toEqual(
      [108, 107, 106, 105, 104, 103, 102, 101, 100].map(cid),
    );
    // the flag is still shown to the agent, only the ordering is the owner's
    expect(
      agent.tickets
        .filter((t) => t.urgent)
        .map((t) => t.id)
        .sort(),
    ).toEqual(urgentIds.slice().sort());
  });

  it("counts.urgent counts open urgent tickets, never the solved one; counts stay otherwise as before", async () => {
    const p = await inbox(OWNER);
    expect(p.counts.urgent).toBe(3);
    expect(p.counts.open).toBe(9);
    expect(p.counts.solved).toBe(1);
    const solved = await inbox(OWNER, "solved");
    expect(solved.tickets).toHaveLength(1);
    expect(solved.tickets[0]!.urgent).toBe(false);
  });

  it("pages in the same order with a cursor that carries the urgent group, with no repeats and no gaps", async () => {
    for (const size of [1, 2, 4]) {
      const seen: string[] = [];
      let cursor: Page["next"] = null;
      for (let guard = 0; guard < 20; guard++) {
        const page: Page = await inbox(OWNER, "open", "any", size, cursor ?? undefined);
        seen.push(...page.tickets.map((t) => t.id));
        cursor = page.next;
        if (!cursor) break;
      }
      expect(seen, `page size ${size}`).toEqual(
        [107, 104, 101, 108, 106, 105, 103, 102, 100].map(cid),
      );
    }
  });

  it("the old six-argument call still works (the new argument has a default)", async () => {
    const p = await one<Page>("public.staff_support_inbox($1,'open','any',null,null,25)", [SAM]);
    expect(p.tickets).toHaveLength(9);
  });

  it("filters still compose with the sort: mine + urgent group", async () => {
    await db.exec(
      `UPDATE public.support_conversations SET assigned_to = '${OWNER}' WHERE id IN ('${cid(101)}', '${cid(100)}')`,
    );
    const p = await inbox(OWNER, "open", "me");
    expect(p.tickets.map((t) => t.id)).toEqual([cid(101), cid(100)]);
    expect(p.counts.mine).toBe(2);
  });

  it("the breaching count still reads the setting", async () => {
    const p = await inbox(OWNER);
    expect(p.counts).toHaveProperty("breaching");
  });

  it("only the server can call it", async () => {
    await rejects(
      asRole("authenticated", () =>
        db.query("SELECT public.staff_support_inbox($1,'open','any',null,null,5,false)", [SAM]),
      ),
      "42501",
    );
  });
});
