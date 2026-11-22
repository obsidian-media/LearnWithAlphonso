// Supabase Edge Function: start-lesson-session (the handler; index.ts only serves it)
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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { suspendedResponseIfBanned } from "../_shared/account-status.ts";
import { issueLessonSessionToken, type LessonSessionClaim } from "./lesson-session.ts";
import { heartsGate, heartsGateEnforced, MAX_HEARTS, outOfHeartsBody } from "../_shared/hearts.ts";
import { isLessonUnlocked } from "../_shared/lesson-unlock.ts";
import { heartsProCachedAnyAge, heartsUnlimitedOrUnknown } from "../_shared/hearts-pro.ts";

// Was missing "es" -- same gap and same fix as complete-lesson/index.ts,
// which verifies the token this issues and must agree on what a valid
// course is.
const courseSchema = z.enum(["en", "fr", "es"]);
const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");
const startSessionSchema = z.object({
  lessonId: lessonIdSchema,
  course: courseSchema,
});

/**
 * Everything the handler reaches outside itself, so handler.test.ts can drive the real handler with fakes.
 * `liveDeps()` is what production uses.
 */
export type StartLessonSessionDeps = {
  authenticate: (req: Request) => Promise<{ userId: string } | Response>;
  admin: () => SupabaseClient;
  /** ENFORCE_HEARTS_GATE: the emergency off switch for the hearts gate (default on). */
  heartsGateEnforced: () => boolean;
  /** Alphonso Pro: unlimited hearts. null = could not be established (never read as "not Pro"). */
  heartsUnlimited: (admin: SupabaseClient, userId: string) => Promise<boolean | null>;
  /** The last stored Pro answer at any age (null = none). The fallback when heartsUnlimited is null. Absent = none. */
  heartsProCached?: (admin: SupabaseClient, userId: string) => Promise<boolean | null>;
  /**
   * Whether this learner may start the lesson (the shared rule, _shared/lesson-unlock.ts, from their own
   * completions and stored level). "unknown" (a failed read) lets them in: it must never lock anyone out.
   */
  lessonStartVerdict: (
    admin: SupabaseClient,
    userId: string,
    course: string,
    lessonId: string,
  ) => Promise<"unlocked" | "locked" | "unknown">;
  issueToken: (claim: LessonSessionClaim) => string;
  now: () => number;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request): Promise<{ userId: string } | Response> {
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
  // A banned learner's token stays valid until it expires; the ban must not wait for that.
  const banned = await suspendedResponseIfBanned(
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    }),
    data.claims.sub as string,
  );
  if (banned) return banned;
  return { userId: data.claims.sub as string };
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export function liveDeps(): StartLessonSessionDeps {
  return {
    authenticate,
    admin: adminClient,
    heartsGateEnforced: () => heartsGateEnforced(),
    heartsUnlimited: (admin, userId) => heartsUnlimitedOrUnknown(admin, userId),
    heartsProCached: (admin, userId) => heartsProCachedAnyAge(admin, userId),
    lessonStartVerdict,
    issueToken: issueLessonSessionToken,
    now: () => Date.now(),
  };
}

/**
 * Scoped to the claimed course, matching complete-lesson's own findLesson. A failed read is "unknown", never
 * "missing": a 404 would tell the app the lesson does not exist (permanent) when the database was only busy.
 */
async function lessonExists(
  admin: SupabaseClient,
  course: string,
  lessonId: string,
): Promise<boolean | "read-failed"> {
  const { data, error } = await admin
    .from("lessons")
    .select("id, units!inner(course)")
    .eq("id", lessonId)
    .eq("units.course", course)
    .maybeSingle();
  if (error) return "read-failed";
  return !!data;
}

/** Every lesson of a course in CURRICULUM order (units.sort_order, then lessons.sort_order), read in pages. */
async function courseLessonOrder(
  admin: SupabaseClient,
  course: string,
): Promise<{ id: string; level: string }[] | null> {
  type Row = { id: string; sort_order: number; units: { level_id: string; sort_order: number } };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("lessons")
      .select("id, sort_order, units!inner(level_id, sort_order, course)")
      .eq("units.course", course)
      .order("id")
      .range(from, from + 999);
    if (error || !data) return null;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  rows.sort((a, b) => a.units.sort_order - b.units.sort_order || a.sort_order - b.sort_order);
  return rows.map((r) => ({ id: r.id, level: r.units.level_id }));
}

