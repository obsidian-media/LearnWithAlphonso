// Supabase Edge Function: complete-lesson (the handler; index.ts only serves it)
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
import { suspendedResponseIfBanned } from "../_shared/account-status.ts";
import {
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
  LEAGUES,
  type LeagueTier,
} from "./progress-math.ts";
import { lessonSessionIssuedAt, verifyLessonSessionToken } from "./lesson-session.ts";
import {
  isLateSession,
  MIN_LESSON_MS,
  sessionMaxAgeMs,
  verifiedOfflineCompletionDay,
} from "./offline-completion-date.ts";
import { completionInstantMs, HOURLY_COMPLETION_LIMIT } from "./anti-farming.ts";
import { lessonPayloadMatches } from "./lesson-version.ts";
import {
  gainHearts,
  MAX_HEARTS,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  type ServerHeartsMode,
  serverHeartsMode,
  streakHeartMilestoneReached,
} from "../_shared/hearts.ts";
import { heartsProCachedAnyAge, heartsUnlimitedOrUnknown } from "../_shared/hearts-pro.ts";
import { settleReferralReward } from "../_shared/referral.ts";
import { localDay, streakBridge } from "../_shared/local-day.ts";
import { createHash } from "node:crypto";
import { sendPushToUser } from "../_shared/apns.ts";
// §0.1-d #6: re-grades each submitted answer against the real question
// instead of trusting a client-claimed missedQuestionIds list. The same
// function grade-review already used to re-derive review-item correctness.
import { AiConsentReadError, hasAiConsentOrThrow } from "../_shared/ai-consent.ts";
import { deriveAnswerCorrectness, type QuestionRow } from "../_shared/answer-correctness.ts";
import { makeTranslateCostLogger } from "../_shared/ai-cost-log.ts";
import { recordLessonProfileData } from "../_shared/profile-data.ts";
import { makeTranslateQuotaCheck } from "../_shared/ai-quota.ts";

// Was missing "es" -- predates Spanish's 2026-09-21 launch and was never
// updated, unlike grade-review's identical schema. Silently rejected every
// Spanish-course lesson completion from iOS (web's completeLessonRemote,
// grade-review and start-lesson-session's own schema below all already
// allow "es").
const courseSchema = z.enum(["en", "fr", "es"]);
const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");
const completeLessonSchema = z.object({
  lessonId: lessonIdSchema,
  total: z.number().int().min(1).max(50),
  // §0.1-d #6: was a client-claimed missedQuestionIds list, trusted with no
  // check that any answer was ever actually graded. Now the client submits
  // what it actually answered, one entry per real question, and the server
  // derives correctness itself (see deriveAnswerCorrectness below).
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^[a-z0-9]+$/),
        answer: z.string().max(2000),
      }),
    )
    .max(50),
  course: courseSchema,
  sessionToken: z.string().min(1).max(2000),
  completedAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Everything the handler reaches outside itself, so a test can drive the real handler with fakes
 * (handler.test.ts). `liveDeps()` is what production uses.
 */
export type CompleteLessonDeps = {
  authenticate: (
    req: Request,
  ) => Promise<{ userId: string; userClient: SupabaseClient } | Response>;
  admin: () => SupabaseClient;
  translateQuotaCheck: (userClient: SupabaseClient) => () => Promise<boolean>;
  /** Whether the account allows AI grading. Throws AiConsentReadError when the row cannot be read (a 503, never a guess). */
  hasAiConsent: (admin: SupabaseClient, userId: string) => Promise<boolean>;
  verifySessionToken: typeof verifyLessonSessionToken;
  sessionIssuedAt: typeof lessonSessionIssuedAt;
  sendPush: typeof sendPushToUser;
  /** Records one completion against the user's rolling-hour limit. false = over the limit. Errors fail open. */
  consumeCompletionSlot: (admin: SupabaseClient, userId: string, atIso: string) => Promise<boolean>;
  /** Gives back a slot taken for a completion that then failed to save, so the client's retry is not double counted. */
  releaseCompletionSlot: (admin: SupabaseClient, userId: string, atIso: string) => Promise<void>;
  /** SERVER_HEARTS: whether the lesson's hearts are settled here ("on" charges, the default; "shadow" records only). */
  heartsMode: () => ServerHeartsMode;
  /** Alphonso Pro: unlimited hearts. null = could not be established (never treated as "not Pro" by a writer). */
  heartsUnlimited: (admin: SupabaseClient, userId: string) => Promise<boolean | null>;
  /**
   * The last stored Pro answer at any age, null when there is none. Used only when heartsUnlimited is null AFTER a
   * lesson was saved: Pro unknown must never fail a saved completion. Absent = no cache.
   */
  heartsProCached?: (admin: SupabaseClient, userId: string) => Promise<boolean | null>;
  now: () => Date;
};

