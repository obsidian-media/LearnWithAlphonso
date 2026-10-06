import { getCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEVEL_ORDER } from "@/lib/learning-goal";

type Admin = typeof supabaseAdmin;

export function lessonsByLevel(course: Course): Record<Level, string[]> {
  const out = Object.fromEntries(LEVEL_ORDER.map((l) => [l, [] as string[]])) as Record<
    Level,
    string[]
  >;
  for (const unit of getCourse(course).curriculum) {
    for (const lesson of unit.lessons) out[unit.level].push(lesson.id);
  }
  return out;
}

/**
 * The learner's current level and the first-completion time of every lesson they
 * have done in this course. Throws on a database error so the route can answer 500:
 * a failed read must never look like "no goal" or "no progress".
 * (lesson_completions holds at most one row per lesson, a few hundred per course,
 * well inside PostgREST's 1000-row default page.)
 */
export async function loadLearnerState(admin: Admin, userId: string, course: Course) {
  const level = await admin
    .from("language_progress")
    .select("cefr_level")
    .eq("user_id", userId)
    .eq("language", course)
    .maybeSingle();
  if (level.error) throw new Error(level.error.message);
  const known = level.data?.cefr_level as Level | undefined;
  const currentLevel: Level = known && LEVEL_ORDER.includes(known) ? known : "A1";

  const done = await admin
    .from("lesson_completions")
    .select("lesson_id,completed_at")
    .eq("user_id", userId)
    .eq("language", course);
  if (done.error) throw new Error(done.error.message);
  const completedAt: Record<string, string> = {};
  for (const row of done.data ?? []) completedAt[row.lesson_id] = row.completed_at;
  return { currentLevel, completedAt };
}
