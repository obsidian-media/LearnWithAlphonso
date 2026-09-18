// Supabase Edge Function: complete-lesson
//
// The trust-boundary piece of lesson completion that a Swift/web client
// cannot implement directly -- see
// docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md
// for the full design rationale. This is a 1:1 port of
// src/lib/sync.functions.ts's completeLessonRemote handler
// (src/lib/sync.functions.ts:174-351), reading curriculum data from the
// lessons/questions/achievements tables (supabase/migrations/20260918120000_curriculum_data_tables.sql)
// instead of the in-process curriculum.ts the web app uses.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the Supabase platform (local `supabase functions serve`
// and production alike) -- do not set them manually. LESSON_SESSION_SECRET
// must be set explicitly (`supabase secrets set LESSON_SESSION_SECRET=...`)
// and MUST match the web app's own LESSON_SESSION_SECRET, or tokens issued
// by startLessonSession (web) won't verify here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
  deriveLessonCompletion,
  LEAGUES,
  type LeagueTier,
} from "./progress-math.ts";
import { verifyLessonSessionToken } from "./lesson-session.ts";
import {
  gainHearts,
  MAX_HEARTS,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts.ts";

const courseSchema = z.enum(["en", "fr"]);
const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");
const completeLessonSchema = z.object({
  lessonId: lessonIdSchema,
  total: z.number().int().min(1).max(50),
  missedQuestionIds: z.array(z.string().regex(/^[a-z0-9]+$/)).max(50),
  course: courseSchema,
  sessionToken: z.string().min(1).max(2000),
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized: missing bearer token" }, 401);
  }
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) {
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  }
  return { userId: data.claims.sub as string };
}

/**
 * Looks up a lesson + its questions, scoped to the claimed course (a
 * lesson id belonging to the other course's units correctly returns null
 * here, matching getCourse(course).findLesson(lessonId)'s semantics).
 */