async function consumeCompletionSlot(
  admin: SupabaseClient,
  userId: string,
  atIso: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_lesson_completion_slot", {
    _user_id: userId,
    _at: atIso,
    _limit: HOURLY_COMPLETION_LIMIT,
  });
  if (error) {
    // FAIL OPEN: never block a real lesson because the guard could not run (e.g. code deployed ahead of its
    // migration). Logged under a stable event name so an alert can be attached to it.
    console.error(
      JSON.stringify({
        event: "completion_slot_unavailable",
        fn: "complete-lesson",
        message: error.message,
      }),
    );
    return true;
  }
  return data !== false;
}

async function releaseCompletionSlot(
  admin: SupabaseClient,
  userId: string,
  atIso: string,
): Promise<void> {
  await admin.rpc("release_lesson_completion_slot", {
    _user_id: userId,
    _at: atIso,
  });
}

export function liveDeps(): CompleteLessonDeps {
  return {
    authenticate,
    admin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      }),
    translateQuotaCheck: makeTranslateQuotaCheck,
    hasAiConsent: hasAiConsentOrThrow,
    verifySessionToken: verifyLessonSessionToken,
    sessionIssuedAt: lessonSessionIssuedAt,
    sendPush: sendPushToUser,
    consumeCompletionSlot,
    releaseCompletionSlot,
    heartsMode: () => serverHeartsMode(),
    heartsUnlimited: (admin, userId) => heartsUnlimitedOrUnknown(admin, userId),
    heartsProCached: (admin, userId) => heartsProCachedAnyAge(admin, userId),
    now: () => new Date(),
  };
}

type HeartsSettlement = { hearts: number; heartsRefillAt: number | null };

/**
 * Settles this lesson session's hearts from the server's own grading (settle_lesson_hearts): misses the app already
 * reported through lose_heart are not charged again, and the rest are charged only when SERVER_HEARTS=on.
 *
 * It runs after the completion is saved, and the save does not depend on it. A settlement whose database call failed
 * is reported as ok:false so the caller answers 503: the apps retry, the retry finds the stored completion and settles
 * again with the ORIGINAL misses. Without that a failed settlement would quietly be free misses.
 *
 * Pro unknown (RevenueCat down) never fails a saved lesson: the last stored Pro answer is used at any age; with none
 * at all the settlement is a SHADOW one (_enforce=false, _pro=false: charges nothing, records the token). It is never
 * settled with _pro=true, which would refill hearts to 5.
 */
async function settleLessonHearts(
  deps: CompleteLessonDeps,
  admin: SupabaseClient,
  userId: string,
  sessionToken: string,
  misses: number,
  sinceMs: number,
): Promise<{ ok: true; settlement: HeartsSettlement | null } | { ok: false }> {
  const mode = deps.heartsMode();
  if (mode === "off") return { ok: true, settlement: null };
  const failed = (reason: string) => {
    console.error(
      JSON.stringify({ event: "hearts_settlement_failed", fn: "complete-lesson", reason }),
    );
    return { ok: false } as const;
  };
  try {
    let pro = await deps.heartsUnlimited(admin, userId);
    let enforce = mode === "on";
    if (pro === null) {
      const cached = deps.heartsProCached ? await deps.heartsProCached(admin, userId) : null;
      if (cached !== null) {
        pro = cached;
        console.error(
          JSON.stringify({ event: "hearts_settlement_stale_pro", fn: "complete-lesson" }),
        );
      } else {
        pro = false;
        enforce = false;
        console.error(
          JSON.stringify({
            event: "hearts_settlement_shadow_pro_unknown",
            fn: "complete-lesson",
          }),
        );
      }
    }
    const { data, error } = await admin.rpc("settle_lesson_hearts", {
      _user_id: userId,
      _token_hash: tokenHash(sessionToken),
      _misses: misses,
      _since: new Date(sinceMs).toISOString(),
      _enforce: enforce,
      _pro: pro,
    });
    const row = (Array.isArray(data) ? data[0] : data) as {
      hearts?: unknown;
      hearts_refill_at?: unknown;
    } | null;
    if (error || !row || typeof row.hearts !== "number") return failed("rpc");
    return {
      ok: true,
      settlement: {
        hearts: row.hearts,
        heartsRefillAt:
          typeof row.hearts_refill_at === "string" ? Date.parse(row.hearts_refill_at) : null,
      },
    };
  } catch {
    return failed("exception");
  }
}

