// Supabase Edge Function: complete-story-check (the handler; index.ts only serves it)
//
// Grades a learner's answers to a graded story's comprehension check for the native apps. The web reaches the same
// database function through its own server function (src/lib/stories.functions.ts, completeStoryCheck); the apps cannot
// call that, and public.submit_story_check is service-role only, so this function authenticates the learner, takes the
// verified user id from the token, validates the shape of the request and calls it. All of the rules (grading from the
// stored key, the reading credit given once for a learner's first attempt, the best score) live in that one database
// function (supabase/migrations/20261121100000_graded_stories.sql). It never trusts a client-sent score or user id: the
// request carries the chosen answers.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { suspendedResponseIfBanned } from "../_shared/account-status.ts";

const bodySchema = z.object({
  storyId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^q[0-9]{1,2}$/),
        choiceIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(10),
});

export type CompleteStoryCheckDeps = {
  authenticate: (req: Request) => Promise<{ userId: string } | Response>;
  admin: () => SupabaseClient;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer "))
    return jsonResponse({ error: "Unauthorized: missing bearer token" }, 401);
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3)
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub)
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
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

export function liveDeps(): CompleteStoryCheckDeps {
  return {
    authenticate,
    admin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      }),
  };
}

export function createCompleteStoryCheckHandler(
  deps: CompleteStoryCheckDeps,
): (req: Request) => Promise<Response> {
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

    const { data, error } = await deps.admin().rpc("submit_story_check", {
      _user_id: auth.userId,
      _story_id: body.storyId,
      _answers: body.answers,
    });
    // One transaction: an error here means nothing was recorded and the client may simply retry.
    if (error || !data) return jsonResponse({ error: "Could not save the check; retry" }, 503);

    const status = (data as { status?: string }).status;
    if (status === "applied") return jsonResponse(data, 200);
    if (status === "not-found") return jsonResponse({ error: "not-found" }, 404);
    if (status === "invalid") return jsonResponse({ error: "invalid-answers" }, 400);
    return jsonResponse({ error: "Could not save the check; retry" }, 503);
  };
}
