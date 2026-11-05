import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The 2026-11-05 limits migrations, run on real Postgres (PGlite) against a fixture that reproduces the live
 * privileges and the deployed function bodies (read from the earlier migration files). Each block shows the old
 * behaviour first, then applies the migration and shows the new one, so the proof is falsifiable in one run.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

/** The CREATE FUNCTION statement for public.<name> as one earlier migration deployed it. */
function deployedFunction(file: string, name: string): string {
  const sql = read(file);
  const m = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(sql);
  if (!m) throw new Error(`${name} not found in ${file}`);
  return m[0];
}

const DEFAULTS = read("20261105100000_function_default_privileges.sql");
const LIMITS = read("20261105100100_client_write_limits.sql");
const COUNTRY = read("20261105100200_profile_country_code.sql");
const BUCKET = read("20261105100300_podcast_audio_no_listing.sql");
const PLACEMENT = read("20261105100400_placement_result_bounds.sql");
const DUELS = read("20261105100500_open_duel_safeguards.sql");
const RETENTION = read("20261105100600_retention_and_push_secret.sql");

const ME = "00000000-0000-4000-8000-000000000001";
const FRIEND = "00000000-0000-4000-8000-000000000002";
const STRANGER = "00000000-0000-4000-8000-000000000003";
const HEX_TOKEN = "ab".repeat(32);

/** Live-like state before these migrations: Supabase's old function defaults, the old grants and function bodies. */
const FIXTURE = `
  CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.uid', true), '')::uuid$$;
  GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
  CREATE SCHEMA net; CREATE TABLE net.calls (url text, headers jsonb, body jsonb);
  CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint
    LANGUAGE sql AS $$ INSERT INTO net.calls VALUES (url, headers, body); SELECT 1::bigint $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.objects (bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated;
  GRANT SELECT ON storage.objects TO anon, authenticated;
  CREATE POLICY "podcast_audio_public_read" ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'podcast-audio');
  INSERT INTO storage.objects VALUES ('podcast-audio', 'en/unreleased.mp3');

  CREATE TABLE public.friendships (user_id uuid, friend_id uuid, status text);
  GRANT SELECT ON public.friendships TO authenticated;
  ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
  CREATE POLICY f_all ON public.friendships FOR SELECT USING (true);

  CREATE TABLE public.nudges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid NOT NULL DEFAULT auth.uid(),
    recipient_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CHECK (sender_id <> recipient_id)
  );
  ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE ON public.nudges TO authenticated;
  CREATE POLICY "nudges_select_recipient" ON public.nudges FOR SELECT TO authenticated
    USING ((select auth.uid()) = recipient_id);
  CREATE POLICY "nudges_insert_to_friend" ON public.nudges FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = sender_id AND EXISTS (SELECT 1 FROM public.friendships f
      WHERE f.user_id = (select auth.uid()) AND f.friend_id = nudges.recipient_id AND f.status = 'accepted'));
  CREATE POLICY "nudges_update_recipient_read" ON public.nudges FOR UPDATE TO authenticated
    USING ((select auth.uid()) = recipient_id) WITH CHECK ((select auth.uid()) = recipient_id);
  ${deployedFunction("20260930070000_nudge_push_rate_limit.sql", "notify_nudge_push")}
  CREATE TRIGGER nudges_push_after_insert AFTER INSERT ON public.nudges
    FOR EACH ROW EXECUTE FUNCTION public.notify_nudge_push();

  CREATE TABLE public.weakness_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, category text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('detected', 'resolved')), created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.weakness_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY weakness_events_select_own ON public.weakness_events FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY weakness_events_insert_own ON public.weakness_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  GRANT SELECT, INSERT ON public.weakness_events TO authenticated;

  CREATE TABLE public.device_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), token text NOT NULL,
    platform text NOT NULL DEFAULT 'ios', created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, token));
  ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
  CREATE POLICY "device_tokens_select_own" ON public.device_tokens FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  CREATE POLICY "device_tokens_insert_own" ON public.device_tokens FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
  CREATE POLICY "device_tokens_update_own" ON public.device_tokens FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
  CREATE POLICY "device_tokens_delete_own" ON public.device_tokens FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
  ${deployedFunction("20261012400000_claim_device_token.sql", "claim_device_token")}
  REVOKE ALL ON FUNCTION public.claim_device_token(text, text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.claim_device_token(text, text) TO authenticated;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, country text);
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
  CREATE POLICY profiles_own ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  INSERT INTO public.profiles VALUES ('${ME}', NULL), ('${FRIEND}', 'fr'), ('${STRANGER}', 'DE');

  CREATE TABLE public.content_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter uuid NOT NULL DEFAULT auth.uid(), reported uuid,
    reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL DEFAULT 'user', context jsonb);
  ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
  CREATE POLICY content_reports_insert_own ON public.content_reports FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = reporter);
  GRANT INSERT (reported, reason, kind, context) ON public.content_reports TO authenticated;

  CREATE TABLE public.podcast_play_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, episode_id uuid NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(), seconds_listened integer NOT NULL DEFAULT 0);

  CREATE FUNCTION public.get_cohort_weekly_xp(_cohort_id uuid, _week_start date)
    RETURNS TABLE(user_id uuid, xp integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT NULL::uuid, 0 WHERE false $$;
  REVOKE ALL ON FUNCTION public.get_cohort_weekly_xp(uuid, date) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO service_role;

  CREATE TABLE public.language_progress (
    user_id uuid NOT NULL, language text NOT NULL, cefr_level text, placement_level text, placement_score integer,
    placement_taken_at timestamptz, xp integer NOT NULL DEFAULT 0, PRIMARY KEY (user_id, language));
  ${deployedFunction("20260920050000_revoke_direct_gamification_writes.sql", "save_placement_result")}
  REVOKE ALL ON FUNCTION public.save_placement_result(text, text, integer) FROM public, anon;
  GRANT EXECUTE ON FUNCTION public.save_placement_result(text, text, integer) TO authenticated, service_role;

  CREATE TABLE public.blocked_users (blocker uuid, blocked uuid);
  CREATE TABLE public.buddy_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), matching_enabled boolean NOT NULL DEFAULT true);
  INSERT INTO public.buddy_settings (id) VALUES (true);
  CREATE TABLE public.buddy_pool_exclusions (user_id uuid PRIMARY KEY, reason text);
  CREATE TABLE public.duel_queue (user_id uuid PRIMARY KEY, course text, cefr_level text, match_by_level boolean,
    queued_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.duels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), challenger_id uuid, opponent_id uuid,
    course text, status text, challenger_xp_start integer, opponent_xp_start integer, ends_at timestamptz);
  ${deployedFunction("20260928020000_block_and_report.sql", "join_open_duel_queue")}

  CREATE TABLE public.review_grade_attempts (created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.ai_usage (user_id uuid, day date, kind text, count integer, PRIMARY KEY (user_id, day, kind));
  CREATE TABLE public.friend_activity_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
    event_type text, created_at timestamptz NOT NULL DEFAULT now());
  ${deployedFunction("20261015100000_maintenance_sweep.sql", "run_maintenance_sweep")}
  INSERT INTO public.friendships VALUES ('${ME}', '${FRIEND}', 'accepted'), ('${FRIEND}', '${ME}', 'accepted');
`;

