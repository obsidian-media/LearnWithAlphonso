/**
 * Small pieces the Practice call screens share: the search params the pre-call sheet passes, and the slip shown on
 * the result screen.
 */
export type PracticeModeSearch = { mode?: "call" | "chat" };
export type CampaignSearch = PracticeModeSearch & { scene?: number };

export function practiceModeSearch(search: Record<string, unknown>): PracticeModeSearch {
  return search.mode === "call" || search.mode === "chat" ? { mode: search.mode } : {};
}

/** ?scene=N, a whole number from 0 below `sceneCount`; anything else is dropped (the campaign starts at scene 1). */
export function campaignSearch(
  search: Record<string, unknown>,
  sceneCount: number,
): CampaignSearch {
  const raw = typeof search.scene === "number" ? search.scene : Number(search.scene);
  const scene = Number.isInteger(raw) && raw >= 0 && raw < sceneCount ? raw : undefined;
  return { ...practiceModeSearch(search), ...(scene !== undefined ? { scene } : {}) };
}

type Turn = { role: "user" | "assistant"; content: string; verdict?: string; opener?: boolean };

/**
 * The learner's first reply that Alphonso corrected, with his reply (which carries the correction), or null. Read
 * from the call's own transcript; display only, the stars never come from here.
 */
export function firstSlip(
  messages: readonly Turn[],
  from = 0,
): { said: string; reply: string } | null {
  for (let i = Math.max(1, from); i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    if (m.role === "assistant" && m.verdict === "corrected" && prev.role === "user") {
      return { said: prev.content, reply: m.content };
    }
  }
  return null;
}
