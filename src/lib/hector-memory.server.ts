import { openMemoryCategories, type WeaknessEventRow } from "./profile-overview";
import { WEAKNESS_TAXONOMY } from "./weakness-detection.server";
import { topicLabel } from "./call-recap";
import { hectorTopicLabel } from "./hector-greeting";
import type { Course } from "../data/courses";
import type { ChatMessage } from "./hector-conversation";

/**
 * Hector's memory on the web, the same idea as iOS's TutorMemoryContext, but built by the SERVER from the learner's own
 * rows, so a client cannot inject prompt text. Four sources, all read for this learner and this course:
 *  - weakness_events: open weakness categories (only labels from our own taxonomy reach the prompt);
 *  - tutor_memory "mistake" lines: the topic and the corrected form Hector's earlier calls saved;
 *  - tutor_memory "phrase" lines: phrases the learner took away from a call;
 *  - review_items from weak spots: what the learner's lessons and Review keep getting wrong.
 * Every part is optional: a brand-new learner gets no message, like a first call.
 */
const TAXONOMY = new Set<string>(WEAKNESS_TAXONOMY);
const MAX_TOPICS = 3;
const MAX_MISTAKES = 3;
const MAX_PHRASES = 2;
const MAX_WEAK_ITEMS = 3;
/** The most recent weakness events read: bounds the query, and old events stop steering the prompt. */
const MAX_EVENTS = 50;
const SNIPPET = 90;

export type MemoryParts = {
  topics: string[];
  mistakes: { label: string; fixed: string }[];
  phrases: { text: string; meaning: string | null }[];
  weakItems: string[];
};

/** Open categories, most open first, kept only when they are one of our taxonomy labels. */
export function memoryTopics(events: WeaknessEventRow[], course: Course): string[] {
  return openMemoryCategories(events)
    .filter((c) => TAXONOMY.has(c) && hectorTopicLabel(course, c) !== null)
    .slice(0, MAX_TOPICS);
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, SNIPPET);

export function buildMemoryPrimingMessage(parts: Partial<MemoryParts>): ChatMessage | null {
  const topics = (parts.topics ?? []).filter((c) => TAXONOMY.has(c)).slice(0, MAX_TOPICS);
  const mistakes = (parts.mistakes ?? []).slice(0, MAX_MISTAKES);
  const phrases = (parts.phrases ?? []).slice(0, MAX_PHRASES);
  const weakItems = (parts.weakItems ?? []).map(oneLine).filter(Boolean).slice(0, MAX_WEAK_ITEMS);
  const lines: string[] = [];
  if (topics.length) {
    lines.push(
      "They have recently been working on: " +
        topics.map((c) => c.replace(/-/g, " ")).join(", ") +
        ".",
    );
  }
  if (mistakes.length) {
    lines.push(
      "In earlier calls they slipped on: " +
        mistakes
          .map((m) => `${oneLine(m.label)} (the right form: "${oneLine(m.fixed)}")`)
          .join("; ") +
        ".",
    );
  }
  if (phrases.length) {
    lines.push(
      "Phrases they took from earlier calls: " +
        phrases
          .map((p) => `"${oneLine(p.text)}"${p.meaning ? ` (${oneLine(p.meaning)})` : ""}`)
          .join("; ") +
        ".",
    );
  }
  if (weakItems.length) {
    lines.push("Their lessons and Review keep tripping them on: " + weakItems.join("; ") + ".");
  }
  if (lines.length === 0) return null;
  return {
    role: "user",
    content:
      "[Background for you, the tutor, not part of what the learner said. " +
      lines.join(" ") +
      " Bring one of these into the conversation naturally and practise it with them, and say when they get it right. " +
      "Do not recite this list back, and do not mention that you were given it.]",
  };
}

type Builder = {
  select: (c: string) => Builder;
  eq: (k: string, v: string) => Builder;
  order: (c: string, o: { ascending: boolean }) => Builder;
  limit: (n: number) => Builder;
} & PromiseLike<{ data: unknown; error?: unknown }>;
export type MemoryDb = { from: (t: string) => unknown };

async function read<T>(
  label: string,
  run: () => PromiseLike<{ data: unknown; error?: unknown }>,
): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) {
      console.error(JSON.stringify({ event: "hector_memory_read_failed", source: label }));
      return [];
    }
    return (Array.isArray(data) ? data : []) as T[];
  } catch {
    console.error(JSON.stringify({ event: "hector_memory_read_failed", source: label }));
    return [];
  }
}

/** Best-effort: a failed read just means this turn has less memory, but it is logged, never silent. */
export async function loadMemoryPrimingMessage(
  db: MemoryDb,
  userId: string,
  course: Course,
): Promise<ChatMessage | null> {
  const t = (name: string) => (db as { from: (n: string) => Builder }).from(name);
  const [events, memory, weak] = await Promise.all([
    read<WeaknessEventRow>("weakness_events", () =>
      t("weakness_events")
        .select("category,event_type,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(MAX_EVENTS),
    ),
    read<{ kind: string; memory_key: string; text: string; detail: string | null }>(
      "tutor_memory",
      () =>
        t("tutor_memory")
          .select("kind,memory_key,text,detail,last_seen_at")
          .eq("user_id", userId)
          .eq("course", course)
          .order("last_seen_at", { ascending: false })
          .limit(8),
    ),
    read<{ weakness_display: string | null }>("review_items", () =>
      t("review_items")
        .select("weakness_display")
        .eq("user_id", userId)
        .eq("language", course)
        .eq("source", "weakness")
        .order("ease", { ascending: true })
        .limit(MAX_WEAK_ITEMS),
    ),
  ]);
  const mistakes = memory
    .filter((r) => r.kind === "mistake")
    .flatMap((r) => {
      const label = topicLabel(course, r.memory_key);
      return label ? [{ label, fixed: r.text }] : [];
    });
  const phrases = memory
    .filter((r) => r.kind === "phrase")
    .map((r) => ({ text: r.text, meaning: r.detail }));
  return buildMemoryPrimingMessage({
    topics: memoryTopics(events, course),
    mistakes,
    phrases,
    weakItems: weak.flatMap((w) => (w.weakness_display ? [w.weakness_display] : [])),
  });
}
