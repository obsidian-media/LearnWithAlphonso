// Supabase Edge Function: send-push
//
// Thin HTTP wrapper around ../_shared/apns.ts, invoked only by the
// nudges_push_after_insert database trigger
// (supabase/migrations/20260921030000_remote_push_notifications.sql) via
// pg_net -- not intended to be called from any client directly (no
// user-facing use case needs to send an arbitrary push to an arbitrary
// user). See
// docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md.
//
// Authenticated the same way every other Edge Function in this repo
// Authenticated by a shared secret, not a user JWT: it sends a push to an
// arbitrary target user, which no ordinary user token may do. See auth.ts.
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../_shared/apns.ts";
import { isAuthorizedPushCaller } from "./auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Deployed with --no-verify-jwt (the trigger's dedicated secret is not a JWT), so this check is the only gate.
  // See auth.ts for what is accepted and why.
  if (
    !serviceRoleKey ||
    !isAuthorizedPushCaller(req, { pushSecret: Deno.env.get("SEND_PUSH_SECRET"), serviceRoleKey })
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { userId?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const { userId, title, body: message, data } = body;
  if (!userId || !title || !message) {
    return jsonResponse({ error: "userId, title, and body are required" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  const result = await sendPushToUser(admin, userId, title, message, data ?? {});
  return jsonResponse(result, 200);
}

Deno.serve(handleRequest);
