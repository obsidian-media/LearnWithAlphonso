// Edge mirror of src/lib/ai-consent.server.ts's hasAiConsent. complete-lesson and grade-review call it before the AI
// grader; without consent the curated verdict stands and nothing is sent to NVIDIA.
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
    const { data, error } = await admin.from("app_switches").select("enabled").eq("key", "ai").maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { enabled?: boolean } | null)?.enabled !== false;
  } catch (e) {
    console.error(JSON.stringify({ event: "app_switch_read_failed", error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
}

export async function hasAiConsent(admin: ConsentReader, userId: string): Promise<boolean> {
  if (!(await isAiSwitchedOn(admin))) return false;
  const { data, error } = await admin.from("profiles").select("ai_consent_at").eq("id", userId).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "ai_consent_read_failed", error: error.message }));
    return false;
  }
  return !!(data as { ai_consent_at?: string | null } | null)?.ai_consent_at;
}