export async function lessonStartVerdict(
  admin: SupabaseClient,
  userId: string,
  course: string,
  lessonId: string,
): Promise<"unlocked" | "locked" | "unknown"> {
  const [order, done, level] = await Promise.all([
    courseLessonOrder(admin, course),
    admin
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("language", course),
    admin
      .from("language_progress")
      .select("cefr_level")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
  ]);
  if (!order || done.error || level.error) {
    console.error(
      JSON.stringify({ event: "lesson_unlock_read_failed", fn: "start-lesson-session" }),
    );
    return "unknown";
  }
  const completed = new Set((done.data ?? []).map((r: { lesson_id: string }) => r.lesson_id));
  return isLessonUnlocked(order, completed, level.data?.cefr_level, lessonId)
    ? "unlocked"
    : "locked";
}

/**
 * A missing row means a new learner with a full set (the column defaults to 5). A failed read FAILS OPEN:
 * the gate is an economy rule, not a security boundary, and a learner must never be locked out of lessons
 * because a read failed. The outcome is a token (neither a rejection nor a write), and the failure is logged so it
 * shows in the function logs.
 */
async function readHearts(
  admin: SupabaseClient,
  userId: string,
): Promise<{ hearts: number; heartsRefillAt: number | null } | null> {
  const { data, error } = await admin
    .from("user_progress")
    .select("hearts, hearts_refill_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      JSON.stringify({
        event: "hearts_gate_read_failed",
        fn: "start-lesson-session",
        message: error.message,
      }),
    );
    return null;
  }
  if (!data) return { hearts: MAX_HEARTS, heartsRefillAt: null };
  return {
    hearts: typeof data.hearts === "number" ? data.hearts : MAX_HEARTS,
    heartsRefillAt: data.hearts_refill_at ? new Date(data.hearts_refill_at).getTime() : null,
  };
}

export function createStartLessonSessionHandler(
  deps: StartLessonSessionDeps,
): (req: Request) => Promise<Response> {
  return (req) => handleRequest(req, deps);
}

async function handleRequest(req: Request, deps: StartLessonSessionDeps): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await deps.authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let parsed: z.infer<typeof startSessionSchema>;
  try {
    parsed = startSessionSchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const { lessonId, course } = parsed;

  const admin = deps.admin();
  const exists = await lessonExists(admin, course, lessonId);
  if (exists === "read-failed") return jsonResponse({ error: "Could not load lesson" }, 503);
  if (!exists) return jsonResponse({ error: "Lesson not found" }, 404);

  // Unlock order is enforced here, not only drawn by the Learn screen: no token for a lesson this learner has not
  // unlocked (409 lesson-locked; the apps treat any other 409 as a failed start).
  if ((await deps.lessonStartVerdict(admin, userId, course, lessonId)) === "locked") {
    return jsonResponse({ error: "lesson-locked" }, 409);
  }

  // Alphonso Pro has unlimited hearts. Asked on every start (cached for up to an hour) so lose_heart() also honours
  // it for the whole lesson. null = not established (RevenueCat unreachable): never read as "not Pro".
  const unlimited = deps.heartsUnlimited(admin, userId);

  // No lesson starts at 0 hearts, on any client, except for Pro. The web's startLessonSession server function runs
  // the same heartsGate. Review and practice never come through here, so they never cost or need hearts.
  if (deps.heartsGateEnforced()) {
    const state = await readHearts(admin, userId);
    if (state) {
      const gate = heartsGate(state.hearts, state.heartsRefillAt, deps.now());
      if (gate.blocked) {
        let pro = await unlimited;
        if (pro === null) {
          // Pro could not be established (RevenueCat unreachable): the last stored answer at any age, and with none
          // the learner is treated as not Pro, so the normal out-of-hearts answer applies. Never a 503 here.
          const cached = deps.heartsProCached ? await deps.heartsProCached(admin, userId) : null;
          pro = cached ?? false;
          console.error(
            JSON.stringify({
              event: cached === null ? "hearts_gate_pro_unknown" : "hearts_gate_stale_pro",
              fn: "start-lesson-session",
            }),
          );
        }
        if (!pro) return jsonResponse(outOfHeartsBody(gate.refillAt), 409);
      }
    }
  }
  await unlimited;

  const token = deps.issueToken({ userId, lessonId, course });
  return jsonResponse({ token }, 200);
}
