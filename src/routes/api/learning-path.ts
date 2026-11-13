import { createFileRoute } from "@tanstack/react-router";
import { isCourse } from "@/data/courses";
import { TRIM_DAYS } from "@/data/path-config";
import { saveLearnerProfileFor } from "@/lib/learner-profile.server";
import { learnerProfilePatchSchema } from "@/lib/learner-profile";
import { buildLearningPath } from "@/lib/learning-path-data";
import { loadPathData } from "@/lib/learning-path.server";

/**
 * The learning path (docs/superpowers/specs/2026-11-12-learning-path-design.md): ONE pure engine (planPath) runs here
 * and web, iOS and Android render its answer, so the three can never disagree. Nothing new is stored: the plan is
 * derived from the goal, the first-run answers, the skills data, lessons, podcasts and practice calls. The learner's
 * choices (types switched off, "lessons first" until a date) live with the first-run answers in
 * user_metadata.learner_profile.
 *
 *   GET ?course=en                                        { path } or { path: null } when there is no goal yet
 *   PUT { course, action: "set_off", off: ["podcast"] }   switches
 *   PUT { course, action: "lessons_first" }               trim the optional types for TRIM_DAYS days
 *   PUT { course, action: "resume" }                      back to the full mix
 *   PUT { course, action: "set_daily_minutes", dailyMinutes: 15 }   one of 5, 10, 15, 20
 * Everything is scoped to the user id of the verified token.
 */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function authenticate(request: Request, admin: Admin): Promise<string | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  return data.user.id;
}

async function handle(request: Request, method: "GET" | "PUT"): Promise<Response> {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const auth = await authenticate(request, admin);
  if (typeof auth !== "string") return auth;
  const userId = auth;

  let body: Record<string, unknown> | null = null;
  if (method === "PUT") {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }
  const course = method === "PUT" ? body?.course : new URL(request.url).searchParams.get("course");
  if (typeof course !== "string" || !isCourse(course)) return json({ error: "Unknown course" }, 400);

  try {
    if (method === "PUT") {
      let patch: unknown;
      if (body?.action === "set_off") patch = { pathOff: body.off };
      else if (body?.action === "lessons_first")
        patch = {
          pathTrimUntil: new Date(Date.now() + TRIM_DAYS * 86_400_000).toISOString().slice(0, 10),
        };
      else if (body?.action === "resume") patch = { pathTrimUntil: null };
      else if (body?.action === "set_daily_minutes") patch = { dailyMinutes: body.dailyMinutes };
      else return json({ error: "Unknown action" }, 400);
      const checked = learnerProfilePatchSchema.safeParse(patch);
      if (!checked.success) return json({ error: "That choice cannot be saved." }, 400);
      await saveLearnerProfileFor(admin, userId, { patch: checked.data }, async () => ({
        error: null,
      }));
    }
    const data = await loadPathData(admin, userId, course, new Date());
    if (!data) return json({ path: null });
    return json({ path: buildLearningPath(data) });
  } catch (error) {
    console.error(`[learning-path] ${method} failed: ${(error as Error).message}`);
    return json({ error: "Could not load your path." }, 500);
  }
}

export const Route = createFileRoute("/api/learning-path")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, "GET"),
      PUT: ({ request }) => handle(request, "PUT"),
    },
  },
});
