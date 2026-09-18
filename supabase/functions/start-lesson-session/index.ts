// Supabase Edge Function: start-lesson-session
//
// Issues the HMAC session token that complete-lesson requires as proof a
// real "the client opened this lesson" event happened before the
// completion claim (see complete-lesson/lesson-session.ts and
// src/lib/lesson-session.server.ts). On the web app this token comes from
// startLessonSession, a TanStack Start server function reachable only via
// the web app's own RPC layer -- not something the native iOS client can
// call. This function is that same issuance, exposed over plain HTTP so
// ProgressSyncClient.startLessonSession (Swift) can call it too.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY are auto-injected by the
// Supabase platform. LESSON_SESSION_SECRET must be set explicitly
// (`supabase secrets set LESSON_SESSION_SECRET=...`) and MUST match the
// same value used by the web app and by complete-lesson, or tokens issued
// here won't verify there.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { issueLessonSessionToken } from "./lesson-session.ts";

const courseSchema = z.enum(["en", "fr"]);
const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");
const startSessionSchema = z.object({
  lessonId: lessonIdSchema,
  course: courseSchema,
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<{ userId: string } | Response> {
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
  return { userId: data.claims.sub as string };
}

/** Scoped to the claimed course, matching complete-lesson's own findLesson. */
async function lessonExists(course: string, lessonId: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin
    .from("lessons")
    .select("id, units!inner(course)")
    .eq("id", lessonId)
    .eq("units.course", course)
    .maybeSingle();
  return !error && !!data;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let parsed: z.infer<typeof startSessionSchema>;
  try {
    parsed = startSessionSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse(
      { error: "Invalid request body", details: `${err}` },
      400,
    );
  }
  const { lessonId, course } = parsed;

  if (!(await lessonExists(course, lessonId))) {
    return jsonResponse({ error: "Lesson not found" }, 404);
  }

  const token = issueLessonSessionToken({ userId, lessonId, course });
  return jsonResponse({ token }, 200);
}

Deno.serve(handleRequest);
