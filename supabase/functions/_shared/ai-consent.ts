// Edge mirror of src/lib/ai-consent.server.ts's hasAiConsent. complete-lesson and grade-review call it before the AI
// grader; without consent the curated verdict stands and nothing is sent to the AI provider.
// There is no environment-controlled bypass: only stored account consent permits AI.

// deno-lint-ignore no-explicit-any
type ConsentReader = { from: (table: string) => any };

/**
 * Edge twin of src/lib/app-switches.server.ts for the "ai" switch (table public.app_switches). Off means the
 * curated verdict stands, exactly as without consent. A failed read counts as ON. Not cached: an Edge Function
 * instance serves one request.
 */
export async function isAiSwitchedOn(admin: ConsentReader): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("app_switches")
      .select("enabled")
      .eq("key", "ai")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { enabled?: boolean } | null)?.enabled !== false;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "app_switch_read_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return true;
  }
}

/** The one read of the consent row, shared by hasAiConsent and hasAiConsentOrThrow (they differ only on an error). */
async function readConsentAt(
  admin: ConsentReader,
  userId: string,
): Promise<{ consented: boolean; error: { message: string } | null }> {
  const { data, error } = await admin
    .from("profiles")
    .select("ai_consent_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { consented: false, error };
  return {
    consented: !!(data as { ai_consent_at?: string | null } | null)?.ai_consent_at,
    error: null,
  };
}

export async function hasAiConsent(admin: ConsentReader, userId: string): Promise<boolean> {
  if (!(await isAiSwitchedOn(admin))) return false;
  const { consented, error } = await readConsentAt(admin, userId);
  if (error) {
    console.error(JSON.stringify({ event: "ai_consent_read_failed", error: error.message }));
    return false;
  }
  return consented;
}

/** The consent row could not be read. Distinct from "no consent": a caller that WRITES a verdict must not guess. */
export class AiConsentReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConsentReadError";
  }
}

/**
 * Like hasAiConsent, but an unreadable consent row throws AiConsentReadError instead of reading as "no consent".
 * complete-lesson uses it: "no consent" keeps the curated verdict (a translate answer that is only right by the AI's
 * judgement is marked wrong), so guessing it on a failed read would save a wrong grade, which is a write from data
 * that was never read.
 */
export async function hasAiConsentOrThrow(admin: ConsentReader, userId: string): Promise<boolean> {
  if (!(await isAiSwitchedOn(admin))) return false;
  const { consented, error } = await readConsentAt(admin, userId);
  if (error) {
    console.error(JSON.stringify({ event: "ai_consent_read_failed", error: error.message }));
    throw new AiConsentReadError(error.message);
  }
  return consented;
}