/** The key a token is recorded under (settle_lesson_hearts and lesson_session_redemptions): never the token itself. */
function tokenHash(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

export function createCompleteLessonHandler(
  deps: CompleteLessonDeps,
): (req: Request) => Promise<Response> {
  return (req) => handleRequest(req, deps);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<{ userId: string; userClient: SupabaseClient } | Response> {
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
  // A banned learner's token stays valid until it expires; the ban must not wait for that.
  const banned = await suspendedResponseIfBanned(
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    }),
    data.claims.sub as string,
  );
  if (banned) return banned;
  return { userId: data.claims.sub as string, userClient: anonClient };
}

/**
 * Looks up a lesson + its questions, scoped to the claimed course (a
 * lesson id belonging to the other course's units correctly returns null
 * here, matching getCourse(course).findLesson(lessonId)'s semantics).
 * Also returns the unit's level_id -- needed for the review_items rows
 * this function upserts below, same as recordMisses' client-supplied
 * `level` on the web (here derived server-side instead, one less field
 * to trust from the caller).
 */
async function findLesson(
  admin: SupabaseClient,
  course: string,
  lessonId: string,
): Promise<{ questions: (QuestionRow & { id: string })[]; level: string } | null | "read-failed"> {
  const { data, error } = await admin
    .from("lessons")
    .select(
      "id, units!inner(course, level_id), questions(id, type, prompt, choices, bank, answer_index, answer_text)",
    )
    .eq("id", lessonId)
    .eq("units.course", course)
    .maybeSingle();
  // A failed read is not "no such lesson": that would answer 409 lesson-version-mismatch, which the apps never retry.
  if (error) return "read-failed";
  if (!data) return null;
  const units = data.units as unknown as
    | { level_id: string }
    | {
        level_id: string;
      }[];
  const level = Array.isArray(units) ? units[0]?.level_id : units.level_id;
  return {
    questions: (data.questions ?? []) as (QuestionRow & { id: string })[],
    level: level ?? "A1",
  };
}

/**
 * The table or function is not there (yet): Postgres 42P01 / 42883, PostgREST PGRST205 / PGRST202. The code ships after
 * the migration, but if it ever runs first it falls back to the pre-redemption path instead of failing every lesson.
 */
function isMissingObject(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return code === "42P01" || code === "42883" || code === "PGRST205" || code === "PGRST202";
}

/** What a redeemed token stored: the original response, the misses the original grading found, and the settle anchor. */
type Redemption = { result: Record<string, unknown>; misses: number; settleSince: string };

/** A token this account already redeemed for this exact lesson, null when it has not, "read-failed" when unknown. */
async function readRedemption(
  admin: SupabaseClient,
  userId: string,
  hash: string,
  lessonId: string,
  course: string,
): Promise<Redemption | null | "read-failed"> {
  const { data, error } = await admin
    .from("lesson_session_redemptions")
    .select("result, misses, settle_since, lesson_id, course")
    .eq("token_hash", hash)
    .eq("user_id", userId)
    .maybeSingle();
  // Before the redemption table exists (deploy order) nothing has been redeemed: the old path below still works.
  if (error) return isMissingObject(error) ? null : "read-failed";
  if (!data) return null;
  // A token for another lesson never verifies below, so a mismatch is simply "not redeemed for this request".
  if (data.lesson_id !== lessonId || data.course !== course) return null;
  return {
    result: data.result as Record<string, unknown>,
    misses: data.misses as number,
    settleSince: data.settle_since as string,
  };
}

const RETRY_SETTLE_BODY = { error: "Could not settle lesson hearts; retry" };

/**
 * A repeat of a completion already saved under this token: answers the stored original (never re-graded, nothing new
 * granted) and settles hearts from the ORIGINAL misses. Settlement is idempotent per token, so a retry after a
 * successful settlement charges nothing more, and a first attempt that saved but never settled is settled now.
 */
