import type { SupabaseClient } from "@supabase/supabase-js";
import { getCourse, type Course } from "@/data/courses";
import { isLessonUnlocked } from "./lesson-unlock";

/**
 * Whether this learner may start `lessonId`, from their own rows in the database (never from anything the client
 * says): their completions in this course and the CEFR level stored by placement (or picked on Learn). The rule is
 * lesson-unlock.ts, the one the Learn map is built on. A failed read answers "unknown", and the caller lets the
 * learner in: a database hiccup must not lock anyone out of a lesson they could reach (and it is logged).
 */
export async function lessonStartVerdict(
  supabase: SupabaseClient,
  userId: string,
  course: Course,
  lessonId: string,
): Promise<"unlocked" | "locked" | "unknown"> {
  const [done, level] = await Promise.all([
    supabase
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("language", course),
    supabase
      .from("language_progress")
      .select("cefr_level")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
  ]);
  if (done.error || level.error) {
    console.error(JSON.stringify({ event: "lesson_unlock_read_failed", fn: "startLessonSession" }));
    return "unknown";
  }
  const order = getCourse(course).curriculum.flatMap((u) =>
    u.lessons.map((l) => ({ id: l.id, level: u.level })),
  );
  const completed = new Set((done.data ?? []).map((r: { lesson_id: string }) => r.lesson_id));
  return isLessonUnlocked(order, completed, level.data?.cefr_level, lessonId)
    ? "unlocked"
    : "locked";
}
