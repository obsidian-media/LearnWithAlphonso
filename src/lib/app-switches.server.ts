/**
 * Off switches the owner can flip in the database without a deploy (table public.app_switches, service role only):
 *   "ai"    every AI feature: conversation, speech, AI grading, word lookup, and the tutor
 *   "tutor" the paid voice tutor only
 * Lessons, reviews and progress never read these, so turning AI off leaves ordinary learning working.
 *
 * To turn one off: UPDATE public.app_switches SET enabled = false, updated_at = now() WHERE key = 'ai';
 * It takes effect within SWITCH_CACHE_MS on every server instance. The Edge twin is
 * supabase/functions/_shared/ai-consent.ts (isAiSwitchedOn).
 */
export type AppSwitch = "ai" | "tutor";

export const SWITCH_CACHE_MS = 30_000;

type SwitchReader = {
  from: (table: "app_switches") => {
    select: (columns: string) => PromiseLike<{
      data: { key: string; enabled: boolean }[] | null;
      error: { message: string } | null;
    }>;
  };
};

let cache: { at: number; off: Set<string> } | null = null;

/** For tests. */
export function resetSwitchCache(): void {
  cache = null;
}

/**
 * True unless the switch is stored as off. A failed read counts as ON: the switches exist to stop a problem on
 * purpose, and a database blip must not take AI away from everyone by accident.
 */
export async function isSwitchOn(
  key: AppSwitch,
  opts: { db?: SwitchReader; now?: number } = {},
): Promise<boolean> {
  const now = opts.now ?? Date.now();
  if (!cache || now - cache.at >= SWITCH_CACHE_MS) {
    try {
      const db =
        opts.db ??
        ((await import("@/integrations/supabase/client.server"))
          .supabaseAdmin as unknown as SwitchReader);
      const { data, error } = await db.from("app_switches").select("key,enabled");
      if (error || !Array.isArray(data)) throw new Error(error?.message ?? "no rows");
      cache = { at: now, off: new Set(data.filter((r) => r.enabled === false).map((r) => r.key)) };
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "app_switch_read_failed",
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      // Keep the last known state if there is one; otherwise treat everything as on. Not cached, so the
      // next request tries again.
      return cache ? !cache.off.has(key) : true;
    }
  }
  return !cache.off.has(key);
}
