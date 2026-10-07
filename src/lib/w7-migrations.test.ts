import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const FILES = {
  filter: "20261008130000_moderation_filter_v2.sql",
  names: "20261008130100_display_name_onboarding.sql",
  members: "20261008130200_team_members_block_filter.sql",
  reports: "20261008130300_content_reports_moderation_ops.sql",
  grants: "20261008130400_function_grants_hardening.sql",
  teams: "20261008130500_team_integrity.sql",
  quests: "20261008130600_weekly_quest_integrity.sql",
  matching: "20261008130700_buddy_matching_hardening.sql",
  profilesOwnRow: "20261008130800_profiles_own_row_read.sql",
  matchingPaused: "20261008130900_buddy_matching_paused.sql",
} as const;
const read = (file: string) => fs.readFileSync(path.join(DIR, file), "utf8");

/** One CREATE OR REPLACE FUNCTION statement, header through the closing `$$;`. */
function fn(file: string, name: string): string {
  const sql = read(file);
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined in ${file}`);
  const bodyStart = sql.indexOf("$$", start);
  return sql.slice(start, sql.indexOf("$$;", bodyStart + 2) + 3);
}
const header = (stmt: string) => stmt.slice(0, stmt.indexOf("$$"));

describe("W7 migrations: ordering", () => {
  it("are unique, in order, and after buddy matching", () => {
    const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
    const ours = Object.values(FILES);
    for (const f of ours) {
      expect(all, f).toContain(f);
      expect(f > "20261007120000_buddy_matching.sql").toBe(true);
      expect(all.filter((x) => x.slice(0, 14) === f.slice(0, 14))).toHaveLength(1);
    }
    expect([...ours].sort()).toEqual(ours);
  });
});

describe("moderation filter v2", () => {
  const file = FILES.filter;
  const helpers = [
    "moderation_clean_text(text)",
    "normalize_for_moderation(text)",
    "blocked_moderation_terms()",
    "moderation_anywhere_patterns()",
    "moderation_edge_patterns()",
    "moderation_contextual_terms()",
    "moderation_context_markers()",
    "moderation_allowlist_pattern()",
    "contains_blocked_term(text)",
    "enforce_display_name_filter()",
  ];

  it("pins search_path on every function", () => {
    for (const sig of [...helpers, "display_name_problem(text)"]) {
      const name = sig.slice(0, sig.indexOf("("));
      expect(header(fn(file, name)), name).toMatch(/SET search_path = ''/);
    }
  });

  it("no client role may read the lists or run the matcher directly", () => {
    const sql = read(file);
    for (const sig of helpers) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
    }
    // Every GRANT that names a helper, in any position of a multi-function list, may go only to service_role.
    const grants = sql
      .split(";")
      .map((stmt) => stmt.replace(/--[^\n]*/g, "").trim())
      .filter((stmt) => /^GRANT\b/i.test(stmt) && helpers.some((sig) => stmt.includes(`public.${sig}`)));
    expect(grants.length).toBeGreaterThan(0);
    for (const stmt of grants) {
      const to = stmt.slice(stmt.search(/\bTO\b/i));
      expect(to, stmt).not.toMatch(/\b(anon|authenticated|public)\b/i);
    }
  });

  it("admin_rename_team is a service-only definer", () => {
    const head = header(fn(file, "admin_rename_team"));
    expect(head).toMatch(/SECURITY DEFINER/);
    expect(head).toMatch(/SET search_path = public/);
    expect(read(file)).toContain("REVOKE ALL ON FUNCTION public.admin_rename_team(uuid, text) FROM PUBLIC, anon, authenticated;");
    expect(read(file)).toContain("GRANT EXECUTE ON FUNCTION public.admin_rename_team(uuid, text) TO service_role;");
  });

  it("the trigger and the verdict run as definer, so revoking the helpers cannot break a client write", () => {
    expect(header(fn(file, "enforce_display_name_filter"))).toMatch(/SECURITY DEFINER/);
    expect(header(fn(file, "display_name_problem"))).toMatch(/SECURITY DEFINER/);
    expect(read(file)).toContain("GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;");
  });

  it("folds NFKC, strips invisible and bidi characters, and drops combining marks", () => {
    const clean = fn(file, "moderation_clean_text");
    expect(clean).toContain("normalize(coalesce(input, ''), NFKC)");
    for (const range of ["\\u200B-\\u200F", "\\u202A-\\u202E", "\\u2066-\\u206F", "\\uFEFF", "\\u3164"]) {
      expect(clean, range).toContain(range);
    }
    expect(fn(file, "normalize_for_moderation")).toContain("'[\\u0300-\\u036f]'");
  });

  it("keeps the list in normalized ASCII and moves name-words to the contextual list", () => {
    // Only the array literal: the header's `search_path = ''` would otherwise pair up with the first term's quote.
    const arrayOf = (name: string) => {
      const stmt = fn(file, name);
      return [...stmt.slice(stmt.indexOf("ARRAY[")).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    const terms = arrayOf("blocked_moderation_terms");
    expect(terms.length).toBeGreaterThanOrEqual(40);
    for (const t of terms) expect(t, t).toMatch(/^[a-z]+$/);
    for (const name of ["dick", "cock", "coon", "cox", "gay"]) expect(terms).not.toContain(name);
    const contextual = arrayOf("moderation_contextual_terms");
    expect(contextual).toEqual(["dick", "cock", "coon", "cox", "gay"]);
  });

  it("the trigger raises 23514 with the blocked-content code clients map", () => {
    expect(fn(file, "enforce_display_name_filter")).toContain("RAISE EXCEPTION 'blocked-content' USING ERRCODE = '23514';");
  });
});

describe("display-name onboarding", () => {
  const file = FILES.names;

  it("adds name_confirmed_at as a nullable column", () => {
    expect(read(file)).toContain("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_confirmed_at timestamptz NULL;");
  });

  it("confirm_display_name is a definer RPC only signed-in users may call", () => {
    const stmt = fn(file, "confirm_display_name");
    expect(header(stmt)).toMatch(/RETURNS text\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/);
    expect(stmt).toContain("public.display_name_problem(_name)");
    expect(stmt).toContain("name_confirmed_at = now()");
    expect(read(file)).toContain("REVOKE ALL ON FUNCTION public.confirm_display_name(text) FROM PUBLIC, anon;");
    expect(read(file)).toContain("GRANT EXECUTE ON FUNCTION public.confirm_display_name(text) TO authenticated;");
  });

  it("generate_learner_handle has no client EXECUTE and the documented shape", () => {
    const stmt = fn(file, "generate_learner_handle");
    expect(stmt).toContain("'Learner-' || upper(substr(md5(");
    expect(stmt).toMatch(/FOR i IN 1\.\.50 LOOP/);
    expect(stmt).toContain("public.display_name_problem(candidate) IS NULL");
    expect(read(file)).toContain("REVOKE ALL ON FUNCTION public.generate_learner_handle() FROM PUBLIC, anon, authenticated;");
  });

  it("handle_new_user falls back to a handle and never raises a name error", () => {
    const stmt = fn(file, "handle_new_user");
    expect(stmt).not.toMatch(/RAISE\s+EXCEPTION/);
    expect(stmt).toContain("public.generate_learner_handle()");
    expect(stmt).toContain("lower(split_part(NEW.email, '@', 1))");
    expect(stmt).toMatch(/EXCEPTION WHEN check_violation OR raise_exception THEN/);
  });

  it("the backup table is service-only and the grant guard accepts the file", () => {
    expect(read(file)).toContain("-- client-grants: none public.display_name_migration_backup");
    expect(checkNewTableGrants(read(file))).toEqual([]);
  });
});

describe("team members block filter", () => {
  it("excludes blocks in both directions and keeps the grants", () => {
    const stmt = fn(FILES.members, "get_team_members");
    expect(stmt).toContain("(bu.blocker = me AND bu.blocked = tm.user_id)");
    expect(stmt).toContain("(bu.blocker = tm.user_id AND bu.blocked = me)");
    expect(read(FILES.members)).toContain("REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;");
    expect(read(FILES.members)).toContain("GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated;");
  });
});

describe("content reports moderation ops", () => {
  const file = FILES.reports;
  it("adds kind and context with checks, and lets only AI reports omit the reported user", () => {
    const sql = read(file);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'user'");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS context jsonb NULL");
    expect(sql).toContain("CHECK (kind IN ('user', 'team_name', 'ai_response'))");
    expect(sql).toContain("CHECK ((kind = 'ai_response') = (reported IS NULL))");
    expect(sql).toContain("ALTER COLUMN reported DROP NOT NULL");
    expect(sql).not.toMatch(/GRANT (SELECT|UPDATE|DELETE|ALL)[^;]*content_reports[^;]*TO (anon|authenticated)/);
  });
  it("the notify trigger is definer-only, throttled, secret-gated and can never fail an insert", () => {
    const stmt = fn(file, "notify_content_report");
    expect(header(stmt)).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(stmt).toContain("WHERE name = 'report_notify_secret'");
    expect(stmt).toContain("'X-Report-Notify-Secret', secret");
    expect(stmt).toContain("interval '1 hour'");
    expect(stmt).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(read(file)).toContain("REVOKE ALL ON FUNCTION public.notify_content_report() FROM PUBLIC, anon, authenticated;");
    expect(read(file)).toContain("AFTER INSERT ON public.content_reports");
  });
});

describe("function grants hardening (L8)", () => {
  it("pins _random_team_name's search_path and revokes both functions from every client role", () => {
    const sql = read(FILES.grants);
    expect(sql).toContain("ALTER FUNCTION public._random_team_name() SET search_path = '';");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public._random_team_name() FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.notify_nudge_push() FROM PUBLIC, anon, authenticated;");
  });
  it("every W7 function revokes PUBLIC (a CREATE OR REPLACE never removes the default PUBLIC grant)", () => {
    for (const file of Object.values(FILES)) {
      const sql = read(file);
      for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/g)) {
        expect(sql, `${file}: ${m[1]}`).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${m[1]}\\([^)]*\\) FROM PUBLIC`));
      }
    }
  });
});

