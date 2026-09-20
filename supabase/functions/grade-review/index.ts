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
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeReviewOutcome } from "./srs.ts";

const courseSchema = z.enum(["en", "fr"]);
const itemKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+:[a-z0-9]+$/, "invalid item key");
const gradeReviewSchema = z.object({
  itemKey: itemKeySchema,
  answer: z.string().max(200),
  course: courseSchema,
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

type QuestionRow = {
  type: "mc" | "fill";
  choices: string[] | null;
  answer_index: number | null;
  answer_text: string | null;
};

/** Mirrors deriveAnswerCorrectness (src/lib/srs.ts) against the DB row shape. */
function deriveAnswerCorrectness(question: QuestionRow, answer: string): boolean {
  if (question.type === "mc") {
    return (question.choices ?? [])[question.answer_index ?? -1] === answer;
  }
  return answer.trim().toLowerCase() === (question.answer_text ?? "").trim().toLowerCase();
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let parsed: z.infer<typeof gradeReviewSchema>;
  try {
    parsed = gradeReviewSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse(
      { error: "Invalid request body", details: `${err}` },
      400,
    );
  }
  const { itemKey, answer, course } = parsed;
  const [lessonId, questionId] = itemKey.split(":");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const today = todayStr();

  const { data: row } = await admin
    .from("review_items")
    .select("*")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .eq("language", course)
    .maybeSingle();

  if (!row) {
    return jsonResponse({ retired: false, dueOn: today }, 200);
  }
  if (row.due_on > today) {
    return jsonResponse({ error: "This item isn't due yet" }, 400);
  }

  let correct: boolean;
  if (row.source === "weakness") {
    const choices = row.choices as string[] | null;
    correct = choices?.[row.answer_index as number] === answer;
  } else {
    const { data: question } = await admin
      .from("questions")
      .select("type, choices, answer_index, answer_text")
      .eq("lesson_id", lessonId)
      .eq("id", questionId)
      .maybeSingle();
    if (!question) {
      return jsonResponse({ error: "Unknown review item" }, 400);
    }
    correct = deriveAnswerCorrectness(question as QuestionRow, answer);
  }

  // Same overdue-growth-bonus reasoning as review.functions.ts's gradeReview.
  const sinceIso = row.last_reviewed_at ?? row.created_at;
  const elapsedDays = Math.max(0, Math.round((Date.now() - new Date(sinceIso).getTime()) / 86_400_000));

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

  if (outcome.retired) {
    await admin
      .from("review_items")
      .delete()
      .eq("user_id", userId)
      .eq("item_key", itemKey)
      .eq("language", course);
    // V3 package 3b: same resolved-event logging as review.functions.ts's
    // gradeReview -- see that file's comment.
    if (row.source === "weakness" && row.weakness_label) {
      await admin
        .from("weakness_events")
        .insert({ user_id: userId, category: row.weakness_label, event_type: "resolved" });
    }
    return jsonResponse({ retired: true, dueOn: outcome.dueOn }, 200);
  }

  await admin
    .from("review_items")
    .update({
      ease: outcome.ease,
      interval_days: outcome.intervalDays,
      repetitions: outcome.repetitions,
      lapses: outcome.lapses,
      due_on: outcome.dueOn,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .eq("language", course);

  return jsonResponse({ retired: false, dueOn: outcome.dueOn }, 200);
}

Deno.serve(handleRequest);
