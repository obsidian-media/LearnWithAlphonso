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
// authenticates its caller's JWT (this repo still uses the legacy
// service_role key for server-to-server calls -- see the design doc's
// "Server-side trigger mechanism" section for why that's the right
// choice here specifically, not a leftover). The trigger sends
// `Authorization: Bearer <service_role key>`; this function requires the
// claims to resolve to the service_role, not just any authenticated
// user, since it's meant to send push to an arbitrary target user, which
// no ordinary user JWT should be able to do.
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../_shared/apns.ts";

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

  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Deliberately a plain string-equality check against the raw secret,
  // not a JWT-claims decode -- the caller here is always our own
  // database trigger (a machine-to-machine call, no end user involved),
  // so there's no "which user is this" question to answer, only "is this
  // really our own trigger." Mirrors LESSON_SESSION_SECRET's
  // shared-secret verification shape (lesson-session.ts), not
  // complete-lesson's user-JWT verification shape -- different callers,
  // different trust model.
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
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