describe("team integrity", () => {
  const file = FILES.teams;
  it("join codes come from Crockford base32 and are never base64", () => {
    expect(fn(file, "_new_join_code")).toContain("'0123456789ABCDEFGHJKMNPQRSTVWXYZ'");
    for (const name of ["create_team", "auto_join_team"]) {
      expect(fn(file, name), name).toContain("public._new_join_code()");
      expect(fn(file, name), name).not.toContain("'base64'");
    }
    expect(read(file)).toContain("WHERE t.join_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$'");
  });
  it("one trigger hands the team on or closes it, for every way a member leaves", () => {
    const trig = fn(file, "_team_after_member_removed");
    expect(trig).toContain("ORDER BY m.joined_at, m.user_id");
    expect(trig).toContain("DELETE FROM public.teams t WHERE t.id = OLD.team_id;");
    expect(read(file)).toContain("AFTER DELETE ON public.team_members");
  });
  it("leave_team reports what happened to the team", () => {
    const stmt = fn(file, "leave_team");
    expect(stmt).toContain("'ownership-transferred'");
    expect(stmt).toContain("'team-disbanded'");
  });
  it("re-joining your own team is a no-op", () => {
    expect(fn(file, "_join_team_impl")).toMatch(/m\.user_id = _me AND m\.team_id = _team_id[\s\S]*RETURN QUERY SELECT true, NULL::text, _team_id;/);
  });
  it("no weekly team bonus when nobody earned XP", () => {
    expect(fn(file, "get_my_team")).toContain("HAVING COALESCE(SUM(public.weekly_xp(tm2.user_id, prev_wk)), 0) > 0");
  });
});