async function replayRedeemed(
  deps: CompleteLessonDeps,
  admin: SupabaseClient,
  userId: string,
  sessionToken: string,
  prior: Redemption,
  course: string,
): Promise<Response> {
  const settled = await settleLessonHearts(
    deps,
    admin,
    userId,
    sessionToken,
    prior.misses,
    Date.parse(prior.settleSince),
  );
  if (!settled.ok) return jsonResponse(RETRY_SETTLE_BODY, 503);
  const progress = { ...(prior.result.progress as Record<string, unknown>) };
  if (settled.settlement) {
    progress.hearts = settled.settlement.hearts;
    progress.heartsRefillAt = settled.settlement.heartsRefillAt;
  }
  // The stored copy is a snapshot from the first completion and the apps overwrite their cache with this reply, so the
  // progress is the CURRENT one (read only). A failed read keeps the stored values for that part.
  const [pr, lpr] = await Promise.all([
    admin
      .from("user_progress")
      .select("streak, longest_streak, last_active_date, hearts, hearts_refill_at, streak_freezes")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("language_progress")
      .select("xp, league_tier")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
  ]);
  if (!pr.error && pr.data) {
    const p = pr.data;
    progress.streak = p.streak;
    progress.longestStreak = p.longest_streak;
    progress.lastActiveDate = p.last_active_date;
    progress.hearts = p.hearts;
    progress.heartsRefillAt = p.hearts_refill_at ? Date.parse(p.hearts_refill_at as string) : null;
    progress.streakFreezes = p.streak_freezes;
  }
  if (!lpr.error && lpr.data) {
    progress.xp = lpr.data.xp;
    progress.leagueTier = lpr.data.league_tier;
  }
  return jsonResponse({ ...prior.result, progress }, 200);
}

