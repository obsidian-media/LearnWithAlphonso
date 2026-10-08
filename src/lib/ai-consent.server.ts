import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consumeQuotaFor, verifyAuth, type QuotaKind } from "./ai-quota.server";

/**
 * AI consent is on the account (profiles.ai_consent_at) and every AI endpoint enforces it. Order everywhere: auth
 * (401), consent (403), quota (429), so a refused request never spends quota. ENFORCE_AI_CONSENT=false is the
 * emergency switch: every check passes and nothing is read. Edge mirror: supabase/functions/_shared/ai-consent.ts.
 */
export const AI_CONSENT_REQUIRED = "ai-consent-required" as const;

export function isAiConsentEnforced(): boolean {
  return process.env.ENFORCE_AI_CONSENT !== "false";
}

type ConsentReader = Pick<SupabaseClient<Database>, "from">;

export async function readAiConsent(
  db: ConsentReader,
  userId: string,
): Promise<"granted" | "missing" | "error"> {
  const { data, error } = await db
    .from("profiles")
    .select("ai_consent_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "ai_consent_read_failed", error: error.message }));
    return "error";
  }
  return data?.ai_consent_at ? "granted" : "missing";
}

/** For paths that degrade to local grading: anything but a stored consent means "no AI". */
export async function hasAiConsent(db: ConsentReader, userId: string): Promise<boolean> {
  if (!isAiConsentEnforced()) return true;
  return (await readAiConsent(db, userId)) === "granted";
}

/**
 * null = go ahead. A 403 means the learner has not allowed AI; a 503 means the read failed, which must not be
 * shown to a learner who did consent as a consent problem.
 */
export async function requireAiConsent(
  userId: string,
  opts: { db?: ConsentReader; route?: string } = {},
): Promise<Response | null> {
  if (!isAiConsentEnforced()) return null;
  const db = opts.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const state = await readAiConsent(db, userId);
  if (state === "granted") return null;
  if (state === "error") return Response.json({ error: "consent-check-failed" }, { status: 503 });
  console.info(JSON.stringify({ event: "ai_consent_denied", route: opts.route ?? "unknown" }));
  return Response.json({ error: AI_CONSENT_REQUIRED }, { status: 403 });
}

type UserClient = Extract<Awaited<ReturnType<typeof verifyAuth>>, { ok: true }>["supabase"];
export type AuthorizedAi =
  { ok: true; userId: string; supabase: UserClient } | { ok: false; response: Response };

/** Auth, then consent (unless the route is exempt), then quota. */
export async function authorizeAiRequest(
  request: Request,
  kind: QuotaKind,
  opts: { route: string; requireConsent?: boolean },
): Promise<AuthorizedAi> {
  const auth = await verifyAuth(request);
  if (!auth.ok)
    return { ok: false, response: Response.json({ error: auth.message }, { status: auth.status }) };
  if (opts.requireConsent !== false) {
    const denied = await requireAiConsent(auth.userId, { db: auth.supabase, route: opts.route });
    if (denied) return { ok: false, response: denied };
  }
  const quota = await consumeQuotaFor(auth.supabase, kind);
  if (!quota.ok)
    return {
      ok: false,
      response: Response.json({ error: quota.message }, { status: quota.status }),
    };
  return { ok: true, userId: auth.userId, supabase: auth.supabase };
}