describe("weekly quest integrity", () => {
  const stmt = () => fn(FILES.quests, "claim_weekly_quest");
  it("derives the week server-side, in UTC, and refuses any other week", () => {
    expect(header(stmt())).toMatch(/SET timezone = 'UTC'/);
    expect(stmt()).toContain("IF _week_start IS DISTINCT FROM wk THEN");
    expect(stmt()).not.toContain("CURRENT_DATE - INTERVAL '7 days'");
  });
  it("validates the course and refuses a course with no progress before recording a claim", () => {
    const s = stmt();
    expect(s).toContain("_course NOT IN ('en', 'fr', 'es')");
    expect(s.indexOf("'no-course-progress'")).toBeGreaterThan(-1);
    expect(s.indexOf("'no-course-progress'")).toBeLessThan(s.indexOf("INSERT INTO public.user_weekly_quest_claims"));
  });
  it("records the paid course", () => {
    expect(read(FILES.quests)).toContain("ADD COLUMN IF NOT EXISTS course text NULL CHECK (course IN ('en', 'fr', 'es'))");
    expect(stmt()).toContain("(user_id, quest_id, week_start, course)");
  });
});


describe("buddy matching hardening", () => {
  const file = FILES.matching;
  it("stores the 13+ confirmation durably and rate-limits joins and matches", () => {
    const stmt = fn(file, "join_buddy_pool");
    expect(stmt).toContain("INSERT INTO public.buddy_age_confirmations");
    expect(stmt).toContain("'too_many_tries'");
    expect(stmt).toContain("'match_limit'");
    expect(stmt).toContain("interval '7 days'");
    expect(stmt.indexOf("'too_many_tries'")).toBeLessThan(stmt.indexOf("'age_required'"));
  });
  it("keeps the kill switch, block and past-pair checks it had", () => {
    const stmt = fn(file, "join_buddy_pool");
    expect(stmt).toContain("'matching_off'");
    expect(stmt).toContain("FROM public.blocked_users b");
    expect(stmt).toContain("FROM public.buddy_pairs past");
  });
  it("the new tables are service-only", () => {
    const sql = read(file);
    expect(sql).toContain("-- client-grants: none public.buddy_age_confirmations");
    expect(sql).toContain("-- client-grants: none public.buddy_pool_attempts");
    expect(checkNewTableGrants(sql)).toEqual([]);
  });
});


