import { openMemoryCategories, type WeaknessEventRow } from "./profile-overview";
import { WEAKNESS_TAXONOMY } from "./weakness-detection.server";
import type { ChatMessage } from "./hector-conversation";

/**
 * Hector's memory on the web, the same as iOS's TutorMemoryContext: the learner's open weakness categories, primed
 * as one leading user turn. The SERVER builds it from the learner's own weakness_events, so a client cannot inject
 * prompt text, and only labels from our own taxonomy can ever reach the prompt (never raw learner text).
 */
const TAXONOMY = new Set<string>(WEAKNESS_TAXONOMY);
const MAX_TOPICS = 3;

/** Open categories, most open first, kept only when they are one of our taxonomy labels. */
export function memoryTopics(events: WeaknessEventRow[]): string[] {
  return openMemoryCategories(events)
    .filter((c) => TAXONOMY.has(c))
    .slice(0, MAX_TOPICS);
}

export function buildMemoryPrimingMessage(topics: string[]): ChatMessage | null {
  const safe = topics.filter((c) => TAXONOMY.has(c)).slice(0, MAX_TOPICS);
  if (safe.length === 0) return null;
  return {
    role: "user",
    content:
      "[Background for you, the tutor, not part of what the learner said: they've recently been working on: " +
      safe.map((c) => c.replace(/-/g, " ")).join(", ") +
      ". Use this naturally if it's relevant, but don't just recite it back.]",
  };
}

/** Best-effort: a failed read just means this turn has no memory, like a brand-new learner. */
export async function loadMemoryPrimingMessage(
  db: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => PromiseLike<{ data: WeaknessEventRow[] | null }>;
      };
    };
  },
  userId: string,
): Promise<ChatMessage | null> {
  try {
    const { data } = await db
      .from("weakness_events")
      .select("category,event_type,created_at")
      .eq("user_id", userId);
    return buildMemoryPrimingMessage(memoryTopics(data ?? []));
  } catch {
    return null;
  }
}
