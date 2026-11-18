// Supabase Edge Function: finish-branching-story (the handler; index.ts only serves it)
//
// Records a finished path through an interactive branching story for the native apps. The web reaches the same database
// function through its own server function (src/lib/stories.functions.ts); the apps cannot call that, and
// public.finish_branching_story is service-role only, so this function authenticates the learner, takes the verified user
// id from the token (never the body), checks the account is not banned, validates the shape of the request and calls it.
// The database function re-walks the stored graph from the chosen option indexes and decides the ending and the one-time
// reading credit (supabase/migrations/20261122100000_branching_stories.sql); a client-claimed ending is never read.
// Same authentication as complete-story-check.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { suspendedResponseIfBanned } from "../_shared/account-status.ts";

// The option index chosen at each choice node, in order. A branching story has a handful of choice points, so the cap
// only stops an absurd body; the database walk is the real check.
const bodySchema = z.object({
  storyId: z.string().uuid(),
  path: z.array(z.number().int().min(0).max(9)).max(30),
});

export type FinishBranchingStoryDeps = {
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

export function liveDeps(): FinishBranchingStoryDeps {
  return {
    authenticate,
    admin: () =>
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      }),
  };
}

export function createFinishBranchingStoryHandler(
  deps: FinishBranchingStoryDeps,
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

    const { data, error } = await deps.admin().rpc("finish_branching_story", {
      _user_id: auth.userId,
      _story_id: body.storyId,
      _path: body.path,
    });
    // One transaction: an error here means nothing was recorded and the client may simply retry.
    if (error || !data) return jsonResponse({ error: "Could not save the path; retry" }, 503);

    const status = (data as { status?: string }).status;
    if (status === "applied") return jsonResponse(data, 200);
    if (status === "not-found") return jsonResponse({ error: "not-found" }, 404);
    if (status === "invalid") return jsonResponse({ error: "invalid-path" }, 400);
    return jsonResponse({ error: "Could not save the path; retry" }, 503);
  };
}