async function as(db: PGlite, uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`RESET ROLE; SET app.uid = '${uid}'; SET ROLE authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE");
  }
}

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
});

describe("function and sequence defaults", () => {
  it("before: a new function is callable by any signed-in user, and so was get_cohort_weekly_xp", async () => {
    await db.exec("CREATE FUNCTION public.new_helper() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$");
    await expect(as(db, ME, "SELECT public.new_helper()")).resolves.toBeTruthy();
    await expect(
      as(db, ME, "SELECT * FROM public.get_cohort_weekly_xp(gen_random_uuid(), current_date)"),
    ).resolves.toBeTruthy();
  });

  it("after: a new function is closed to signed-in and anonymous callers until granted", async () => {
    await db.exec(DEFAULTS);
    await db.exec("CREATE FUNCTION public.new_helper() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$");
    await expect(as(db, ME, "SELECT public.new_helper()")).rejects.toThrow(/permission denied/);
    await db.exec("GRANT EXECUTE ON FUNCTION public.new_helper() TO authenticated");
    await expect(as(db, ME, "SELECT public.new_helper()")).resolves.toBeTruthy();
  });

  it("after: get_cohort_weekly_xp is server-only", async () => {
    await db.exec(DEFAULTS);
    await expect(
      as(db, ME, "SELECT * FROM public.get_cohort_weekly_xp(gen_random_uuid(), current_date)"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("nudges", () => {
  const backdated = `INSERT INTO public.nudges (sender_id, recipient_id, created_at) VALUES ('${ME}', '${FRIEND}', '2000-01-01')`;
  const appSend = `INSERT INTO public.nudges (recipient_id) VALUES ('${FRIEND}')`;

  it("before: a back-dated nudge dodged the 24-hour push cooldown, so every insert pushed", async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES ('push_trigger_service_key', 'service-key')`,
    );
    for (let i = 0; i < 3; i++) await as(db, ME, backdated);
    expect((await db.query("SELECT 1 FROM net.calls")).rows).toHaveLength(3);
  });

  it("after: a client cannot choose created_at, so the cooldown counts real times (one push a day)", async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES ('push_trigger_service_key', 'service-key')`,
    );
    await db.exec(DEFAULTS + LIMITS + RETENTION);
    await expect(as(db, ME, backdated)).rejects.toThrow(/permission denied/);
    for (let i = 0; i < 3; i++) await as(db, ME, appSend);
    expect((await db.query("SELECT 1 FROM net.calls")).rows).toHaveLength(1);
  });

  it("after: the recipient can mark a nudge read but not rewrite who sent it", async () => {
    await db.exec(DEFAULTS + LIMITS);
    await as(db, ME, appSend);
    await expect(
      as(db, FRIEND, `UPDATE public.nudges SET read_at = now() WHERE recipient_id = '${FRIEND}'`),
    ).resolves.toBeTruthy();
    await expect(
      as(
        db,
        FRIEND,
        `UPDATE public.nudges SET sender_id = '${FRIEND}' WHERE recipient_id = '${FRIEND}'`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("after: a sender gets 20 nudges an hour, then is refused", async () => {
    await db.exec(DEFAULTS + LIMITS);
    for (let i = 0; i < 20; i++) await as(db, ME, appSend);
    await expect(as(db, ME, appSend)).rejects.toThrow(/rate-limited/);
  });
});

describe("push trigger credential", () => {
  it("before: every queued push request carried the service role key", async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES ('push_trigger_service_key', 'service-key')`,
    );
    await as(db, ME, `INSERT INTO public.nudges (recipient_id) VALUES ('${FRIEND}')`);
    const { rows } = await db.query<{ headers: Record<string, string> }>(
      "SELECT headers FROM net.calls",
    );
    expect(rows[0].headers.Authorization).toBe("Bearer service-key");
  });

  it("after: with the dedicated secret in Vault, the queued request carries only that secret", async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES ('push_trigger_service_key', 'service-key'), ('send_push_secret', 'push-secret')`,
    );
    await db.exec(DEFAULTS + LIMITS + RETENTION);
    await as(db, ME, `INSERT INTO public.nudges (recipient_id) VALUES ('${FRIEND}')`);
    const { rows } = await db.query<{ headers: Record<string, string> }>(
      "SELECT headers FROM net.calls",
    );
    expect(rows[0].headers["X-Send-Push-Secret"]).toBe("push-secret");
    expect(JSON.stringify(rows[0].headers)).not.toContain("service-key");
  });

  it("after: without the dedicated secret yet, pushes still go out with the older header", async () => {
    await db.exec(
      `INSERT INTO vault.decrypted_secrets VALUES ('push_trigger_service_key', 'service-key')`,
    );
    await db.exec(DEFAULTS + LIMITS + RETENTION);
    await as(db, ME, `INSERT INTO public.nudges (recipient_id) VALUES ('${FRIEND}')`);
    expect((await db.query("SELECT 1 FROM net.calls")).rows).toHaveLength(1);
  });
});

describe("weakness events and device tokens", () => {
  it("before: a client could write a 1 MB category and a path-shaped push token directly", async () => {
    await as(
      db,
      ME,
      "INSERT INTO public.weakness_events (user_id, category, event_type) VALUES ($1, $2, 'detected')",
      [ME, "x".repeat(1_000_000)],
    );
    await as(
      db,
      ME,
      "INSERT INTO public.device_tokens (user_id, token, platform) VALUES ($1, 'x/../../y', 'ios')",
      [ME],
    );
  });

  it("after: clients cannot write weakness events at all; the server's labels fit the 64-character limit", async () => {
    await db.exec(DEFAULTS + LIMITS);
    await expect(
      as(
        db,
        ME,
        "INSERT INTO public.weakness_events (user_id, category, event_type) VALUES ($1, 'past-tense', 'detected')",
        [ME],
      ),
    ).rejects.toThrow(/permission denied/);
    await db.query(
      "INSERT INTO public.weakness_events (user_id, category, event_type) VALUES ($1, 'past-tense', 'detected')",
      [ME],
    );
    await expect(
      db.query(
        "INSERT INTO public.weakness_events (user_id, category, event_type) VALUES ($1, $2, 'detected')",
        [ME, "x".repeat(65)],
      ),
    ).rejects.toThrow(/weakness_events_category_len/);
  });

  it("after: tokens are registered only through claim_device_token, and an iOS token must be hex", async () => {
    await db.exec(DEFAULTS + LIMITS);
    await expect(
      as(
        db,
        ME,
        "INSERT INTO public.device_tokens (user_id, token, platform) VALUES ($1, $2, 'ios')",
        [ME, HEX_TOKEN],
      ),
    ).rejects.toThrow(/permission denied/);
    await as(db, ME, "SELECT public.claim_device_token($1, 'ios')", [HEX_TOKEN]);
    await as(db, ME, "SELECT public.claim_device_token('fcm:APA91b-token_value', 'android')");
    await expect(
      as(db, ME, "SELECT public.claim_device_token('x/../../y', 'ios')"),
    ).rejects.toThrow(/device_tokens_apns_hex/);
    // Sign-out cleanup still removes the device's own row.
    await as(db, ME, "DELETE FROM public.device_tokens WHERE token = 'fcm:APA91b-token_value'");
    expect((await db.query("SELECT token FROM public.device_tokens")).rows).toEqual([
      { token: HEX_TOKEN },
    ]);
  });

  it("after: existing rows that could never receive a push are removed by the migration", async () => {
    await db.query(
      "INSERT INTO public.device_tokens (user_id, token, platform) VALUES ($1, 'x/../../y', 'ios')",
      [ME],
    );
    await db.exec(DEFAULTS + LIMITS);
    expect((await db.query("SELECT 1 FROM public.device_tokens")).rows).toHaveLength(0);
  });
});

describe("reports and play events", () => {
  const report = `INSERT INTO public.content_reports (reported, reason) VALUES ('${FRIEND}', 'spam')`;

  it("before: reports had no per-account cap", async () => {
    for (let i = 0; i < 25; i++) await as(db, ME, report);
  });

  it("after: 20 reports an hour, then refused", async () => {
    await db.exec(DEFAULTS + LIMITS);
    for (let i = 0; i < 20; i++) await as(db, ME, report);
    await expect(as(db, ME, report)).rejects.toThrow(/rate-limited/);
  });

  it("after: past 120 play events an hour, extra events are dropped without an error", async () => {
    await db.exec(DEFAULTS + LIMITS);
    await db.query(
      "INSERT INTO public.podcast_play_events (user_id, episode_id) SELECT $1, gen_random_uuid() FROM generate_series(1, 130)",
      [ME],
    );
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.podcast_play_events",
    );
    expect(rows[0].n).toBe(120);
  });
});

describe("profile country", () => {
  it("before: any text could be shown beside a name on the leaderboards", async () => {
    await as(
      db,
      ME,
      `UPDATE public.profiles SET country = 'visit evil.example' WHERE id = '${ME}'`,
    );
  });

  it("after: only two upper-case letters, and bad existing values are cleared", async () => {
    await db.exec(COUNTRY);
    expect((await db.query("SELECT id, country FROM public.profiles ORDER BY id")).rows).toEqual([
      { id: ME, country: null },
      { id: FRIEND, country: null },
      { id: STRANGER, country: "DE" },
    ]);
    await expect(
      as(db, ME, `UPDATE public.profiles SET country = 'visit evil.example' WHERE id = '${ME}'`),
    ).rejects.toThrow(/profiles_country_iso2/);
    await as(db, ME, `UPDATE public.profiles SET country = 'FR' WHERE id = '${ME}'`);
  });
});

describe("podcast audio bucket", () => {
  it("before: anyone with the public key could list the bucket; after: nobody can", async () => {
    await db.exec("SET ROLE anon");
    expect((await db.query("SELECT name FROM storage.objects")).rows).toHaveLength(1);
    await db.exec("RESET ROLE");
    await db.exec(BUCKET);
    await db.exec("SET ROLE anon");
    expect((await db.query("SELECT name FROM storage.objects")).rows).toHaveLength(0);
    await db.exec("RESET ROLE");
  });
});

describe("placement result", () => {
  it("before: any score was stored", async () => {
    await as(db, ME, "SELECT public.save_placement_result('en', 'B1', 9999)");
  });

  it("after: the level must be a CEFR band and the score 0 to 100; a real result still saves", async () => {
    await db.exec(PLACEMENT);
    await expect(
      as(db, ME, "SELECT public.save_placement_result('en', 'B1', 9999)"),
    ).rejects.toThrow(/invalid-score/);
    await expect(as(db, ME, "SELECT public.save_placement_result('en', 'B1', -1)")).rejects.toThrow(
      /invalid-score/,
    );
    await expect(as(db, ME, "SELECT public.save_placement_result('en', 'Z9', 50)")).rejects.toThrow(
      /invalid-level/,
    );
    await as(db, ME, "SELECT public.save_placement_result('en', 'B1', 67)");
    expect((await db.query("SELECT placement_score FROM public.language_progress")).rows).toEqual([
      { placement_score: 67 },
    ]);
  });
});

describe("open duel queue", () => {
  const join = "SELECT * FROM public.join_open_duel_queue('en', false)";

  it("before: an excluded account was matched with a stranger", async () => {
    await db.query("INSERT INTO public.buddy_pool_exclusions (user_id) VALUES ($1)", [STRANGER]);
    await as(db, STRANGER, join);
    const { rows } = await as(db, ME, join);
    expect(rows[0]).toMatchObject({ matched: true });
  });

  it("after: an excluded account is never matched, either as the joiner or as the one waiting", async () => {
    await db.exec(DUELS);
    await db.query("INSERT INTO public.buddy_pool_exclusions (user_id) VALUES ($1)", [STRANGER]);
    await as(db, STRANGER, join);
    expect((await db.query("SELECT 1 FROM public.duel_queue")).rows).toHaveLength(0);
    await db.query(
      "INSERT INTO public.duel_queue (user_id, course, cefr_level, match_by_level) VALUES ($1, 'en', 'A1', false)",
      [STRANGER],
    );
    const { rows } = await as(db, ME, join);
    expect(rows[0]).toMatchObject({ matched: false });
  });

  it("after: the owner's switch stops matching; two ordinary learners still match when it is on", async () => {
    await db.exec(DUELS);
    await db.exec("UPDATE public.buddy_settings SET open_duels_enabled = false");
    await as(db, FRIEND, join);
    expect((await as(db, ME, join)).rows[0]).toMatchObject({ matched: false });
    await db.exec("UPDATE public.buddy_settings SET open_duels_enabled = true");
    await as(db, FRIEND, join);
    expect((await as(db, ME, join)).rows[0]).toMatchObject({ matched: true });
  });
});

describe("retention in the maintenance sweep", () => {
  it("removes old counters, nudges, activity and play events, and keeps league promotions and recent rows", async () => {
    await db.exec(DEFAULTS + LIMITS + RETENTION);
    await db.exec(
      `INSERT INTO public.ai_usage VALUES ($1, current_date - 91, 'chat', 1), ($1, current_date - 10, 'chat', 1);
       INSERT INTO public.friend_activity_events (user_id, event_type, created_at) VALUES
         ($1, 'lesson_completed', now() - interval '181 days'), ($1, 'league_promotion', now() - interval '400 days'),
         ($1, 'lesson_completed', now() - interval '1 day');
       INSERT INTO public.podcast_play_events (user_id, episode_id, started_at) VALUES
         ($1, gen_random_uuid(), now() - interval '401 days'), ($1, gen_random_uuid(), now());`.replace(
        /\$1/g,
        `'${ME}'`,
      ),
    );
    await db.query(
      `INSERT INTO public.nudges (sender_id, recipient_id, created_at) VALUES ($1, $2, now() - interval '91 days'), ($1, $2, now())`,
      [ME, FRIEND],
    );
    await db.exec("SELECT public.run_maintenance_sweep()");
    const count = async (t: string) =>
      (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${t}`)).rows[0].n;
    expect(await count("ai_usage")).toBe(1);
    expect(await count("nudges")).toBe(1);
    expect(await count("friend_activity_events")).toBe(2);
    expect(await count("podcast_play_events")).toBe(1);
  });
});
