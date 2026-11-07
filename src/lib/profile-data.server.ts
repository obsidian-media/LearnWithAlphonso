import { lessonSeconds, skillResults, type SkillResult } from "./profile-data";

/**
 * The server writes of the Profile data (20261107120000_profile_data.sql). Each runs as the service role through a
 * function no client may execute, and NEVER throws: a failed recording must not cost the learner their lesson or reply.
 * Until the migration is deployed the functions do not exist (PGRST202 / 42883): skipped quietly.
 */
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

const notDeployedYet = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883";

async function call(client: object, fn: string, args: Record<string, unknown>) {
  try {
    const { error } = await (client as Rpc).rpc(fn, args);
    if (error && !notDeployedYet(error))
      console.error(`[profile-data] ${fn} failed:`, error.message);
  } catch (e) {
    console.error(`[profile-data] ${fn} failed:`, e instanceof Error ? e.message : e);
  }
}

export async function recordLearningSeconds(
  client: object,
  userId: string,
  seconds: { lesson?: number; practice?: number },
) {
  const lesson = Math.max(0, Math.floor(seconds.lesson ?? 0));
  const practice = Math.max(0, Math.floor(seconds.practice ?? 0));
  if (lesson + practice === 0) return;
  await call(client, "add_learning_seconds", {
    _user_id: userId,
    _lesson_seconds: lesson,
    _practice_seconds: practice,
  });
}

export async function recordSkillResults(client: object, userId: string, results: SkillResult[]) {
  if (results.length === 0) return;
  await call(client, "add_skill_results", { _user_id: userId, _results: results });
}

/** A saved lesson: its time (from the lesson session's start) and each answer's result by the server's own grading. */
export async function recordLessonProfileData(
  client: object,
  userId: string,
  lesson: {
    sessionIssuedAtMs: number | null;
    nowMs: number;
    graded: { type: string; correct: boolean }[];
  },
) {
  await Promise.all([
    recordLearningSeconds(client, userId, {
      lesson: lessonSeconds(lesson.sessionIssuedAtMs, lesson.nowMs),
    }),
    recordSkillResults(client, userId, skillResults(lesson.graded)),
  ]);
}
