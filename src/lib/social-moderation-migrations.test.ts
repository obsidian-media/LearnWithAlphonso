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
  ownerSeesBlocked: "20261008131000_team_members_owner_sees_blocked.sql",
  nameReset: "20261008131100_reset_failing_public_names.sql",
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

describe("social and moderation migrations: ordering", () => {
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
    "moderation_accented_allowlist_pattern()",
    "moderation_fold(text)",
    "moderation_anatomy_terms()",
    "moderation_anatomy_markers()",
    "contains_blocked_term(text)",
    "team_name_problem(text)",
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
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`,
      );
    }
    // Every GRANT that names a helper, in any position of a multi-function list, may go only to service_role.
    const grants = sql
      .split(";")
      .map((stmt) => stmt.replace(/--[^\n]*/g, "").trim())
      .filter(
        (stmt) => /^GRANT\b/i.test(stmt) && helpers.some((sig) => stmt.includes(`public.${sig}`)),
      );
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
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public.admin_rename_team(uuid, text) FROM PUBLIC, anon, authenticated;",
    );
    expect(read(file)).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_rename_team(uuid, text) TO service_role;",
    );
  });

  it("the trigger and the verdict run as definer, so revoking the helpers cannot break a client write", () => {
    expect(header(fn(file, "enforce_display_name_filter"))).toMatch(/SECURITY DEFINER/);
    expect(header(fn(file, "display_name_problem"))).toMatch(/SECURITY DEFINER/);
    expect(read(file)).toContain(
      "GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;",
    );
  });

  it("stores NFKC text without default-ignorable characters, but keeps ZWNJ and ZWJ (Persian and Indic names)", () => {
    const clean = fn(file, "moderation_clean_text");
    expect(clean).toContain("normalize(coalesce(input, ''), NFKC)");
    for (const range of [
      "\\u200B",
      "\\u180B-\\u180F",
      "\\u202A-\\u202E",
      "\\u2060-\\u206F",
      "\\uFE00-\\uFE0F",
      "\\uFEFF",
      "\\u3164",
      "\\U0001D173-\\U0001D17A",
      "\\U000E0000-\\U000E0FFF",
    ]) {
      expect(clean, range).toContain(range);
    }
    expect(clean).not.toMatch(/\\u200[CD]|\\u200B-/);
  });

  it("compares without ZWNJ, ZWJ or any combining mark", () => {
    const fold = fn(file, "moderation_fold");
    expect(fold).toContain("'[\\u200C\\u200D]'");
    for (const range of [
      "\\u0300-\\u036F",
      "\\u1AB0-\\u1AFF",
      "\\u1DC0-\\u1DFF",
      "\\u20D0-\\u20FF",
      "\\uFE20-\\uFE2F",
    ]) {
      expect(fold, range).toContain(range);
    }
    expect(fn(file, "normalize_for_moderation")).toContain("public.moderation_fold(input)");
  });

  it("checks a second form with punctuation inside words deleted, so a dot or hyphen cannot split a word", () => {
    const stmt = fn(file, "contains_blocked_term");
    expect(stmt).toContain("UNION ALL");
    expect(stmt).toContain("'[^a-z0-9*\\s]+', ''");
    expect(stmt).toContain("public.moderation_accented_allowlist_pattern()");
  });

  it("keeps the list in normalized ASCII and moves name-words and ambiguous words to the contextual list", () => {
    // Only the array literal: the header's `search_path = ''` would otherwise pair up with the first term's quote.
    const arrayOf = (name: string) => {
      const stmt = fn(file, name);
      return [...stmt.slice(stmt.indexOf("ARRAY[")).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    const contextualWords = ["dick", "cock", "coon", "cox", "gay", "nazi", "negre", "cono", "paki"];
    const terms = arrayOf("blocked_moderation_terms");
    expect(terms.length).toBeGreaterThanOrEqual(35);
    for (const t of terms) expect(t, t).toMatch(/^[a-z]+$/);
    for (const name of contextualWords) expect(terms).not.toContain(name);
    expect(arrayOf("moderation_contextual_terms")).toEqual(contextualWords);
    expect(arrayOf("moderation_anatomy_terms")).toEqual(["dick", "cock", "cox"]);
    // Possessives and sizes only count next to an anatomy word: "My Gay Uncle" is a name, "Big Dick" is not.
    const neutral = [
      "my",
      "your",
      "ur",
      "big",
      "huge",
      "tiny",
      "small",
      "hard",
      "head",
      "face",
      "hole",
    ];
    const markers = arrayOf("moderation_context_markers");
    for (const m of neutral) expect(markers, m).not.toContain(m);
    expect(arrayOf("moderation_anatomy_markers")).toEqual(neutral);
    const allow = fn(file, "moderation_allowlist_pattern");
    for (const name of ["shital", "shitanshu"]) expect(allow, name).toContain(name);
  });

  it("refuses bidi override and isolate characters in the raw name, before cleaning hides them", () => {
    const stmt = fn(file, "display_name_problem");
    expect(stmt).toContain("coalesce(_name, '') ~ '[\\u202A-\\u202E\\u2066-\\u2069]'");
    const trig = fn(file, "enforce_display_name_filter");
    expect(trig.indexOf("public.display_name_problem(NEW.display_name)")).toBeLessThan(
      trig.indexOf(
        "NEW.display_name := coalesce(public.moderation_clean_text(NEW.display_name), '')",
      ),
    );
  });

  it("team names use the same rules and are stored cleaned", () => {
    expect(fn(file, "team_name_problem")).toContain("public.display_name_problem(_name)");
    const rename = fn(file, "admin_rename_team");
    expect(rename).toContain("public.team_name_problem(_name)");
    expect(rename).toContain("SET name = public.moderation_clean_text(_name)");
  });

  it("the trigger raises 23514 with the blocked-content code clients map", () => {
    expect(fn(file, "enforce_display_name_filter")).toContain(
      "RAISE EXCEPTION 'blocked-content' USING ERRCODE = '23514';",
    );
  });
});

describe("display-name onboarding", () => {
  const file = FILES.names;

  it("adds name_confirmed_at as a nullable column", () => {
    expect(read(file)).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_confirmed_at timestamptz NULL;",
    );
  });

  it("confirm_display_name is a definer RPC only signed-in users may call", () => {
    const stmt = fn(file, "confirm_display_name");
    expect(header(stmt)).toMatch(
      /RETURNS text\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/,
    );
    expect(stmt).toContain("public.display_name_problem(_name)");
    expect(stmt).toContain("name_confirmed_at = now()");
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public.confirm_display_name(text) FROM PUBLIC, anon;",
    );
    expect(read(file)).toContain(
      "GRANT EXECUTE ON FUNCTION public.confirm_display_name(text) TO authenticated;",
    );
  });

  it("generate_learner_handle has no client EXECUTE and the documented shape", () => {
    const stmt = fn(file, "generate_learner_handle");
    expect(stmt).toContain("'Learner-' || upper(substr(md5(");
    expect(stmt).toMatch(/FOR i IN 1\.\.50 LOOP/);
    expect(stmt).toContain("public.display_name_problem(candidate) IS NULL");
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public.generate_learner_handle() FROM PUBLIC, anon, authenticated;",
    );
  });

  it("handle_new_user falls back to a handle and never raises a name error", () => {
    const stmt = fn(file, "handle_new_user");
    expect(stmt).not.toMatch(/RAISE\s+EXCEPTION/);
    expect(stmt).toContain("public.generate_learner_handle()");
    expect(stmt).toContain("lower(split_part(NEW.email, '@', 1))");
    expect(stmt).toMatch(/EXCEPTION WHEN check_violation OR raise_exception THEN/);
  });
  it("handle_new_user judges the raw metadata name, so a bidi trick falls back to a handle", () => {
    expect(fn(FILES.names, "handle_new_user")).toContain(
      "public.display_name_problem(raw_name) IS NOT NULL",
    );
  });
  it("the self-rename trigger judges the raw name before storing the cleaned one", () => {
    const trig = fn(FILES.names, "enforce_display_name_filter");
    expect(trig.indexOf("public.display_name_problem(NEW.display_name)")).toBeLessThan(
      trig.indexOf(
        "NEW.display_name := coalesce(public.moderation_clean_text(NEW.display_name), '')",
      ),
    );
  });

  it("the backup table is readable by its owner only (it is in the data export) and the grant guard accepts the file", () => {
    const sql = read(file);
    expect(sql).toMatch(
      /CREATE POLICY display_name_migration_backup_select_own ON public\.display_name_migration_backup\s+FOR SELECT TO authenticated\s+USING \(\(SELECT auth\.uid\(\)\) = user_id\);/,
    );
    expect(sql).toContain("GRANT SELECT ON public.display_name_migration_backup TO authenticated;");
    expect(sql).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.display_name_migration_backup TO [^;]*\b(anon|authenticated)\b/,
    );
    expect(checkNewTableGrants(sql)).toEqual([]);
  });
});

describe("team members block filter", () => {
  it("excludes blocks in both directions and keeps the grants", () => {
    const stmt = fn(FILES.members, "get_team_members");
    expect(stmt).toContain("(bu.blocker = me AND bu.blocked = tm.user_id)");
    expect(stmt).toContain("(bu.blocker = tm.user_id AND bu.blocked = me)");
    expect(read(FILES.members)).toContain(
      "REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC, anon;",
    );
    expect(read(FILES.members)).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated;",
    );
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
    expect(sql).not.toMatch(
      /GRANT (SELECT|UPDATE|DELETE|ALL)[^;]*content_reports[^;]*TO (anon|authenticated)/,
    );
  });
  it("the notify trigger is definer-only, throttled, secret-gated and can never fail an insert", () => {
    const stmt = fn(file, "notify_content_report");
    expect(header(stmt)).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(stmt).toContain("WHERE name = 'report_notify_secret'");
    expect(stmt).toContain("'X-Report-Notify-Secret', secret");
    expect(stmt).toContain("interval '1 hour'");
    expect(stmt).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public.notify_content_report() FROM PUBLIC, anon, authenticated;",
    );
    expect(read(file)).toContain("AFTER INSERT ON public.content_reports");
  });
});

describe("function grants hardening", () => {
  it("pins _random_team_name's search_path and revokes both functions from every client role", () => {
    const sql = read(FILES.grants);
    expect(sql).toContain("ALTER FUNCTION public._random_team_name() SET search_path = '';");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._random_team_name() FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.notify_nudge_push() FROM PUBLIC, anon, authenticated;",
    );
  });
  it("every function in these migrations revokes PUBLIC (a CREATE OR REPLACE never removes the default PUBLIC grant)", () => {
    for (const file of Object.values(FILES)) {
      const sql = read(file);
      for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/g)) {
        expect(sql, `${file}: ${m[1]}`).toMatch(
          new RegExp(`REVOKE ALL ON FUNCTION public\\.${m[1]}\\([^)]*\\) FROM PUBLIC`),
        );
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
    expect(fn(file, "_join_team_impl")).toMatch(
      /m\.user_id = _me AND m\.team_id = _team_id[\s\S]*RETURN QUERY SELECT true, NULL::text, _team_id;/,
    );
  });
  it("no weekly team bonus when nobody earned XP", () => {
    expect(fn(file, "get_my_team")).toContain(
      "HAVING COALESCE(SUM(public.weekly_xp(tm2.user_id, prev_wk)), 0) > 0",
    );
  });
  it("a weekly tie always resolves to the same team", () => {
    expect(fn(file, "get_my_team")).toContain("DESC, t.id");
  });
  it("team names are judged by team_name_problem and stored cleaned", () => {
    const stmt = fn(file, "create_team");
    expect(stmt).toContain("public.team_name_problem(_name)");
    expect(stmt).toContain("public.moderation_clean_text(_name)");
    expect(stmt).not.toContain("trim(_name)");
  });
  it("auto_join_team never leaves an empty team behind when the join is refused", () => {
    const stmt = fn(file, "auto_join_team");
    expect(stmt).toMatch(
      /IF NOT join_result\.ok AND new_id IS NOT NULL THEN\s+DELETE FROM public\.teams t WHERE t\.id = new_id;/,
    );
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
    expect(s.indexOf("'no-course-progress'")).toBeLessThan(
      s.indexOf("INSERT INTO public.user_weekly_quest_claims"),
    );
  });
  it("records the paid course", () => {
    expect(read(FILES.quests)).toContain(
      "ADD COLUMN IF NOT EXISTS course text NULL CHECK (course IN ('en', 'fr', 'es'))",
    );
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
  it("the new tables are readable by their owner only (both are in the data export), writable by nobody but the RPC", () => {
    const sql = read(file);
    for (const t of ["buddy_age_confirmations", "buddy_pool_attempts"]) {
      expect(sql, t).toMatch(
        new RegExp(
          String.raw`CREATE POLICY ${t}_select_own ON public\.${t}\s+FOR SELECT TO authenticated\s+USING \(\(SELECT auth\.uid\(\)\) = user_id\);`,
        ),
      );
      expect(sql, t).toContain(`GRANT SELECT ON public.${t} TO authenticated;`);
      expect(sql, t).not.toMatch(
        new RegExp(
          String.raw`GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.${t} TO [^;]*\b(anon|authenticated)\b`,
        ),
      );
    }
    expect(checkNewTableGrants(sql)).toEqual([]);
  });
});

describe("migration window", () => {
  it("every file sorts after the storage migration slot (20261008120000) and before the consent migration", () => {
    for (const f of Object.values(FILES)) {
      expect(f.slice(0, 14) >= "20261008130000", f).toBe(true);
      expect(f < "20261009100000_ai_consent.sql", f).toBe(true);
    }
  });
});

describe("profiles own-row read", () => {
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
      expect(text, f).not.toMatch(
        /ON\s+public\.profiles\s+FOR\s+(SELECT|ALL)[^;]*USING\s*\(\s*true\s*\)/i,
      );
      expect(text, f).not.toMatch(/"?profiles_read_all_auth"?/);
    }
  });
});

describe("kill switch mutes matched pairs", () => {
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
    expect(header(fn(file, "get_my_buddy"))).toMatch(
      /is_match boolean,\s*matching_enabled boolean\)/,
    );
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated, service_role;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.send_buddy_message(text) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.send_buddy_message(text) TO authenticated, service_role;",
    );
  });
});

describe("owner sees blocked members to kick them", () => {
  const file = FILES.ownerSeesBlocked;
  it("adds blocked, shows the owner's own blocks only to the owner, hides blocks of the owner", () => {
    const stmt = fn(file, "get_team_members");
    expect(header(stmt)).toMatch(/is_owner boolean,\s*blocked boolean\)/);
    expect(stmt).toContain("(bu.blocker = tm.user_id AND bu.blocked = me)"); // they blocked me: hidden, always
    expect(stmt).toMatch(/i_own OR NOT EXISTS/);
    expect(read(file)).toContain("DROP FUNCTION public.get_team_members();");
    expect(read(file)).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated, service_role;",
    );
  });
});

describe("reset of failing names", () => {
  const file = FILES.nameReset;
  it("handles loop until they pass the filter", () => {
    const stmt = fn(file, "generate_learner_handle");
    expect(stmt).toMatch(/FOR i IN 1\.\.50 LOOP/);
    expect(stmt).toContain("public.display_name_problem(candidate) IS NULL");
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public.generate_learner_handle() FROM PUBLIC, anon, authenticated;",
    );
  });
  it("the reset refuses to run past the owner-approved counts and is service-only", () => {
    const stmt = fn(file, "_reset_failing_public_names");
    expect(stmt).toContain("name-reset-not-approved");
    expect(stmt.indexOf("name-reset-not-approved")).toBeLessThan(
      stmt.indexOf("UPDATE public.profiles"),
    );
    expect(stmt).toContain("name_confirmed_at = NULL");
    expect(read(file)).toContain(
      "REVOKE ALL ON FUNCTION public._reset_failing_public_names(integer, integer) FROM PUBLIC, anon, authenticated;",
    );
    expect(read(file)).toMatch(/SELECT \* FROM public\._reset_failing_public_names\(\d+, \d+\);/);
  });
  it("the reset judges team names with the same rule as create_team", () => {
    const stmt = fn(file, "_reset_failing_public_names");
    expect(stmt.match(/public\.team_name_problem\(t\.name\) IS NOT NULL/g)?.length).toBe(2);
  });
  it("the team backup table is service-only", () => {
    expect(read(file)).toContain("-- client-grants: none public.team_name_migration_backup");
    expect(checkNewTableGrants(read(file))).toEqual([]);
  });
});
