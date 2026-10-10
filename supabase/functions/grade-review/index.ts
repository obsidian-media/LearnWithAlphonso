// Supabase Edge Function: grade-review
//
// 1:1 port of src/lib/review.functions.ts's gradeReview handler -- the
// trust-boundary piece of SM-2 review grading a Swift client can't
// implement directly (re-deriving correctness against the real question
// needs the real question content + can't trust a client-supplied
// `correct` boolean, same reasoning as complete-lesson). See
// docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md
// for the general pattern this follows.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the Supabase platform. No LESSON_SESSION_SECRET needed
// here -- gradeReview never required a session token on the web side
// either (the due_on <= today check below is what prevents grading a
// never-actually-reviewed item).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeReviewOutcome } from "./srs.ts";
import { gradeSelfContained, isSelfContainedSource } from "./self-contained.ts";
// Moved to _shared/ so complete-lesson can reuse the identical grading
// logic for lesson completions (§0.1-d #6) instead of a second hand-kept copy.
import { hasAiConsent } from "../_shared/ai-consent.ts";
import { deriveAnswerCorrectness, type QuestionRow } from "../_shared/answer-correctness.ts";
import { makeTranslateQuotaCheck } from "../_shared/ai-quota.ts";

const courseSchema = z.enum(["en", "fr", "es"]);
const itemKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+:[a-z0-9]+$/, "invalid item key");
const gradeReviewSchema = z.object({
  itemKey: itemKeySchema,
  answer: z.string().max(200),
  course: courseSchema,
  attemptId: z.string().min(1).max(200).optional(),
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<{ userId: string; userClient: SupabaseClient } | Response> {
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
  return { userId: data.claims.sub as string, userClient: anonClient };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId, userClient } = auth;
  const checkQuota = makeTranslateQuotaCheck(userClient);

  let parsed: z.infer<typeof gradeReviewSchema>;
  try {
    parsed = gradeReviewSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse({ error: "Invalid request body", details: `${err}` }, 400);
  }
  const { itemKey, answer, course, attemptId } = parsed;
  const [lessonId, questionId] = itemKey.split(":");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const today = todayStr();

  // A queued native retry may arrive after the first request committed but
  // its response was lost. Return the original result before checking due_on.
  if (attemptId) {
    const { data: previous, error: attemptError } = await admin
      .from("review_grade_attempts")
      .select("result,item_key,language")
      .eq("user_id", userId)
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (attemptError) return jsonResponse({ error: "Could not load review attempt" }, 503);
    if (previous) {
      if (previous.item_key !== itemKey || previous.language !== course) {
        return jsonResponse({ error: "Review attempt identity collision" }, 400);
      }
      return jsonResponse(previous.result, 200);
    }
  }

  const { data: row, error: rowError } = await admin
    .from("review_items")
    .select("*")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .eq("language", course)
    .maybeSingle();
  if (rowError) return jsonResponse({ error: "Could not load review item" }, 503);

  // If a first attempt committed between the early replay lookup and this
  // row read, the row can now be retired/not-due. Check the receipt again.
  if (attemptId && (!row || row.due_on > today)) {
    const { data: committed, error: committedError } = await admin
      .from("review_grade_attempts")
      .select("result,item_key,language")
      .eq("user_id", userId)
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (committedError) return jsonResponse({ error: "Could not load review attempt" }, 503);
    if (committed) {
      if (committed.item_key !== itemKey || committed.language !== course) {
        return jsonResponse({ error: "Review attempt identity collision" }, 400);
      }
      return jsonResponse(committed.result, 200);
    }
  }

  if (!row) {
    return jsonResponse({ retired: false, dueOn: today }, 200);
  }
  if (row.due_on > today) {
    return jsonResponse({ error: "This item isn't due yet" }, 400);
  }

  let correct: boolean;
  if (isSelfContainedSource(row.source)) {
    correct = gradeSelfContained(row, answer);
  } else {
    const { data: question, error: questionError } = await admin
      .from("questions")
      // `prompt` and `bank` are here for "translate": the curated phrasings
      // live in `bank`, and the prompt is what the AI grader is marking
      // against. Without them a translate row grades as a bare string
      // comparison against its canonical answer alone.
      .select("type, prompt, choices, bank, answer_index, answer_text")
      .eq("lesson_id", lessonId)
      .eq("id", questionId)
      .maybeSingle();
    if (questionError) return jsonResponse({ error: "Could not load review question" }, 503);
    if (!question) {
      return jsonResponse({ error: "Unknown review item" }, 400);
    }
    // The AI step runs only with account consent; without it the curated verdict stands.
    let consent: Promise<boolean> | undefined;
    const ai = {
      allowed: () => (consent ??= hasAiConsent(admin, userId)),
      checkQuota,
    };
    correct = await deriveAnswerCorrectness(question as QuestionRow, answer, course, ai);
    if (consent && !(await consent)) {
      console.log(
        JSON.stringify({
          event: "ai_grading_skipped",
          fn: "grade-review",
          reason: "no-ai-consent",
        }),
      );
    }
  }

  // Same overdue-growth-bonus reasoning as review.functions.ts's gradeReview.
  const sinceIso = row.last_reviewed_at ?? row.created_at;
  const elapsedDays = Math.max(
    0,
    Math.round((Date.now() - new Date(sinceIso).getTime()) / 86_400_000),
  );

  const outcome = computeReviewOutcome(
    {
      correct,
      ease: row.ease,
      intervalDays: row.interval_days,
      repetitions: row.repetitions,
      lapses: row.lapses,
      elapsedDays,
    },
    today,
    addDays,
  );

  const { data: transition, error: transitionError } = await admin.rpc("apply_review_grade", {
    _user_id: userId,
    _item_key: itemKey,
    _language: course,
    _attempt_id: attemptId ?? null,
    _expected_last_reviewed_at: row.last_reviewed_at,
    _expected_due_on: row.due_on,
    _retired: outcome.retired,
    _correct: correct,
    _new_due_on: outcome.dueOn,
    _ease: outcome.retired ? null : outcome.ease,
    _interval_days: outcome.retired ? null : outcome.intervalDays,
    _repetitions: outcome.retired ? null : outcome.repetitions,
    _lapses: outcome.retired ? null : outcome.lapses,
  });
  if (transitionError || !transition) {
    return jsonResponse({ error: "Could not save review grade" }, 503);
  }
  if (transition.status === "conflict") {
    return jsonResponse({ error: "Review changed; retry" }, 503);
  }
  if (transition.status === "not_due") {
    return jsonResponse({ error: "This item isn't due yet" }, 400);
  }
  if (transition.status === "missing") {
    return jsonResponse({ retired: false, dueOn: today }, 200);
  }
  if (transition.status !== "applied") {
    return jsonResponse({ error: "Unknown review transition" }, 503);
  }
  return jsonResponse(
    { retired: transition.retired, dueOn: transition.dueOn, correct: transition.correct },
    200,
  );
}

Deno.serve(handleRequest);
