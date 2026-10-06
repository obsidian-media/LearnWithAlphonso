import { createFileRoute } from "@tanstack/react-router";
import { isCourse, type Course } from "@/data/courses";
import type { Level } from "@/data/levels";
import { LEVEL_ORDER, planGoal, validateGoalInput } from "@/lib/learning-goal";
import { lessonsByLevel, loadLearnerState } from "@/lib/learning-goal.server";

/**
 * Learning goal planner (docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md).
 * The plan is computed here, once, by `planGoal`; web, iOS and Android only render it.
 * Writes use supabaseAdmin after validation (clients have SELECT on the table only),
 * and every read and write is scoped to the user id from the verified token, never
 * from the request.
 *
 *   GET    ?course=en                              stored goal + plan
 *   GET    ?course=en&targetLevel=B1&targetDate=.. preview (writes nothing)
 *   PUT    { course, targetLevel, targetDate }     save, returns goal + plan
 *   DELETE ?course=en                              remove
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** PostgREST sends microseconds and +00:00; clients (Swift's ISO8601 decoders) need ms and Z. */
const isoTime = (timestamp: string) => new Date(timestamp).toISOString();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const loadFailed = () => json({ error: "Could not load your goal." }, 500);

async function authenticate(request: Request, admin: Admin): Promise<string | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  return data.user.id;
}

type LearnerState = Awaited<ReturnType<typeof loadLearnerState>>;

/** Pure: the state is loaded once by the caller (it is also needed to validate). */
function planFor(
  course: Course,
  state: LearnerState,
  target: { level: Level; date: string },
  createdAt: string | null,
) {
  return planGoal({
    currentLevel: state.currentLevel,
    targetLevel: target.level,
    targetDate: target.date,
    lessonsByLevel: lessonsByLevel(course),
    completedAt: state.completedAt,
    goalCreatedAt: createdAt,
    now: new Date(),
  });
}

async function handle(request: Request, method: "GET" | "PUT" | "DELETE"): Promise<Response> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const auth = await authenticate(request, admin);
  if (typeof auth !== "string") return auth;
  const userId = auth;
  const params = new URL(request.url).searchParams;

  let body: unknown = null;
  if (method === "PUT") {
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }
  const course =
    method === "PUT" ? (body as { course?: unknown } | null)?.course : params.get("course");
  if (typeof course !== "string" || !isCourse(course))
    return json({ error: "Unknown course" }, 400);

  try {
    if (method === "DELETE") {
      const { error } = await admin
        .from("learning_goals")
        .delete()
        .eq("user_id", userId)
        .eq("language", course);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (method === "PUT") {
      const state = await loadLearnerState(admin, userId, course);
      const valid = validateGoalInput(body, { now: new Date(), currentLevel: state.currentLevel });
      if (!valid.ok) return json({ error: valid.error }, 400);
      const { targetLevel, targetDate } = valid.value;
      const { data, error } = await admin
        .from("learning_goals")
        .upsert(
          {
            user_id: userId,
            language: course,
            target_level: targetLevel,
            target_date: targetDate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,language" },
        )
        .select("created_at")
        .single();
      if (error || !data) throw new Error(error?.message ?? "no row");
      const plan = planFor(
        course,
        state,
        { level: targetLevel, date: targetDate },
        data.created_at,
      );
      return json({
        goal: { course, targetLevel, targetDate, createdAt: isoTime(data.created_at) },
        plan,
      });
    }

    // GET: preview when a candidate is supplied, otherwise the stored goal.
    const level = params.get("targetLevel");
    const date = params.get("targetDate");
    if (level !== null || date !== null) {
      const state = await loadLearnerState(admin, userId, course);
      const valid = validateGoalInput(
        { course, targetLevel: level, targetDate: date },
        { now: new Date(), currentLevel: state.currentLevel },
      );
      if (!valid.ok) return json({ error: valid.error }, 400);
      const plan = planFor(
        course,
        state,
        { level: valid.value.targetLevel, date: valid.value.targetDate },
        null,
      );
      return json({ plan });
    }

    const stored = await admin
      .from("learning_goals")
      .select("target_level,target_date,created_at")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle();
    if (stored.error) throw new Error(stored.error.message);
    if (!stored.data) return json({ goal: null, plan: null });
    const targetLevel = stored.data.target_level as Level;
    const state = await loadLearnerState(admin, userId, course);
    const plan = planFor(
      course,
      state,
      {
        level: LEVEL_ORDER.includes(targetLevel) ? targetLevel : "A1",
        date: stored.data.target_date,
      },
      stored.data.created_at,
    );
    return json({
      goal: {
        course,
        targetLevel,
        targetDate: stored.data.target_date,
        createdAt: isoTime(stored.data.created_at),
      },
      plan,
    });
  } catch (error) {
    console.error(`[learning-goal] ${method} failed: ${(error as Error).message}`);
    return method === "PUT" ? json({ error: "Could not save your goal." }, 500) : loadFailed();
  }
}

export const Route = createFileRoute("/api/learning-goal")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, "GET"),
      PUT: ({ request }) => handle(request, "PUT"),
      DELETE: ({ request }) => handle(request, "DELETE"),
    },
  },
});
