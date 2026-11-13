import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEVEL_ORDER } from "@/lib/learning-goal";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import type { PathData } from "@/lib/learning-path-data";

type Admin = typeof supabaseAdmin;
type VideoPathRow = {
  id: string;
  title: string;
  duration_seconds: number;
  level_id: string | null;
  tags: string[] | null;
};

/** Days of history the path reads: enough for streaks and the current week, small enough for one page of rows. */
const HISTORY_DAYS = 90;
const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/**
 * Loads the rows the learning path needs for one learner and course. Throws on any database error so the route answers
 * 500: a failed read must never look like "no activity". Every query is scoped to the user id from the verified token.
 * Returns null when the learner has no goal yet (the Build my path screen).
 */
export async function loadPathData(
  admin: Admin,
  userId: string,
  course: Course,
  now: Date,
): Promise<PathData | null> {
  const untyped = admin as unknown as SupabaseClient;
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const sinceDay = since.slice(0, 10);

  const goalRes = await admin
    .from("learning_goals")
    .select("target_level,target_date,created_at")
    .eq("user_id", userId)
    .eq("language", course)
    .maybeSingle();
  fail("goal", goalRes.error);
  if (!goalRes.data) return null;

  const [level, done, days, skills, episodes, listen, videos, watches, calls, stars, user, zone] =
    await Promise.all([
      admin
        .from("language_progress")
        .select("cefr_level")
        .eq("user_id", userId)
        .eq("language", course)
        .maybeSingle(),
      admin
        .from("lesson_completions")
        .select("lesson_id,completed_at")
        .eq("user_id", userId)
        .eq("language", course),
      admin
        .from("learning_days")
        .select("day,lesson_seconds,practice_seconds")
        .eq("user_id", userId)
        .gte("day", sinceDay),
      admin
        .from("skill_days")
        .select("day,skill,right_answers,total_answers")
        .eq("user_id", userId)
        .gte("day", sinceDay),
      admin
        .from("podcast_episodes")
        .select("id,slug,title,duration_seconds,level_id,podcast_folders(slug)")
        .eq("published", true)
        .eq("course", course),
      admin.from("listen_progress").select("episode_id,completed_at").eq("user_id", userId),
      // The Watch shelf tables are not in the generated types until migration 20261115100000 is deployed and
      // regenerate-supabase-types.yml has run, so these two reads go through an untyped client (as profile.functions.ts does).
      untyped
        .from("videos")
        .select("id,title,duration_seconds,level_id,tags")
        .eq("published", true)
        .eq("course", course),
      untyped.from("video_watches").select("video_id,completed_at").eq("user_id", userId),
      admin
        .from("practice_calls")
        .select("kind,item_key,started_at,last_reply_at,finished_at")
        .eq("user_id", userId)
        .eq("course", course)
        .not("finished_at", "is", null)
        .gte("started_at", since),
      admin
        .from("practice_stars")
        .select("kind,item_key,best_stars,last_played_at")
        .eq("user_id", userId)
        .eq("course", course),
      admin.auth.admin.getUserById(userId),
      // The learner's own calendar day is "today" (owner decision 2026-11-12); a failed read means UTC.
      admin.from("learner_time_zones").select("time_zone").eq("user_id", userId).maybeSingle(),
    ]);
  const reads = { level, done, days, skills, episodes, listen, videos, watches, calls, stars };
  for (const [what, r] of Object.entries(reads)) fail(what, r.error as { message: string } | null);
  if (user.error || !user.data?.user) throw new Error("account: could not read");

  const known = level.data?.cefr_level as Level | undefined;
  const meta = (user.data.user.user_metadata ?? {}) as Record<string, unknown>;
  const targetLevel = goalRes.data.target_level as Level;
  return {
    course,
    now,
    timeZone: zone.error ? null : ((zone.data as { time_zone?: string } | null)?.time_zone ?? null),
    currentLevel: known && LEVEL_ORDER.includes(known) ? known : "A1",
    goal: {
      targetLevel: LEVEL_ORDER.includes(targetLevel) ? targetLevel : "A1",
      targetDate: goalRes.data.target_date,
      createdAt: new Date(goalRes.data.created_at).toISOString(),
    },
    completions: (done.data ?? []).map((r) => ({
      lessonId: r.lesson_id,
      completedAt: r.completed_at,
    })),
    learningDays: (days.data ?? []).map((r) => ({
      day: r.day,
      lessonSeconds: r.lesson_seconds,
      practiceSeconds: r.practice_seconds,
    })),
    skillDays: (skills.data ?? []).map((r) => ({
      day: r.day,
      skill: r.skill,
      right: r.right_answers,
      total: r.total_answers,
    })),
    episodes: (episodes.data ?? []).map((e) => ({
      id: e.id,
      folder: (e.podcast_folders as { slug: string } | null)?.slug ?? "",
      slug: e.slug,
      title: e.title,
      durationSeconds: e.duration_seconds,
      levelId: e.level_id,
    })),
    listen: (listen.data ?? []).map((r) => ({
      episodeId: r.episode_id,
      completedAt: r.completed_at,
    })),
    videos: ((videos.data ?? []) as VideoPathRow[]).map((v) => ({
      id: v.id,
      title: v.title,
      durationSeconds: v.duration_seconds,
      levelId: v.level_id,
      tags: v.tags ?? [],
    })),
    videoWatches: ((watches.data ?? []) as { video_id: string; completed_at: string | null }[]).map(
      (w) => ({ videoId: w.video_id, completedAt: w.completed_at }),
    ),
    calls: (calls.data ?? []).map((c) => ({
      kind: c.kind as "scenario" | "scene",
      itemKey: c.item_key,
      startedAt: c.started_at,
      lastReplyAt: c.last_reply_at,
      finishedAt: c.finished_at as string,
    })),
    stars: (stars.data ?? []).map((s) => ({
      kind: s.kind as "scenario" | "scene",
      itemKey: s.item_key,
      bestStars: s.best_stars,
      lastPlayedAt: s.last_played_at,
    })),
    profile: parseLearnerProfile(meta[LEARNER_PROFILE_KEY]),
  };
}
