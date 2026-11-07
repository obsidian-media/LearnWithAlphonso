// Profile data (migration 20261107120000_profile_data.sql) for the Edge Functions. A hand-mirrored copy of the pure
// rules in src/lib/profile-data.ts and the writes in src/lib/profile-data.server.ts; src/lib/profile-data-mirror.test.ts
// holds the two in step.

export const SKILLS = ["listening", "speaking", "vocabulary", "grammar", "reading"] as const;
export type Skill = (typeof SKILLS)[number];

const SKILL_OF_TYPE: Record<string, Skill> = {
  listening: "listening",
  speak: "speaking",
  mc: "vocabulary",
  fill: "grammar",
  reorder: "grammar",
  translate: "reading",
};
export const skillOfQuestionType = (type: string): Skill | null => SKILL_OF_TYPE[type] ?? null;

export type SkillResult = { skill: Skill; right: number; total: number };

export function skillResults(graded: { type: string; correct: boolean }[]): SkillResult[] {
  const by = new Map<Skill, SkillResult>();
  for (const g of graded) {
    const skill = skillOfQuestionType(g.type);
    if (!skill) continue;
    const r = by.get(skill) ?? { skill, right: 0, total: 0 };
    r.total += 1;
    if (g.correct) r.right += 1;
    by.set(skill, r);
  }
  return SKILLS.flatMap((s) => by.get(s) ?? []);
}

export const MAX_ACTIVITY_SECONDS = 900;

export function lessonSeconds(sessionIssuedAtMs: number | null, nowMs: number): number {
  if (sessionIssuedAtMs === null || !Number.isFinite(sessionIssuedAtMs)) return 0;
  return Math.min(
    MAX_ACTIVITY_SECONDS,
    Math.max(0, Math.round((nowMs - sessionIssuedAtMs) / 1000)),
  );
}

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string; code?: string } | null }>;
};

async function call(client: unknown, fn: string, args: Record<string, unknown>) {
  try {
    const res = await (client as Rpc).rpc(fn, args);
    const error = res?.error;
    // Before the migration is deployed the function does not exist: skip quietly.
    if (error && error.code !== "PGRST202" && error.code !== "42883") {
      console.error(`[profile-data] ${fn} failed:`, error.message);
    }
  } catch (e) {
    console.error(`[profile-data] ${fn} failed:`, e instanceof Error ? e.message : e);
  }
}

/** Never throws: a failed recording must not cost the learner their saved lesson. */
export async function recordLessonProfileData(
  client: unknown,
  userId: string,
  lesson: {
    sessionIssuedAtMs: number | null;
    nowMs: number;
    graded: { type: string; correct: boolean }[];
  },
): Promise<void> {
  const lessonSecs = lessonSeconds(lesson.sessionIssuedAtMs, lesson.nowMs);
  const results = skillResults(lesson.graded);
  await Promise.all([
    lessonSecs > 0
      ? call(client, "add_learning_seconds", {
          _user_id: userId,
          _lesson_seconds: lessonSecs,
          _practice_seconds: 0,
        })
      : undefined,
    results.length > 0
      ? call(client, "add_skill_results", { _user_id: userId, _results: results })
      : undefined,
  ]);
}
