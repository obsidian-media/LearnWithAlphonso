import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  REFRESHER_WINDOW_DAYS,
  TUTOR_MEMORY_LIMIT,
  WEAKNESS_EVENTS_LIMIT,
  WEAK_SPOTS_DUE_LIMIT,
} from "@/data/path-config";
import { LEVEL_ORDER } from "@/lib/learning-goal";
import { localDay } from "@/lib/local-day";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { isPathCallKind, type PathData } from "@/lib/learning-path-data";
import type { RehearsalPathInput } from "@/lib/path-plan";
import { rehearsalPathInput } from "@/lib/rehearsal-path";
import { rehearsalsEnabled } from "@/lib/rehearsals-flag";

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
 * The active rehearsal for the path's pinned item. Only while Rehearsals is on. It is an extra on the page, so a failed
 * read leaves it out rather than failing the whole path (the rest of the plan is still right without it).
 */
async function loadRehearsalForPath(
  db: SupabaseClient,
  userId: string,
  course: Course,
  timeZone: string | null,
): Promise<RehearsalPathInput | undefined> {
  if (!rehearsalsEnabled()) return undefined;
  try {
    const { loadActiveRehearsal, loadRuns } = await import("@/lib/rehearsals.server");
    const row = await loadActiveRehearsal(db, userId, course);
    if (!row) return undefined;
    return rehearsalPathInput(row, await loadRuns(db, userId, row.id), timeZone);
  } catch {
    return undefined;
  }
}

/**
 * Loads the rows the learning path needs for one learner and course. Throws on any database error so the route answers
 * 500: a failed read must never look like "no activity". Every query is scoped to the user id from the verified token.
 * No saved goal is not an error and not null any more: `goal` comes back null and the builder works out a SUGGESTED one
 * (path v2). The weakness reads (Review due, weakness_events, tutor_memory) are bounded and course-scoped where the
 * table has a course (weakness_events too since #753).
 */
export async function loadPathData(
  admin: Admin,
  userId: string,
  course: Course,
  now: Date,
): Promise<PathData> {
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
        .select("kind,item_key,started_at,last_reply_at,finished_at,stars")
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
  const saved = goalRes.data;
  const today = localDay(
    now.getTime(),
    zone.error ? null : ((zone.data as { time_zone?: string } | null)?.time_zone ?? null),
  );
  const windowStart = new Date(now.getTime() - REFRESHER_WINDOW_DAYS * 86_400_000).toISOString();
  const [due, events, memory] = await Promise.all([
    admin
      .from("review_items")
      .select("item_key,weakness_label")
      .eq("user_id", userId)
      .eq("language", course)
      .lte("due_on", today)
      .order("due_on", { ascending: true })
      .limit(WEAK_SPOTS_DUE_LIMIT),
    admin
      .from("weakness_events")
      .select("category,event_type,created_at")
      .eq("user_id", userId)
      .eq("course", course)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(WEAKNESS_EVENTS_LIMIT),
    admin
      .from("tutor_memory")
      .select("memory_key,seen_count,created_at,last_seen_at")
      .eq("user_id", userId)
      .eq("course", course)
      .eq("kind", "mistake")
      .gte("last_seen_at", windowStart)
      .order("last_seen_at", { ascending: false })
      .limit(TUTOR_MEMORY_LIMIT),
  ]);
  for (const [what, r] of Object.entries({ due, events, memory }))
    fail(what, r.error as { message: string } | null);
  const timeZone = zone.error
    ? null
    : ((zone.data as { time_zone?: string } | null)?.time_zone ?? null);
  return {
    course,
    now,
    timeZone,
    rehearsal: await loadRehearsalForPath(untyped, userId, course, timeZone),
    currentLevel: known && LEVEL_ORDER.includes(known) ? known : "A1",
    goal: saved
      ? {
          targetLevel: LEVEL_ORDER.includes(saved.target_level as Level)
            ? (saved.target_level as Level)
            : "A1",
          targetDate: saved.target_date,
          createdAt: new Date(saved.created_at).toISOString(),
        }
      : null,
    weak: {
      reviewDue: (due.data ?? []).map((r) => ({
        itemKey: r.item_key,
        weaknessLabel: r.weakness_label,
      })),
      weaknessEvents: (events.data ?? []).map((e) => ({
        category: e.category,
        eventType: e.event_type,
        createdAt: e.created_at,
      })),
      mistakes: (memory.data ?? []).map((m) => ({
        topic: m.memory_key,
        seenCount: m.seen_count,
        createdAt: m.created_at,
        lastSeenAt: m.last_seen_at,
      })),
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
    // A rehearsal's runs (kind 'rehearsal') are not scenarios or scenes: the weekly mix never counts them.
    calls: (calls.data ?? [])
      .filter((c) => isPathCallKind(c.kind))
      .map((c) => ({
        kind: c.kind as "scenario" | "scene",
        itemKey: c.item_key,
        startedAt: c.started_at,
        lastReplyAt: c.last_reply_at,
        finishedAt: c.finished_at as string,
        stars: c.stars ?? 0,
      })),
    stars: (stars.data ?? [])
      .filter((s) => isPathCallKind(s.kind))
      .map((s) => ({
        kind: s.kind as "scenario" | "scene",
        itemKey: s.item_key,
        bestStars: s.best_stars,
        lastPlayedAt: s.last_played_at,
      })),
    profile: parseLearnerProfile(meta[LEARNER_PROFILE_KEY]),
  };
}