async function handleRequest(req: Request, deps: CompleteLessonDeps): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await deps.authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId, userClient } = auth;
  const checkQuota = deps.translateQuotaCheck(userClient);

  let parsed: z.infer<typeof completeLessonSchema>;
  try {
    parsed = completeLessonSchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const { lessonId, total, answers, course, sessionToken, completedAt } = parsed;

  const admin = deps.admin();

  // A token redeems once. A repeat (a retry after a lost response, a queued duplicate) is answered from what the first
  // completion stored, before anything is re-read or re-graded. Checked first so even a token past its window
  // (a slow retry) still gets its answer, and so no later read can turn a retry into a rejection.
  const hash = tokenHash(sessionToken);
  const prior = await readRedemption(admin, userId, hash, lessonId, course);
  if (prior === "read-failed") {
    return jsonResponse({ error: "Could not load lesson progress" }, 503);
  }
  if (prior) return await replayRedeemed(deps, admin, userId, sessionToken, prior, course);

  const found = await findLesson(admin, course, lessonId);
  // An unreadable lesson is a retryable 503, never the permanent 409 below (the apps dead-letter that one).
  if (found === "read-failed") {
    return jsonResponse({ error: "Could not load lesson" }, 503);
  }
  if (!lessonPayloadMatches(found, total, answers)) {
    console.log(
      JSON.stringify({
        event: "lesson_version_mismatch",
        lessonId,
        course,
        total,
        serverTotal: found?.questions.length ?? null,
      }),
    );
    return jsonResponse({ error: "lesson-version-mismatch" }, 409);
  }
  const lesson = found!;

  // A queued completion (it carries the device's completedAt) may arrive long after the live window.
  const receivedAt = deps.now();
  const sessionAgeLimit = sessionMaxAgeMs(completedAt, receivedAt.getTime());
  if (!deps.verifySessionToken(sessionToken, { userId, lessonId, course }, sessionAgeLimit)) {
    return jsonResponse({ error: "Invalid or expired lesson session" }, 403);
  }
  const sessionIssuedAt = deps.sessionIssuedAt(
    sessionToken,
    {
      userId,
      lessonId,
      course,
    },
    sessionAgeLimit,
  );
  // A session past the live window is only good for a lesson really played after it opened.
  const lateSession =
    sessionIssuedAt !== null && isLateSession(sessionIssuedAt, receivedAt.getTime());
  if (
    lateSession &&
    (!completedAt || !(Date.parse(completedAt) - sessionIssuedAt >= MIN_LESSON_MS))
  ) {
    return jsonResponse({ error: "Invalid or expired lesson session" }, 403);
  }
  // The completion's own day is worked out below, once the learner's time zone has been read.
  // No trusted day (unreadable session issue time) falls back to the server's day below, never a 400:
  // a 400 here would dead-letter a real lesson on both native clients.

  // The actual re-grade: never trust which questions the client says it
  // missed, derive it from the real answer key. Sequential, not
  // Promise.all -- at most a handful of "translate" questions can reach the
  // AI grader, and each one already reuses the exact local-first check the
  // player showed the learner live (deriveAnswerCorrectness).
  // The AI step runs only with account consent. Read lazily, once, and only if a translate answer needs it.
  let consent: Promise<boolean> | undefined;
  const ai = {
    allowed: () => (consent ??= deps.hasAiConsent(admin, userId)),
    checkQuota,
    recordUsage: makeTranslateCostLogger(admin, userId),
  };

  const questionById = new Map(lesson.questions.map((q) => [q.id, q]));
  const missedQuestionIds: string[] = [];
  const graded: { type: string; correct: boolean }[] = [];
  try {
    for (const { questionId, answer } of answers) {
      // Safe: validateLessonAnswerCoverage already proved questionId is a
      // real id in this lesson.
      const question = questionById.get(questionId)!;
      const isCorrect = await deriveAnswerCorrectness(question, answer, course, ai);
      if (!isCorrect) missedQuestionIds.push(questionId);
      graded.push({ type: question.type, correct: isCorrect });
    }
  } catch (e) {
    // Consent unreadable: grading would have guessed "no AI" and may have saved a wrong verdict. Retry instead.
    if (e instanceof AiConsentReadError) {
      return jsonResponse({ error: "Could not load lesson progress" }, 503);
    }
    throw e;
  }
  if (consent && !(await consent)) {
    console.log(
      JSON.stringify({
        event: "ai_grading_skipped",
        fn: "complete-lesson",
        reason: "no-ai-consent",
      }),
    );
  }
  const correct = answers.length - missedQuestionIds.length;

  const now = receivedAt;

  // Batch every read that doesn't depend on another read's result.
  const [pResult, lpResult, compResult, tzResult] = await Promise.all([
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
    admin.from("learner_time_zones").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  // The time zone is read like the rest: an unreadable zone must not silently book the day as UTC.
  const readError = [pResult, lpResult, compResult, tzResult].find((r) => r.error);
  if (readError) {
    return jsonResponse({ error: "Could not load lesson progress" }, 503);
  }
  const pRow = pResult.data;
  const lpRow = lpResult.data;
  const existingComp = compResult.data;
  // Days are the learner's own calendar days (owner decision 2026-11-12): their stored zone, UTC when none is known.
  // No stored zone is UTC; a zone that could not be READ is a 503 above (it would book the wrong day).
  const timeZone = (tzResult.data?.time_zone as string | undefined) ?? null;
  const serverToday = localDay(now.getTime(), timeZone);
  const trustedCompletionDay =
    completedAt && sessionIssuedAt !== null
      ? verifiedOfflineCompletionDay(completedAt, sessionIssuedAt, now, timeZone)
      : null;
  // Replay-farming fix, mirrors src/lib/sync.functions.ts's
  // completeLessonRemote: a repeat completion only pays the XP delta over
  // its previous best score.
  const { bestCorrect, bestXp, xpGain } = computeLessonReplayXp(
    existingComp ? { correct: existingComp.correct, xpEarned: existingComp.xp_earned } : null,
    correct,
    total,
  );

  // A late (long-window) completion that pays nothing (a replay of a finished lesson) credits the receipt day, never a
  // past day: replaying a lesson must not be a way to fill a day the learner did not learn.
  const claimedTrusted = lateSession && xpGain === 0 ? null : trustedCompletionDay;
  // A dated replay may never move the account's activity marker backwards.
  const claimedDay = claimedTrusted ?? serverToday;
  const today =
    pRow?.last_active_date && pRow.last_active_date > claimedDay
      ? pRow.last_active_date
      : claimedDay;
  const dayResult = await admin
    .from("activity_days")
    .select("xp_earned")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  if (dayResult.error) {
    return jsonResponse({ error: "Could not load lesson progress" }, 503);
  }
  const existingDay = dayResult.data;

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
    // A streak still on the old UTC-day basis bridges one extra day, once, so the switch drops nobody.
    bridgeUtcDay: streakBridge((cur as { day_basis?: string | null }).day_basis),
  });

  // Resolve any pending passive regen first, then layer bonuses on top:
  // a streak milestone grants a full refill (takes priority), otherwise
  // a perfect lesson (zero misses) grants a single heart back. Matches
  // completeLessonRemote (src/lib/sync.functions.ts) exactly.
  const regen = resolveHeartsRefill(
    cur.hearts,
    cur.hearts_refill_at ? new Date(cur.hearts_refill_at).getTime() : null,
    now.getTime(),
  );
  let heartsResult = regen;
  let heartsBonus: "streak" | "perfect" | null = null;
  if (streakHeartMilestoneReached(cur.streak, streak)) {
    heartsResult = { hearts: MAX_HEARTS, heartsRefillAt: null };
    heartsBonus = "streak";
  } else if (perfectLessonBonusEarned(correct, total) && xpGain > 0 && regen.hearts < MAX_HEARTS) {
    heartsResult = gainHearts(regen.hearts, 1, regen.heartsRefillAt, now.getTime());
    heartsBonus = "perfect";
  }

  const curLp = lpRow ?? { xp: 0, league_tier: "bronze" };
  const xp = curLp.xp + xpGain;

  const oldIdx = LEAGUES.indexOf(curLp.league_tier as LeagueTier);
  const { leagueTier, newIdx } = computeLeaguePromotion(xp, oldIdx);

  // Friends activity feed (supabase/migrations/20260920010000_friend_activity_events.sql).
  // Only meaningful completions (xpGain > 0) are logged, not every replay
  // of an already-mastered lesson -- otherwise the feed would fill with
  // noise from a single learner re-doing content for review.
  const activityEvents: {
    user_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }[] = [];
  if (xpGain > 0) {
    activityEvents.push({
      user_id: userId,
      event_type: "lesson_completed",
      payload: { lessonId, xpGain },
    });
  }
  if (heartsBonus === "streak") {
    activityEvents.push({
      user_id: userId,
      event_type: "streak_milestone",
      payload: { streak },
    });
  }
  if (newIdx > oldIdx) {
    activityEvents.push({
      user_id: userId,
      event_type: "league_promotion",
      payload: { newTier: leagueTier },
    });
  }

  // Hourly ceiling (anti-farming.ts), counted only for a completion that pays XP: an already-recorded lesson replayed
  // (a retry after a lost response, a queued duplicate) is a no-op and uses no slot. Refused before any write, so a
  // refusal changes neither XP nor streak. Counted at the clamped completion instant, so an offline queue replayed
  // after reconnecting is spread over the hours it was played.
  const slotAtIso = new Date(
    // A hoarded (late) session is counted at receipt, so it cannot dodge the limit by claiming an old hour.
    lateSession ? now.getTime() : completionInstantMs(completedAt, sessionIssuedAt, now.getTime()),
  ).toISOString();
  const slotTaken = xpGain > 0;
  if (slotTaken && !(await deps.consumeCompletionSlot(admin, userId, slotAtIso))) {
    console.log(
      JSON.stringify({
        event: "completion_refused",
        fn: "complete-lesson",
        reason: "rate-limited",
      }),
    );
    return jsonResponse({ error: "rate-limited" }, 429);
  }

  // The response this completion stands for, stored with the redemption in the same transaction as the save. A repeat
  // of the token is answered from it. Achievements and settled hearts are known only after the save; the stored copy
  // is replaced with the final one below (finalize_lesson_session_result).
  const progressBody = (hearts: number, heartsRefillAt: number | null) => ({
    xp,
    streak,
    longestStreak: longest,
    lastActiveDate: today,
    hearts,
    heartsRefillAt,
    streakFreezes: freezes,
    leagueTier,
  });
  const settleSinceMs = sessionIssuedAt ?? now.getTime();

  const onceArgs = {
    _user_id: userId,
    _course: course,
    _lesson_id: lessonId,
    _level: lesson.level,
    _today: today,
    _expected: {
      p_updated_at: pRow?.updated_at ?? null,
      lp_updated_at: lpRow?.updated_at ?? null,
      completion_xp: existingComp?.xp_earned ?? null,
      day_xp: existingDay?.xp_earned ?? null,
    },
    _next: {
      streak,
      longest_streak: longest,
      last_active_date: today,
      hearts: heartsResult.hearts,
      hearts_refill_at: heartsResult.heartsRefillAt
        ? new Date(heartsResult.heartsRefillAt).toISOString()
        : null,
      streak_freezes: freezes,
      day_basis: "local",
      xp,
      league_tier: leagueTier,
      best_correct: bestCorrect,
      total,
      best_xp: bestXp,
      day_xp: (existingDay?.xp_earned ?? 0) + xpGain,
    },
    _missed_question_ids: missedQuestionIds,
    _activity_events: activityEvents,
    _token_hash: hash,
    _result: {
      xpGain,
      correct,
      newlyUnlocked: [],
      heartsBonus,
      progress: progressBody(heartsResult.hearts, heartsResult.heartsRefillAt),
    },
    _misses: missedQuestionIds.length,
    _settle_since: new Date(settleSinceMs).toISOString(),
  };
  let { data: transition, error: transitionError } = await admin.rpc(
    "apply_lesson_completion_once",
    onceArgs,
  );
  // The migration has not been applied yet (deploy order): save through the pre-redemption transaction. No token is
  // claimed then, so a retry is not recognised, but the lesson still saves (it was safe before this change too).
  if (transitionError && isMissingObject(transitionError)) {
    console.error(
      JSON.stringify({ event: "lesson_redemption_unavailable", fn: "complete-lesson" }),
    );
    const {
      _token_hash: _h,
      _result: _r,
      _misses: _m,
      _settle_since: _s,
      ...legacyArgs
    } = onceArgs;
    ({ data: transition, error: transitionError } = await admin.rpc(
      "apply_lesson_completion",
      legacyArgs,
    ));
  }
  // A token that belongs to another completion (a database exception): not retryable, the same answer as any other
  // session the server will not accept (the apps re-mint once, then reject).
  if (transitionError && /different completion/i.test(transitionError.message ?? "")) {
    if (slotTaken) await deps.releaseCompletionSlot(admin, userId, slotAtIso);
    return jsonResponse({ error: "Invalid or expired lesson session" }, 403);
  }
  // Lost a race with a request carrying the same token: nothing was saved here, so the slot goes back and the winner's
  // stored result is the answer.
  if (!transitionError && transition?.status === "redeemed") {
    if (slotTaken) await deps.releaseCompletionSlot(admin, userId, slotAtIso);
    return await replayRedeemed(
      deps,
      admin,
      userId,
      sessionToken,
      {
        result: transition.result as Record<string, unknown>,
        misses: transition.misses as number,
        settleSince: transition.settle_since as string,
      },
      course,
    );
  }
  if (transitionError || !transition || transition.status !== "applied") {
    if (slotTaken) await deps.releaseCompletionSlot(admin, userId, slotAtIso);
    return jsonResponse({ error: "Could not save lesson completion; retry" }, 503);
  }

  // Profile data: the lesson's time and each answer's result by this server's own grading. Never fails the save.
  await recordLessonProfileData(admin, userId, {
    sessionIssuedAtMs: sessionIssuedAt,
    nowMs: now.getTime(),
    graded,
  });

  const settled = await settleLessonHearts(
    deps,
    admin,
    userId,
    sessionToken,
    missedQuestionIds.length,
    settleSinceMs,
  );
  if (settled.ok && settled.settlement) heartsResult = settled.settlement;

  // Referral reward: the first saved lesson of a referred learner pays both sides. Best effort, never fails the lesson;
  // a no-op (one cheap read) for everyone without a pending referral. Runs after hearts are settled so the grant is
  // not overwritten by the settlement.
  await settleReferralReward(admin, userId, deps.heartsUnlimited);

  // Real (remote) push for leaderboard "you've been overtaken" -- V4
  // candidate #2 (docs/BACKLOG.md sec 2.1). This function is the one
  // place that already knows this user's XP just changed, so overtake
  // detection happens here rather than a separately-scheduled job: a
  // friend just got overtaken exactly when their xp falls strictly
  // between this user's xp *before* this completion and *after* it (this
  // user passed them). sendPushToUser itself no-ops silently if APNs
  // secrets aren't configured yet -- see supabase/functions/_shared/apns.ts.
  // Deliberately best-effort and never awaited into the critical path in
  // a way that could turn a successful lesson completion into a 500.
  if (xpGain > 0) {
    try {
      const { data: friendRows } = await admin
        .from("friendships")
        .select("friend_id")
        .eq("user_id", userId)
        .eq("status", "accepted");
      const friendIds = (friendRows ?? []).map((r) => r.friend_id as string);
      if (friendIds.length > 0) {
        const { data: overtaken } = await admin
          .from("language_progress")
          .select("user_id")
          .eq("language", course)
          .in("user_id", friendIds)
          .gt("xp", curLp.xp)
          .lte("xp", xp);
        await Promise.all(
          (overtaken ?? []).map((row) =>
            deps
              .sendPush(
                admin,
                row.user_id as string,
                "Leaderboard update",
                "Someone passed you on the leaderboard!",
                { type: "overtake" },
              )
              .catch(() => undefined),
          ),
        );
      }
    } catch {
      // Same best-effort reasoning as above -- never fail this response
      // over a push-delivery hiccup.
    }
  }

  // The lesson is already saved. Nothing below may turn that into an error, and nothing below may write from
  // a failed read: an unreadable unlock list looks like "nothing unlocked yet", which would re-announce every
  // achievement and reset the promotion count.
  const newlyUnlocked: string[] = [];
  const [compsRead, catalogRead, unlocksRead, promotionsRead] = await Promise.all([
    admin.from("lesson_completions").select("correct,total").eq("user_id", userId),
    admin.from("achievements").select("id, category, threshold"),
    admin.from("user_achievements").select("achievement_id,progress").eq("user_id", userId),
    admin
      .from("friend_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "league_promotion"),
  ]);
  if (compsRead.error || catalogRead.error || unlocksRead.error) {
    console.error(
      JSON.stringify({
        event: "achievements_skipped",
        fn: "complete-lesson",
        reason: "read-failed",
      }),
    );
  } else {
    const allComps = compsRead.data ?? [];
    const prevUnlocks = unlocksRead.data ?? [];
    const totalLessons = allComps.length;
    const perfectLessons = allComps.filter((c) => c.correct === c.total).length;
    const prevMap = new Map(prevUnlocks.map((u) => [u.achievement_id, u.progress]));

    // Promotions are written as feed events inside the completion transaction, so their count survives a
    // response that was lost before this step ran. The stored counter covers promotions older than the feed.
    const prevPromoteCount =
      prevMap.get("league_promote_3") ?? prevMap.get("league_promote_1") ?? 0;
    const promoteCount = Math.max(
      prevPromoteCount + (newIdx > oldIdx ? 1 : 0),
      promotionsRead.error ? 0 : (promotionsRead.count ?? 0),
    );

    const stats: Record<string, number> = {
      streak,
      xp,
      perfect: perfectLessons,
      lessons: totalLessons,
      league: promoteCount,
      freeze: freezes,
    };

    const rows: {
      user_id: string;
      achievement_id: string;
      progress: number;
    }[] = [];
    for (const a of catalogRead.data ?? []) {
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
      const { error: unlockError } = await admin.from("user_achievements").upsert(rows, {
        onConflict: "user_id,achievement_id",
      });
      // Derived from saved state, so the next completion writes them again.
      if (unlockError) {
        console.error(
          JSON.stringify({
            event: "achievements_write_failed",
            fn: "complete-lesson",
          }),
        );
      }
    }
  }

  const finalResult = {
    xpGain,
    // Right answers by this server's own grading: the count xpGain was computed from. The apps' complete screens
    // explain the award with it (right answers, perfect bonus, already earned), as the web does.
    correct,
    newlyUnlocked,
    heartsBonus,
    progress: progressBody(heartsResult.hearts, heartsResult.heartsRefillAt),
  };
  // So a retry of this token returns what this reply says (the achievements it announced, the settled hearts).
  // Best effort: the stored first copy is already a complete answer.
  try {
    // supabase-js returns the error rather than throwing it, so it is checked here.
    const { error: finalizeError } = await admin.rpc("finalize_lesson_session_result", {
      _user_id: userId,
      _token_hash: hash,
      _result: finalResult,
    });
    if (finalizeError && !isMissingObject(finalizeError)) {
      console.error(
        JSON.stringify({
          event: "lesson_result_finalize_failed",
          fn: "complete-lesson",
          message: finalizeError.message,
        }),
      );
    }
  } catch {
    // Nothing to do: the earlier stored result stands.
  }

  // Saved, but the hearts could not be settled: ask the app to retry. The retry is answered from the stored
  // completion and settles with the original misses; a 200 here would make those misses free.
  if (!settled.ok) return jsonResponse(RETRY_SETTLE_BODY, 503);
  return jsonResponse(finalResult, 200);
}
