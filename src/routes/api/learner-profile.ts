import { createFileRoute } from "@tanstack/react-router";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import {
  LearnerProfileSaveError,
  learnerProfileSaveInput,
  saveLearnerProfileFor,
} from "@/lib/learner-profile.server";

/**
 * The first-run answers for the iOS and Android apps (visual round 6, part 3): the same checked save the web's
 * saveLearnerProfile server function makes (learner-profile.server.ts), behind a Bearer token like every other
 * /api route the apps call. Every read and write is scoped to the user id from the verified token.
 *
 *   GET                        { profile }   the parsed learner_profile (bad values dropped)
 *   PUT { patch, mark? }       { profile }   merged; mark is "completed" or "dismissed" (the server's time)
 *
 * The patch is strict: an unknown key (a birth date, say) or a value off the lists (an under-13 range) is a 400 and
 * nothing is written.
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

  if (method === "GET") {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return json({ error: "Couldn't read your account. Try again." }, 500);
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    return json({ profile: parseLearnerProfile(meta[LEARNER_PROFILE_KEY]) });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = learnerProfileSaveInput.safeParse(body);
  if (!parsed.success) return json({ error: "Those answers can't be saved." }, 400);
  try {
    const profile = await saveLearnerProfileFor(admin, userId, parsed.data, (country) =>
      admin.from("profiles").update({ country }).eq("id", userId),
    );
    return json({ profile });
  } catch (error) {
    const message =
      error instanceof LearnerProfileSaveError
        ? error.message
        : "Couldn't save your answers. Try again.";
    console.error(`[learner-profile] PUT failed: ${(error as Error).message}`);
    return json({ error: message }, 500);
  }
}

export const Route = createFileRoute("/api/learner-profile")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, "GET"),
      PUT: ({ request }) => handle(request, "PUT"),
    },
  },
});