async function findLesson(
  admin: SupabaseClient,
  course: string,
  lessonId: string,
): Promise<{ questions: { id: string }[] } | null> {
  const { data, error } = await admin
    .from("lessons")
    .select("id, units!inner(course), questions(id)")
    .eq("id", lessonId)
    .eq("units.course", course)
    .maybeSingle();
  if (error || !data) return null;
  return { questions: (data.questions ?? []) as { id: string }[] };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let parsed: z.infer<typeof completeLessonSchema>;
  try {
    parsed = completeLessonSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse(
      { error: "Invalid request body", details: `${err}` },
      400,
    );
  }
  const { lessonId, total, missedQuestionIds, course, sessionToken } = parsed;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const lesson = await findLesson(admin, course, lessonId);
  if (!lesson) {
    return jsonResponse({ error: "Invalid lesson completion payload" }, 400);
  }

  if (!verifyLessonSessionToken(sessionToken, { userId, lessonId, course })) {
    return jsonResponse({ error: "Invalid or expired lesson session" }, 403);
  }

  let correct: number;
  try {
    ({ correct } = deriveLessonCompletion(lesson, total, missedQuestionIds));
  } catch {
    return jsonResponse({ error: "Invalid lesson completion payload" }, 400);
  }

  const today = todayStr();

  // Batch every read that doesn't depend on another read's result.
  const [
    { data: pRow },
    { data: lpRow },
    { data: existingComp },
    { data: existingDay },
  ] = await Promise.all([
    admin.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("language_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
    admin
      .from("lesson_completions")
      .select("correct,xp_earned")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .eq("language", course)
      .maybeSingle(),
    admin
      .from("activity_days")
      .select("xp_earned")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle(),
  ]);

  // Replay-farming fix, mirrors src/lib/sync.functions.ts's
  // completeLessonRemote: a repeat completion only pays the XP delta over
  // its previous best score.
  const { bestCorrect, bestXp, xpGain } = computeLessonReplayXp(
    existingComp ? { correct: existingComp.correct, xpEarned: existingComp.xp_earned } : null,
    correct,
    total,
  );

  const cur = pRow ?? {
    user_id: userId,
    streak: 0,
    longest_streak: 0,
    last_active_date: null as string | null,
    hearts: MAX_HEARTS,
    hearts_refill_at: null as string | null,
    streak_freezes: 0,
  };

  const {
    streak,
    longestStreak: longest,
    freezes,
  } = computeStreakUpdate({
    lastActiveDate: cur.last_active_date,
    today,
    streak: cur.streak,
    longestStreak: cur.longest_streak,
    freezes: cur.streak_freezes,
  });

  // Resolve any pending passive regen first, then layer bonuses on top:
  // a streak milestone grants a full refill (takes priority), otherwise
  // a perfect lesson (zero misses) grants a single heart back. Matches
  // completeLessonRemote (src/lib/sync.functions.ts) exactly.
  const regen = resolveHeartsRefill(
    cur.hearts,
    cur.hearts_refill_at ? new Date(cur.hearts_refill_at).getTime() : null,
    Date.now(),
  );
  let heartsResult = regen;
  let heartsBonus: "streak" | "perfect" | null = null;
  if (streakHeartMilestoneReached(cur.streak, streak)) {
    heartsResult = { hearts: MAX_HEARTS, heartsRefillAt: null };
    heartsBonus = "streak";
  } else if (
    perfectLessonBonusEarned(correct, total) &&
    xpGain > 0 &&
    regen.hearts < MAX_HEARTS
  ) {
    heartsResult = gainHearts(regen.hearts, 1);
    heartsBonus = "perfect";
  }

  const curLp = lpRow ?? { xp: 0, league_tier: "bronze" };
  const xp = curLp.xp + xpGain;

  const oldIdx = LEAGUES.indexOf(curLp.league_tier as LeagueTier);
  const { leagueTier, newIdx } = computeLeaguePromotion(xp, oldIdx);

  await Promise.all([
    admin.from("user_progress").upsert({
      user_id: userId,
      streak,
      longest_streak: longest,
      last_active_date: today,
      hearts: heartsResult.hearts,
      hearts_refill_at: heartsResult.heartsRefillAt
        ? new Date(heartsResult.heartsRefillAt).toISOString()
        : null,
      streak_freezes: freezes,
    }),
    admin
      .from("language_progress")
      .upsert(
        { user_id: userId, language: course, xp, league_tier: leagueTier },
        { onConflict: "user_id,language" },
      ),
    admin.from("lesson_completions").upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        correct: bestCorrect,
        total,
        xp_earned: bestXp,
        language: course,
      },
      { onConflict: "user_id,lesson_id" },
    ),
    admin.from("activity_days").upsert({
      user_id: userId,
      day: today,
      xp_earned: (existingDay?.xp_earned ?? 0) + xpGain,
    }),
  ]);

  const [{ data: allComps }, { data: achievements }, { data: prevUnlocks }] =
    await Promise.all([
      admin.from("lesson_completions").select("correct,total").eq(
        "user_id",
        userId,
      ),
      admin.from("achievements").select("id, category, threshold"),
      admin.from("user_achievements").select("achievement_id,progress").eq(
        "user_id",
        userId,
      ),
    ]);
  const totalLessons = allComps?.length ?? 0;
  const perfectLessons =
    (allComps ?? []).filter((c) => c.correct === c.total).length;

  const prevMap = new Map(
    (prevUnlocks ?? []).map((u) => [u.achievement_id, u.progress]),
  );
  const newlyUnlocked: string[] = [];

  const prevPromoteCount = prevMap.get("league_promote_3") ??
    prevMap.get("league_promote_1") ?? 0;
  const promoteCount = prevPromoteCount + (newIdx > oldIdx ? 1 : 0);

  const stats: Record<string, number> = {
    streak,
    xp,
    perfect: perfectLessons,
    lessons: totalLessons,
    league: promoteCount,
    freeze: freezes,
  };

  const rows: { user_id: string; achievement_id: string; progress: number }[] =
    [];
  for (const a of achievements ?? []) {
    const val = stats[a.category] ?? 0;
    const wasUnlocked = prevMap.has(a.id);
    if (val >= a.threshold && !wasUnlocked) {
      newlyUnlocked.push(a.id);
      rows.push({ user_id: userId, achievement_id: a.id, progress: val });
    } else if (wasUnlocked && a.category === "league") {
      rows.push({ user_id: userId, achievement_id: a.id, progress: val });
    }
  }
  if (rows.length) {
    await admin.from("user_achievements").upsert(rows, {
      onConflict: "user_id,achievement_id",
    });
  }

  return jsonResponse(
    {
      xpGain,
      newlyUnlocked,
      heartsBonus,
      progress: {
        xp,
        streak,
        longestStreak: longest,
        lastActiveDate: today,
        hearts: heartsResult.hearts,
        heartsRefillAt: heartsResult.heartsRefillAt,
        streakFreezes: freezes,
        leagueTier,
      },
    },
    200,
  );
}

Deno.serve(handleRequest);