describe("W7 addendum: migration window", () => {
  it("every W7 file sorts after W1's reserved slot (20261008120000) and before W3's consent migration", () => {
    for (const f of Object.values(FILES)) {
      expect(f.slice(0, 14) >= "20261008130000", f).toBe(true);
      expect(f < "20261009100000_ai_consent.sql", f).toBe(true);
    }
  });
});

describe("profiles own-row read (A1, O3)", () => {
  const sql = () => read(FILES.profilesOwnRow);
  it("drops the read-all policy and adds an own-row SELECT policy for authenticated", () => {
    expect(sql()).toContain('DROP POLICY IF EXISTS "profiles_read_all_auth" ON public.profiles;');
    expect(sql()).toMatch(
      /CREATE POLICY profiles_select_own ON public\.profiles\s+FOR SELECT TO authenticated\s+USING \(\(SELECT auth\.uid\(\)\) = id\);/,
    );
  });
  it("does not touch table grants (own-row reads still need SELECT) and creates no view", () => {
    expect(sql()).not.toMatch(/\b(GRANT|REVOKE)\b[^;]*\bON (TABLE )?public\.profiles\b/i);
    expect(sql()).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?VIEW/i);
  });
  it("no later migration re-opens profiles to every signed-in user", () => {
    const later = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > FILES.profilesOwnRow);
    for (const f of later) {
      const text = read(f);
      expect(text, f).not.toMatch(/ON\s+public\.profiles\s+FOR\s+(SELECT|ALL)[^;]*USING\s*\(\s*true\s*\)/i);
      expect(text, f).not.toMatch(/"?profiles_read_all_auth"?/);
    }
  });
});


describe("kill switch mutes matched pairs (A3, O4)", () => {
  const file = FILES.matchingPaused;
  it("send_buddy_message refuses a match pair while the switch is off, after the pair check and before the rate limit", () => {
    const stmt = fn(file, "send_buddy_message");
    expect(stmt).toContain("'matching_paused'");
    expect(stmt).toMatch(/bp\.source = 'match'/);
    expect(stmt).toContain("FROM public.buddy_settings bs WHERE bs.id");
    const i = (s: string) => stmt.indexOf(s);
    expect(i("PERFORM public._lock_buddy_users(me, other);")).toBeLessThan(i("'matching_paused'"));
    expect(i("'matching_paused'")).toBeLessThan(i("'rate_limited'"));
    expect(i("'bad_preset'")).toBeLessThan(i("'matching_paused'"));
  });
  it("get_my_buddy is dropped, recreated with matching_enabled last, and keeps its grants", () => {
    const sql = read(file);
    expect(sql).toContain("DROP FUNCTION public.get_my_buddy();");
    expect(header(fn(file, "get_my_buddy"))).toMatch(/is_match boolean,\s*matching_enabled boolean\)/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated, service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.send_buddy_message(text) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.send_buddy_message(text) TO authenticated, service_role;");
  });
});

