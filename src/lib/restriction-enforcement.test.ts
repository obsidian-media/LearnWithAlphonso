import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, buildFullSchema } from "./__testutils__/full-schema";
import {
  BLOCKED_USERS_NON_SURFACES,
  RESTRICTION_EXEMPT_NOTES,
  SOCIAL_SURFACES,
  type SocialSurface,
} from "./social-surfaces";

/**
 * Block and ban enforcement (20261113100100), EXECUTED against the whole migration history in PGlite as seeded
 * users. Each entry of SOCIAL_SURFACES has a probe: a fresh pair (or group) of learners, a call as the viewer or
 * actor X, and a yes/no answer to "did X see or reach the other learner(s) Y?". Per entry and per kind (block,
 * ban), the probe must say yes with nobody restricted, and no once X (mode "actor") or Y (mode "other") is.
 */
const STAFF = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;
let counter = 0x1000;

beforeAll(async () => {
  db = await buildFullSchema();
}, 600_000);
afterAll(async () => {
  await db.close();
});

// ---------- seeding (as the table owner, which bypasses RLS) ----------
async function newUser(courses: string[] = ["en"], xp = 0): Promise<string> {
  const id = `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [
    id,
    `u${counter}@example.com`,
  ]);
  await db.query(
    "INSERT INTO public.profiles (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [id, `Learner${counter}`],
  );
  for (const course of courses) {
    await db.query(
      "INSERT INTO public.language_progress (user_id, language, xp) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [id, course, xp],
    );
  }
  return id;
}
async function befriend(a: string, b: string) {
  await db.query(
    "INSERT INTO public.friendships (user_id, friend_id, status) VALUES ($1,$2,'accepted'),($2,$1,'accepted')",
    [a, b],
  );
}
async function weekStart(): Promise<string> {
  return (
    await db.query<{ d: string }>(
      "SELECT (current_date - (extract(isodow from current_date)::int - 1))::text AS d",
    )
  ).rows[0]!.d;
}
async function setWeeklyXp(user: string, xp: number) {
  await db.query(
    "INSERT INTO public.weekly_xp_totals (user_id, week_start, xp) VALUES ($1,$2::date,$3) ON CONFLICT (user_id, week_start) DO UPDATE SET xp = $3",
    [user, await weekStart(), xp],
  );
}
async function newTeam(owner: string, members: string[], visibility = "public"): Promise<string> {
  const code = `T${(++counter).toString(36).toUpperCase().padStart(7, "0")}`;
  const t = await db.query<{ id: string }>(
    "INSERT INTO public.teams (name, join_code, visibility, created_by) VALUES ($1,$2,$3,$4) RETURNING id",
    [`Team ${counter}`, code, visibility, owner],
  );
  const id = t.rows[0]!.id;
  for (const m of [owner, ...members]) {
    await db.query(
      "INSERT INTO public.team_members (team_id, user_id, joined_at) VALUES ($1,$2, now() - interval '30 days') ON CONFLICT DO NOTHING",
      [id, m],
    );
  }
  return id;
}
async function newBuddyPair(x: string, y: string, source = "friend"): Promise<string> {
  const [a, b] = x < y ? [x, y] : [y, x];
  const p = await db.query<{ id: string }>(
    "INSERT INTO public.buddy_pairs (user_a, user_b, source) VALUES ($1,$2,$3) RETURNING id",
    [a, b, source],
  );
  const id = p.rows[0]!.id;
  await db.query("INSERT INTO public.buddy_members (user_id, pair_id) VALUES ($1,$3),($2,$3)", [
    x,
    y,
    id,
  ]);
  return id;
}

// ---------- restricting ----------
type Kind = "block" | "ban";
const restrict = (id: string, kind: Kind) =>
  asUser(
    db,
    "",
    () =>
      db.query("SELECT public.staff_set_restriction($1,'owner',$2,$3,'probe')", [STAFF, id, kind]),
    "service_role",
  );

// ---------- probes ----------
type Probe = {
  modes: ("actor" | "other")[];
  /**
   * `exposed` is true when X saw or reached ANY of the others (so a leak through one branch cannot hide behind
   * another); `exposedAll`, when given, is the stricter baseline check that X saw or reached ALL of them.
   */
  setup: () => Promise<{
    x: string;
    ys: string[];
    exposed: () => Promise<boolean>;
    exposedAll?: () => Promise<boolean>;
  }>;
};
const as = <T>(x: string, fn: () => Promise<T>) => asUser(db, x, fn);
const rows = async <T = Record<string, unknown>>(x: string, sql: string, args: unknown[] = []) =>
  (await as(x, () => db.query<T>(sql, args))).rows;

const PROBES: Record<string, Probe> = {
  accept_friend_invite: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await db.query("INSERT INTO public.friend_invite_codes (user_id, code) VALUES ($1,$2)", [
        y,
        `code${y.slice(-6)}`,
      ]);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ ok: boolean }>(x, "SELECT ok FROM public.accept_friend_invite($1)", [
              `code${y.slice(-6)}`,
            ])
          )[0]!.ok,
      };
    },
  },
  get_friend_invite_preview: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await db.query("INSERT INTO public.friend_invite_codes (user_id, code) VALUES ($1,$2)", [
        y,
        `pre${y.slice(-6)}`,
      ]);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ ok: boolean }>(x, "SELECT ok FROM public.get_friend_invite_preview($1)", [
              `pre${y.slice(-6)}`,
            ])
          )[0]!.ok,
      };
    },
  },
  get_friends_progress: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ user_id: string }>(x, "SELECT user_id FROM public.get_friends_progress()")
          ).some((r) => r.user_id === y),
      };
    },
  },
  fr_view_own: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows(
              x,
              "SELECT 1 FROM public.friendships WHERE user_id = $1 AND friend_id = $2",
              [y, x],
            )
          ).length > 0,
      };
    },
  },
  nudges_insert_to_friend: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      return {
        x,
        ys: [y],
        exposed: async () => {
          try {
            await as(x, () =>
              db.query("INSERT INTO public.nudges (sender_id, recipient_id) VALUES ($1,$2)", [
                x,
                y,
              ]),
            );
            return true;
          } catch {
            return false;
          }
        },
      };
    },
  },
  friend_activity_readable_by_friends: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      await db.query(
        "INSERT INTO public.friend_activity_events (user_id, event_type) VALUES ($1,'lesson_completed')",
        [y],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows(x, "SELECT 1 FROM public.friend_activity_events WHERE user_id = $1", [y]))
            .length > 0,
      };
    },
  },
  get_leaderboard: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const earner = await newUser(["en"], 50);
      const idle = await newUser(["en"], 0);
      await befriend(x, earner);
      await befriend(x, idle);
      await setWeeklyXp(earner, 40);
      return {
        x,
        ys: [earner, idle],
        // All three branches (weekly earners, weekly zero-fill, all-time), friends scope so other tests cannot crowd it.
        exposed: async () => {
          const weekly = await rows<{ user_id: string }>(
            x,
            "SELECT user_id FROM public.get_leaderboard('friends','weekly')",
          );
          const all = await rows<{ user_id: string }>(
            x,
            "SELECT user_id FROM public.get_leaderboard('friends','all')",
          );
          return [weekly, all].some((r) =>
            r.some((e) => e.user_id === earner || e.user_id === idle),
          );
        },
        exposedAll: async () => {
          const weekly = await rows<{ user_id: string }>(
            x,
            "SELECT user_id FROM public.get_leaderboard('friends','weekly')",
          );
          const all = await rows<{ user_id: string }>(
            x,
            "SELECT user_id FROM public.get_leaderboard('friends','all')",
          );
          return [weekly, all].every(
            (r) => r.some((e) => e.user_id === earner) && r.some((e) => e.user_id === idle),
          );
        },
      };
    },
  },
  get_my_league_standing: {
    modes: ["other"],
    setup: async () => {
      // Earlier probes' learners leave the tier, so the rank counts only this pair.
      await db.query(
        "UPDATE public.language_progress SET league_tier = 'bronze' WHERE language = 'es'",
      );
      const x = await newUser(["es"]);
      const y = await newUser(["es"]);
      await db.query(
        "UPDATE public.language_progress SET league_tier = 'diamond' WHERE user_id IN ($1,$2)",
        [x, y],
      );
      await setWeeklyXp(y, 80);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ size: number }>(x, "SELECT size FROM public.get_my_league_standing('es')")
          )[0]?.size === 2,
      };
    },
  },
  create_duel: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows<{ ok: boolean }>(x, "SELECT ok FROM public.create_duel($1,'en')", [y]))[0]!
            .ok,
      };
    },
  },
  respond_to_duel: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      const d = await db.query<{ id: string }>(
        "INSERT INTO public.duels (challenger_id, opponent_id, course) VALUES ($1,$2,'en') RETURNING id",
        [y, x],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ ok: boolean }>(x, "SELECT ok FROM public.respond_to_duel($1, true, 3)", [
              d.rows[0]!.id,
            ])
          )[0]!.ok,
      };
    },
  },
  join_open_duel_queue: {
    modes: ["actor", "other"],
    setup: async () => {
      // Course 'fr' is this probe's own queue, so only Y can be matched.
      const x = await newUser(["fr"]);
      const y = await newUser(["fr"]);
      await db.query("DELETE FROM public.duel_queue");
      await db.query(
        "INSERT INTO public.duel_queue (user_id, course, cefr_level) VALUES ($1,'fr','A1')",
        [y],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ matched: boolean }>(
              x,
              "SELECT matched FROM public.join_open_duel_queue('fr', false)",
            )
          )[0]!.matched,
      };
    },
  },
  get_my_duels: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await db.query(
        "INSERT INTO public.duels (challenger_id, opponent_id, course) VALUES ($1,$2,'en')",
        [y, x],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows(x, "SELECT 1 FROM public.get_my_duels() WHERE challenger_id = $1", [y]))
            .length > 0,
      };
    },
  },
  request_buddy: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ status: string }>(x, "SELECT status FROM public.request_buddy($1)", [y])
          )[0]!.status === "requested",
      };
    },
  },
  respond_buddy_request: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await befriend(x, y);
      const r = await db.query<{ id: string }>(
        "INSERT INTO public.buddy_requests (from_user, to_user) VALUES ($1,$2) RETURNING id",
        [y, x],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ status: string }>(
              x,
              "SELECT status FROM public.respond_buddy_request($1, true)",
              [r.rows[0]!.id],
            )
          )[0]!.status === "paired",
      };
    },
  },
  _create_buddy_pair: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await db.query<{ r: string }>("SELECT public._create_buddy_pair($1,$2,'match') AS r", [
              x,
              y,
            ])
          ).rows[0]!.r === "paired",
      };
    },
  },
  join_buddy_pool: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser(["es"]);
      const y = await newUser(["es"]);
      await db.query("DELETE FROM public.buddy_pool");
      await db.query(
        "INSERT INTO public.buddy_pool (user_id, course, cefr_level, age_confirmed_at) VALUES ($1,'es','A1', now())",
        [y],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ status: string }>(
              x,
              "SELECT status FROM public.join_buddy_pool('es', true)",
            )
          )[0]!.status === "paired",
      };
    },
  },
  get_buddy_requests: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await db.query("INSERT INTO public.buddy_requests (from_user, to_user) VALUES ($1,$2)", [
        y,
        x,
      ]);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ other_id: string }>(x, "SELECT other_id FROM public.get_buddy_requests()")
          ).some((r) => r.other_id === y),
      };
    },
  },
  get_my_buddy: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newBuddyPair(x, y);
      return {
        x,
        ys: [y],
        exposed: async () => (await rows(x, "SELECT 1 FROM public.get_my_buddy()")).length > 0,
      };
    },
  },
  get_buddy_messages: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      const pid = await newBuddyPair(x, y);
      await db.query(
        "INSERT INTO public.buddy_messages (pair_id, sender_id, preset_id) VALUES ($1,$2,'nice_work')",
        [pid, y],
      );
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows(x, "SELECT 1 FROM public.get_buddy_messages()")).length > 0,
      };
    },
  },
  send_buddy_message: {
    modes: ["actor", "other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newBuddyPair(x, y);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ status: string }>(
              x,
              "SELECT status FROM public.send_buddy_message('lets_study')",
            )
          )[0]!.status === "sent",
      };
    },
  },
  join_team: {
    modes: ["actor"],
    setup: async () => {
      const x = await newUser();
      const owner = await newUser();
      const tid = await newTeam(owner, []);
      const code = (
        await db.query<{ join_code: string }>("SELECT join_code FROM public.teams WHERE id = $1", [
          tid,
        ])
      ).rows[0]!.join_code;
      return {
        x,
        ys: [owner],
        exposed: async () =>
          (await rows<{ ok: boolean }>(x, "SELECT ok FROM public.join_team($1)", [code]))[0]!.ok,
      };
    },
  },
  join_public_team: {
    modes: ["actor"],
    setup: async () => {
      const x = await newUser();
      const owner = await newUser();
      const tid = await newTeam(owner, []);
      return {
        x,
        ys: [owner],
        exposed: async () =>
          (await rows<{ ok: boolean }>(x, "SELECT ok FROM public.join_public_team($1)", [tid]))[0]!
            .ok,
      };
    },
  },
  create_team: {
    modes: ["actor"],
    setup: async () => {
      const x = await newUser();
      return {
        x,
        ys: [],
        exposed: async () =>
          (
            await rows<{ ok: boolean }>(
              x,
              "SELECT ok FROM public.create_team('Study Owls', 'public', 30)",
            )
          )[0]!.ok,
      };
    },
  },
  auto_join_team: {
    modes: ["actor"],
    setup: async () => {
      const x = await newUser();
      return {
        x,
        ys: [],
        exposed: async () =>
          (await rows<{ ok: boolean }>(x, "SELECT ok FROM public.auto_join_team()"))[0]!.ok,
      };
    },
  },
  kick_team_member: {
    modes: ["actor"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newTeam(x, [y]);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows<{ ok: boolean }>(x, "SELECT ok FROM public.kick_team_member($1)", [y]))[0]!
            .ok,
      };
    },
  },
  get_team_members: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newTeam(x, [y]); // X owns the team: the owner sees even members they blocked, but never a restricted one
      return {
        x,
        ys: [y],
        exposed: async () =>
          (
            await rows<{ user_id: string }>(x, "SELECT user_id FROM public.get_team_members()")
          ).some((r) => r.user_id === y),
      };
    },
  },
  get_team_leaderboard: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      const tid = await newTeam(x, [y]);
      await setWeeklyXp(y, 700);
      return {
        x,
        ys: [y],
        exposed: async () =>
          ((
            await rows<{ team_id: string; weekly_xp: number }>(
              x,
              "SELECT team_id, weekly_xp FROM public.get_team_leaderboard()",
            )
          ).find((r) => r.team_id === tid)?.weekly_xp ?? 0) >= 700,
      };
    },
  },
  get_my_team: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newTeam(x, [y]);
      await setWeeklyXp(y, 900);
      return {
        x,
        ys: [y],
        exposed: async () =>
          ((
            await rows<{ this_week_xp: number }>(x, "SELECT this_week_xp FROM public.get_my_team()")
          )[0]?.this_week_xp ?? 0) >= 900,
      };
    },
  },
  team_members_select_own_team: {
    modes: ["other"],
    setup: async () => {
      const x = await newUser();
      const y = await newUser();
      await newTeam(x, [y]);
      return {
        x,
        ys: [y],
        exposed: async () =>
          (await rows(x, "SELECT 1 FROM public.team_members WHERE user_id = $1", [y])).length > 0,
      };
    },
  },
};

// ---------- the data-driven test ----------
describe("every social surface enforces block and ban", () => {
  it("has a probe for every listed surface, and no probe for an unlisted one", () => {
    const listed = SOCIAL_SURFACES.map((s) => s.name).sort();
    expect(Object.keys(PROBES).sort()).toEqual(listed);
    expect(new Set(listed).size).toBe(listed.length);
  });

  for (const kind of ["block", "ban"] as Kind[]) {
    describe(`a learner under a ${kind}`, () => {
      for (const surface of SOCIAL_SURFACES) {
        const probe = PROBES[surface.name];
        if (!probe) continue;
        for (const mode of probe.modes) {
          const title =
            mode === "actor"
              ? `${surface.name}: a ${kind}ed learner cannot act`
              : `${surface.name}: a ${kind}ed learner is invisible to or unreachable by others`;
          it(title, async () => {
            // Baseline: with nobody restricted the probe's call works, so a "no" below can only be the restriction.
            const baseline = await probe.setup();
            expect(await (baseline.exposedAll ?? baseline.exposed)(), "baseline must succeed").toBe(
              true,
            );

            const fresh = await probe.setup();
            for (const id of mode === "actor" ? [fresh.x] : fresh.ys) await restrict(id, kind);
            expect(await fresh.exposed()).toBe(false);
          });
        }
      }
    });
  }

  it("lifting the restriction restores everything (a read surface, end to end)", async () => {
    const probe = PROBES.get_friends_progress!;
    const s = await probe.setup();
    await restrict(s.ys[0]!, "block");
    expect(await s.exposed()).toBe(false);
    await asUser(
      db,
      "",
      () =>
        db.query("SELECT public.staff_lift_restriction($1,'owner',$2,'block','resolved')", [
          STAFF,
          s.ys[0],
        ]),
      "service_role",
    );
    expect(await s.exposed()).toBe(true);
  });

  it("restricted learners keep their own learning: own progress and own friend list still read", async () => {
    const x = await newUser(["en"], 120);
    const y = await newUser();
    await befriend(x, y);
    await restrict(x, "block");
    const own = await rows<{ xp: number }>(
      x,
      "SELECT xp FROM public.language_progress WHERE user_id = $1",
      [x],
    );
    expect(own[0]!.xp).toBe(120);
    const mine = await rows(x, "SELECT 1 FROM public.friendships WHERE user_id = $1", [x]);
    expect(mine).toHaveLength(1);
  });

  it("is_social_restricted is true for block or ban, false once lifted or for others", async () => {
    const u = await newUser();
    const check = async () =>
      asUser(
        db,
        "",
        async () =>
          (await db.query<{ r: boolean }>("SELECT public.is_social_restricted($1) AS r", [u]))
            .rows[0]!.r,
        "service_role",
      );
    expect(await check()).toBe(false);
    await restrict(u, "ban");
    expect(await check()).toBe(true);
  });
});

// ---------- the registry ----------
describe("the registry of social surfaces", () => {
  it("every function and policy that references blocked_users is in SOCIAL_SURFACES", async () => {
    const fns = await db.query<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosrc ILIKE '%blocked_users%'`,
    );
    const pols = await db.query<{ name: string }>(
      `SELECT policyname AS name FROM pg_policies
        WHERE schemaname = 'public' AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%blocked_users%'`,
    );
    const listed = new Set(SOCIAL_SURFACES.map((s) => s.name));
    const unlisted = [...fns.rows, ...pols.rows]
      .map((r) => r.name)
      .filter((n) => !listed.has(n) && !BLOCKED_USERS_NON_SURFACES.includes(n));
    expect(unlisted).toEqual([]);
  });

  it("every listed surface's CURRENT definition checks is_social_restricted (directly or through its helper)", async () => {
    const bad: string[] = [];
    for (const s of SOCIAL_SURFACES) {
      const text = await currentDefinition(s);
      const target = s.via
        ? await currentDefinition({ ...s, name: s.via, kind: "function" })
        : text;
      if (!/is_social_restricted/i.test(target)) bad.push(s.name);
    }
    expect(bad).toEqual([]);
  });

  it("every `defined` evidence file exists and mentions the object", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    for (const s of SOCIAL_SURFACES) {
      const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", s.defined), "utf8");
      expect(sql, `${s.defined} should mention ${s.name}`).toContain(s.name);
    }
  });

  it("the exemption notes name objects that still exist", async () => {
    expect(RESTRICTION_EXEMPT_NOTES.length).toBeGreaterThan(0);
    const present = await db.query<{ proname: string }>(
      "SELECT proname FROM pg_proc WHERE proname = 'get_team_mission'",
    );
    expect(present.rows).toHaveLength(1);
  });
});

async function currentDefinition(
  s: Pick<SocialSurface, "name" | "kind" | "table">,
): Promise<string> {
  if (s.kind === "function") {
    const r = await db.query<{ d: string }>(
      "SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
      [s.name],
    );
    return r.rows.map((x) => x.d).join("\n");
  }
  const r = await db.query<{ d: string }>(
    "SELECT coalesce(qual,'') || ' ' || coalesce(with_check,'') AS d FROM pg_policies WHERE schemaname = 'public' AND policyname = $1 AND tablename = $2",
    [s.name, s.table],
  );
  return r.rows.map((x) => x.d).join("\n");
}
