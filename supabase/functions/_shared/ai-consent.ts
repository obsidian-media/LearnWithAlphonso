// Edge mirror of src/lib/ai-consent.server.ts's hasAiConsent. complete-lesson and grade-review call it before the AI
// grader; without consent the curated verdict stands and nothing is sent to NVIDIA.
// ENFORCE_AI_CONSENT=false (a Supabase secret) allows without reading.
export function isAiConsentEnforced(): boolean {
  return Deno.env.get("ENFORCE_AI_CONSENT") !== "false";
}

// deno-lint-ignore no-explicit-any
type ConsentReader = { from: (table: string) => any };

export async function hasAiConsent(admin: ConsentReader, userId: string): Promise<boolean> {
  if (!isAiConsentEnforced()) return true;
  const { data, error } = await admin.from("profiles").select("ai_consent_at").eq("id", userId).maybeSingle();
  if (error) {
    console.error(JSON.stringify({ event: "ai_consent_read_failed", error: error.message }));
    return false;
  }
  return !!(data as { ai_consent_at?: string | null } | null)?.ai_consent_at;
}
