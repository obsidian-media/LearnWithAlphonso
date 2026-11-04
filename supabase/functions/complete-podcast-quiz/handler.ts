// Supabase Edge Function: complete-podcast-quiz (the handler; index.ts only serves it)
//
// Grades a learner's answers to an episode's quiz and pays listening-practice XP. All of the rules (grading from the
// stored key, 10 XP per correct answer, pay only the improvement over the stored best, the shared hourly ceiling,
// the access check) live in one database transaction, public.submit_podcast_quiz
// (supabase/migrations/20261104100200_podcast_quiz.sql); this function only authenticates, validates the shape of the
// request, and translates the result. It never trusts a client-sent score: the request carries the chosen answers.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The shared rolling-hour ceiling. Keep equal to complete-lesson/anti-farming.ts (handler.test.ts compares them): a
// function directory deploys on its own, so it does not import from a sibling.
export const HOURLY_COMPLETION_LIMIT = 60;

const bodySchema = z.object({
  episodeId: z.string().uuid(),
  answers: z
    .array(z.object({ questionId: z.string().regex(/^q[0-9]{1,2}$/), choiceIndex: z.number().int().min(0).max(3) }))
    .min(1)
    .max(10),
});

export type CompletePodcastQuizDeps = {
  authenticate: (req: Request) => Promise<{ userId: string } | Response>;
  admin: () => SupabaseClient;
  now: () => Date;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function authenticate(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized: missing bearer token" }, 401);
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  return { userId: data.claims.sub as string };
}

export function liveDeps(): CompletePodcastQuizDeps {
  return {
    authenticate,
    admin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      }),
    now: () => new Date(),
  };
}

export function createCompletePodcastQuizHandler(deps: CompletePodcastQuizDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const auth = await deps.authenticate(req);
    if (auth instanceof Response) return auth;

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await req.json());
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const now = deps.now();
    const { data, error } = await deps.admin().rpc("submit_podcast_quiz", {
      _user_id: auth.userId,
      _episode_id: body.episodeId,
      _answers: body.answers,
      _at: now.toISOString(),
      _today: now.toISOString().slice(0, 10),
      _limit: HOURLY_COMPLETION_LIMIT,
    });
    // Not fail-open like the lesson ceiling: the ceiling and the payout are one transaction, so an error here means
    // nothing was paid and the client may simply retry.
    if (error || !data) return jsonResponse({ error: "Could not save the quiz; retry" }, 503);

    const status = (data as { status?: string }).status;
    if (status === "applied") return jsonResponse(data, 200);
    if (status === "not-found") return jsonResponse({ error: "not-found" }, 404);
    if (status === "invalid") return jsonResponse({ error: "invalid-answers" }, 400);
    if (status === "rate-limited") {
      console.log(JSON.stringify({ event: "completion_refused", fn: "complete-podcast-quiz", reason: "rate-limited" }));
      return jsonResponse({ error: "rate-limited" }, 429);
    }
    return jsonResponse({ error: "Could not save the quiz; retry" }, 503);
  };
}
