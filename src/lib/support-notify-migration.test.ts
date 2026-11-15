import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  NOTIFY_BATCH_MINUTES,
  SUPPORT_RETENTION_MONTHS,
  isPurgeable,
  monthsBefore,
  shouldQueueNotice,
} from "./support-notify";

/**
 * The reply notice queue, the retention function and the restated sweep (20261117100300), EXECUTED in a real Postgres
 * (PGlite) on top of the support chat (20261117100000), as a seeded learner and a seeded staff member. The same rules
 * live in support-notify.ts; the equivalence tests at the end pin the two together.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const CHAT = read("20261117100000_support_chat.sql");
const FILE = "20261117100300_support_notifications.sql";
const MIGRATION = read(FILE);
const OLD_SWEEP_FILE = "20261105101100_report_retention.sql";

const LEARNER = "00000000-0000-4000-8000-0000000000a1";
const LEARNER2 = "00000000-0000-4000-8000-0000000000a2";
const STAFF = "00000000-0000-4000-8000-0000000000b1";
const SECRET_NAME = "report_notify_secret";
// A learner's and a reply's words: they must never appear in what the trigger posts.
const REPLY_TEXT = "REPLY-TEXT-SENTINEL-never-in-a-post";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    SET TimeZone = 'UTC';
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id, email) VALUES ('${LEARNER}', 'a@example.com'), ('${LEARNER2}', 'b@example.com'), ('${STAFF}', 's@example.com');
    CREATE TABLE public.app_switches (
      key text PRIMARY KEY CHECK (key IN ('ai', 'tutor')),
      enabled boolean NOT NULL DEFAULT true, note text, updated_at timestamptz NOT NULL DEFAULT now());
    -- What pg_net and Vault look like to the trigger: every call is recorded, the secret is a row.
    CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE public.net_calls (id serial PRIMARY KEY, url text, headers jsonb, body jsonb);
    CREATE TABLE public.net_failure (on_now boolean);
    INSERT INTO public.net_failure VALUES (false);
    CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint
      LANGUAGE plpgsql AS $$
      BEGIN
        IF (SELECT on_now FROM public.net_failure) THEN RAISE EXCEPTION 'pg_net is down'; END IF;
        INSERT INTO public.net_calls (url, headers, body) VALUES (url, headers, body);
        RETURN 1;
      END; $$;
    -- The tables the sweep prunes (their columns as far as the sweep touches them).
    CREATE TABLE public.review_grade_attempts (created_at timestamptz);
    CREATE TABLE public.ai_usage (day date);
    CREATE TABLE public.nudges (created_at timestamptz);
    CREATE TABLE public.friend_activity_events (event_type text, created_at timestamptz);
    CREATE TABLE public.podcast_play_events (started_at timestamptz);
    CREATE TABLE public.content_reports (account_deleted_at timestamptz);
  `);
  await db.exec(CHAT);
  await db.exec(MIGRATION);
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
const n = async (sql: string) =>
  Number((await db.query<{ n: string }>(`SELECT count(*)::text n FROM ${sql}`)).rows[0]!.n);

async function conversation(
  user: string,
  status = "open",
  solvedAt: string | null = null,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.support_conversations (user_id, status, solved_at) VALUES ($1, $2, ${solvedAt ?? "NULL"}) RETURNING id`,
    [user, status],
  );
  return r.rows[0]!.id;
}
const message = async (
  conv: string,
  user: string,
  kind: "learner" | "ai" | "staff" | "system",
  body = REPLY_TEXT,
) =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO public.support_messages (conversation_id, user_id, author_kind, author_id, body)
       VALUES ($1, $2, $3, ${kind === "staff" ? `'${STAFF}'` : "NULL"}, $4) RETURNING id`,
      [conv, user, kind, body],
    )
  ).rows[0]!.id;

beforeEach(async () => {
  await db.exec(`
    SET lwa.support_retention = 'on';
    DELETE FROM public.support_conversations;
    RESET lwa.support_retention;
    DELETE FROM public.net_calls; DELETE FROM vault.decrypted_secrets;
    UPDATE public.net_failure SET on_now = false;
    INSERT INTO vault.decrypted_secrets VALUES ('${SECRET_NAME}', 'the-shared-secret-value-for-this-test');
  `);
});

describe("which messages queue a notice (the trigger)", () => {
  it("only a person's reply does; learner, ai and system lines never", async () => {
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "learner");
    await message(c, LEARNER, "ai");
    await message(c, LEARNER, "system");
    expect(await n("public.support_notify_queue")).toBe(0);
    expect(await n("public.net_calls")).toBe(0);
    await message(c, LEARNER, "staff");
    expect(await n("public.support_notify_queue")).toBe(1);
    expect(await n("public.net_calls")).toBe(1);
  });

  it("posts the queue id to the support-notify route with the shared secret, and nothing the reply said", async () => {
    const c = await conversation(LEARNER);
    const msg = await message(c, LEARNER, "staff");
    const call = (
      await db.query<{
        url: string;
        headers: Record<string, string>;
        body: Record<string, unknown>;
      }>("SELECT url, headers, body FROM public.net_calls")
    ).rows[0]!;
    const q = (
      await db.query<{ id: number; message_id: number }>(
        "SELECT id, message_id FROM public.support_notify_queue",
      )
    ).rows[0]!;
    expect(call.url).toBe("https://learn.alphonsoecosystem.app/api/internal/support-notify");
    expect(call.headers["X-Report-Notify-Secret"]).toBe("the-shared-secret-value-for-this-test");
    expect(call.body).toEqual({ queueId: Number(q.id) });
    expect(String(q.message_id)).toBe(String(msg));
    expect(JSON.stringify(call)).not.toContain(REPLY_TEXT);
    // The queue row holds ids and times, no text and no address.
    const cols = (
      await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'support_notify_queue'",
      )
    ).rows.map((r) => r.column_name);
    expect(cols).not.toContain("body");
    expect(cols).not.toContain("email");
    expect(cols).not.toContain("user_id");
  });

  it("a second reply while the first notice is waiting adds no second notice", async () => {
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "staff");
    await message(c, LEARNER, "staff");
    expect(await n("public.support_notify_queue")).toBe(1);
    expect(await n("public.net_calls")).toBe(1);
  });

  it("batches for 30 minutes after a delivery, then notifies again (as the TypeScript rule does)", async () => {
    expect(NOTIFY_BATCH_MINUTES).toBe(30);
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "staff");
    await db.exec(
      "UPDATE public.support_notify_queue SET delivered_at = now() - interval '29 minutes'",
    );
    await message(c, LEARNER, "staff");
    expect(await n("public.support_notify_queue")).toBe(1);
    await db.exec(
      "UPDATE public.support_notify_queue SET delivered_at = now() - interval '31 minutes'",
    );
    await message(c, LEARNER, "staff");
    expect(await n("public.support_notify_queue")).toBe(2);
  });

  it("a given-up notice does not block the next one, and another learner's conversation is independent", async () => {
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "staff");
    await db.exec("UPDATE public.support_notify_queue SET gave_up_at = now()");
    await message(c, LEARNER, "staff");
    expect(await n("public.support_notify_queue")).toBe(2);
    const other = await conversation(LEARNER2);
    await message(other, LEARNER2, "staff");
    expect(await n("public.support_notify_queue")).toBe(3);
  });

  it("without the Vault secret nothing is posted, and the row waits for the sweep", async () => {
    await db.exec("DELETE FROM vault.decrypted_secrets");
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "staff");
    expect(await n("public.net_calls")).toBe(0);
    expect(await n("public.support_notify_queue WHERE delivered_at IS NULL")).toBe(1);
  });

  it("a down pg_net never refuses or loses the reply, and the row is kept for the sweep", async () => {
    await db.exec("UPDATE public.net_failure SET on_now = true");
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "staff");
    expect(await n("public.support_messages WHERE author_kind = 'staff'")).toBe(1);
    expect(await n("public.support_notify_queue")).toBe(1);
    expect(await n("public.net_calls")).toBe(0);
  });
});

describe("retention (support_purge_old)", () => {
  const purge = () =>
    asServer(
      async () => (await db.query<{ n: number }>("SELECT public.support_purge_old() n")).rows[0]!.n,
    );

  it("deletes a solved chat 12 months after it was solved, with its messages, notes and notices; keeps the rest", async () => {
    const old = await conversation(
      LEARNER,
      "solved",
      "now() - interval '12 months' - interval '1 minute'",
    );
    await message(old, LEARNER, "learner");
    await message(old, LEARNER, "staff");
    await db.query(
      "INSERT INTO public.support_notes (conversation_id, author_id, body) VALUES ($1, $2, 'note')",
      [old, STAFF],
    );
    await db.query("INSERT INTO public.support_digest_seen (conversation_id) VALUES ($1)", [old]);

    const recent = await conversation(
      LEARNER2,
      "solved",
      "now() - interval '12 months' + interval '1 minute'",
    );
    await message(recent, LEARNER2, "learner");
    await message(recent, LEARNER2, "staff");

    expect(await purge()).toBe(1);
    expect(await n("public.support_conversations")).toBe(1);
    expect(await n(`public.support_messages WHERE conversation_id = '${old}'`)).toBe(0);
    expect(await n(`public.support_notes WHERE conversation_id = '${old}'`)).toBe(0);
    expect(await n(`public.support_notify_queue WHERE conversation_id = '${old}'`)).toBe(0);
    expect(await n(`public.support_digest_seen WHERE conversation_id = '${old}'`)).toBe(0);
    expect(await n(`public.support_messages WHERE conversation_id = '${recent}'`)).toBe(2);
    expect(await n(`public.support_notify_queue WHERE conversation_id = '${recent}'`)).toBe(1);
  });

  it("never deletes a conversation that is not solved, however old, or a solved one with no solved time", async () => {
    for (const status of ["ai", "new", "open", "waiting_learner"]) {
      const u = await db.query<{ id: string }>(
        "INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id",
      );
      const c = await conversation(u.rows[0]!.id, status);
      // An old solved-at on a chat that is not solved (it should have been cleared on reopening): still never deleted.
      await db.query(
        "UPDATE public.support_conversations SET created_at = now() - interval '5 years', updated_at = now() - interval '5 years', solved_at = now() - interval '4 years' WHERE id = $1",
        [c],
      );
      await message(c, u.rows[0]!.id, "learner");
    }
    const u = await db.query<{ id: string }>(
      "INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id",
    );
    await conversation(u.rows[0]!.id, "solved", null);
    expect(await purge()).toBe(0);
    expect(await n("public.support_conversations")).toBe(5);
    expect(await n("public.support_messages")).toBe(4);
  });

  it("the append-only rule still refuses a direct delete or update of a message", async () => {
    const c = await conversation(LEARNER);
    await message(c, LEARNER, "learner");
    await expect(db.exec("DELETE FROM public.support_messages")).rejects.toThrow(/append-only/);
    await expect(db.exec("UPDATE public.support_messages SET body = 'x'")).rejects.toThrow(
      /append-only/,
    );
    // And the purge leaves no setting behind that would lift that rule.
    const old = await conversation(LEARNER2, "solved", "now() - interval '13 months'");
    await message(old, LEARNER2, "learner");
    await purge();
    await expect(db.exec("DELETE FROM public.support_messages")).rejects.toThrow(/append-only/);
  });

  it("the same cut-off as the TypeScript rule at the edges (same decision, one minute either side)", async () => {
    const now = new Date(
      (await db.query<{ t: string }>("SELECT now()::timestamptz AS t")).rows[0]!.t,
    );
    for (const [delta, expected] of [
      [-60_000, true],
      [60_000, false],
    ] as const) {
      const sqlOffset = delta < 0 ? "- interval '1 minute'" : "+ interval '1 minute'";
      const u = await db.query<{ id: string }>(
        "INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id",
      );
      await conversation(
        u.rows[0]!.id,
        "solved",
        `now() - interval '${SUPPORT_RETENTION_MONTHS} months' ${sqlOffset}`,
      );
      const solvedAt = new Date(monthsBefore(now, SUPPORT_RETENTION_MONTHS).getTime() + delta);
      expect(isPurgeable({ status: "solved", solvedAt }, now)).toBe(expected);
    }
    expect(await purge()).toBe(1);
  });

  it("calendar-month arithmetic equals the database's for month ends and leap days", async () => {
    for (const [iso, months] of [
      ["2026-03-31T00:00:00Z", 1],
      ["2028-02-29T10:00:00Z", 12],
      ["2026-11-15T12:00:00Z", 12],
      ["2025-12-31T23:59:59Z", 6],
      ["2024-05-31T08:00:00Z", 3],
    ] as const) {
      const r = await db.query<{ t: string }>(
        `SELECT ('${iso}'::timestamptz - interval '${months} months') AS t`,
      );
      expect(monthsBefore(new Date(iso), months).toISOString()).toBe(
        new Date(r.rows[0]!.t).toISOString(),
      );
    }
  });

  it("an account deletion still cascades through the chat, queue and digest rows", async () => {
    const u = await db.query<{ id: string }>(
      "INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id",
    );
    const c = await conversation(u.rows[0]!.id);
    await message(c, u.rows[0]!.id, "staff");
    await db.query("INSERT INTO public.support_digest_seen (conversation_id) VALUES ($1)", [c]);
    await db.query("DELETE FROM auth.users WHERE id = $1", [u.rows[0]!.id]);
    expect(await n(`public.support_conversations WHERE id = '${c}'`)).toBe(0);
    expect(await n(`public.support_notify_queue WHERE conversation_id = '${c}'`)).toBe(0);
    expect(await n(`public.support_digest_seen WHERE conversation_id = '${c}'`)).toBe(0);
  });
});

describe("the restated sweep", () => {
  it("still has every older step (compared with the body 20261105101100 deployed) and adds the retention call", () => {
    const body = (file: string) =>
      new RegExp(
        "CREATE (?:OR REPLACE )?FUNCTION public\\.run_maintenance_sweep\\([\\s\\S]*?\\n\\$\\$;",
      ).exec(read(file))![0];
    const steps = (sql: string) =>
      sql
        .split("\n")
        .map((l) => l.trim())
        .filter((l) =>
          /^(DELETE FROM|PERFORM net\.http_post|SELECT decrypted_secret|url :=|headers :=|body :=|timeout_milliseconds :=|RETURN;|IF secret IS NULL)/.test(
            l,
          ),
        );
    const oldSteps = steps(body(OLD_SWEEP_FILE));
    const newSteps = steps(body(FILE));
    expect(oldSteps.length).toBeGreaterThan(8);
    for (const step of oldSteps) expect(newSteps).toContain(step);
    expect(body(FILE)).toContain("PERFORM public.support_purge_old();");
  });

  it("runs the purge when it runs, and still calls the web app", async () => {
    const old = await conversation(LEARNER, "solved", "now() - interval '14 months'");
    await message(old, LEARNER, "learner");
    await asServer(() => db.exec("SELECT public.run_maintenance_sweep()"));
    expect(await n("public.support_conversations")).toBe(0);
    const call = (await db.query<{ url: string }>("SELECT url FROM public.net_calls")).rows[0]!;
    expect(call.url).toBe("https://learn.alphonsoecosystem.app/api/internal/maintenance");
  });
});

describe("who can reach it", () => {
  it("client roles can read nothing and call nothing; the server role can", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query("SELECT * FROM public.support_notify_queue")).rejects.toThrow(
          /permission denied/,
        );
        await expect(db.query("SELECT * FROM public.support_digest_seen")).rejects.toThrow(
          /permission denied/,
        );
        await expect(db.query("SELECT public.support_purge_old()")).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    }
    await asServer(async () => {
      await db.query("SELECT * FROM public.support_notify_queue");
      await db.query("SELECT public.support_purge_old()");
    });
  });

  it("declares the grant marker for both new tables and turns row security on", () => {
    expect(MIGRATION).toContain("-- client-grants: none public.support_notify_queue");
    expect(MIGRATION).toContain("-- client-grants: none public.support_digest_seen");
    expect(MIGRATION).toMatch(/ALTER TABLE public\.support_notify_queue ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/ALTER TABLE public\.support_digest_seen ENABLE ROW LEVEL SECURITY/);
  });
});

describe("the trigger rule equals the TypeScript rule", () => {
  it("agrees on message kinds", async () => {
    for (const kind of ["learner", "ai", "staff", "system"] as const) {
      await db.exec("DELETE FROM public.support_notify_queue");
      const u = await db.query<{ id: string }>(
        "INSERT INTO auth.users(id) VALUES (gen_random_uuid()) RETURNING id",
      );
      const c = await conversation(u.rows[0]!.id);
      await message(c, u.rows[0]!.id, kind);
      const queued = (await n("public.support_notify_queue")) === 1;
      expect(queued).toBe(
        shouldQueueNotice(kind, { hasPending: false, lastDeliveredAt: null }, new Date()),
      );
    }
  });
});
