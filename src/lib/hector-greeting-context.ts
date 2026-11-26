import type { Course } from "../data/courses";
import { hectorTopicLabel, pickGreetingVariant } from "./hector-greeting";

/**
 * What the web Hector call reads before it speaks: the topic of the learner's newest saved mistake (their own
 * tutor_memory rows, RLS-scoped, written at the end of earlier calls) and which of the greeting's wordings to use.
 * Both are best effort: with neither, Hector still says a (varied) hello.
 */
type MemoryQuery = {
  select: (c: string) => MemoryQuery;
  eq: (k: string, v: string) => MemoryQuery;
  order: (c: string, o: { ascending: boolean }) => MemoryQuery;
  limit: (n: number) => PromiseLike<{ data: { memory_key: string }[] | null; error: unknown }>;
};

/** The newest remembered mistake topic Hector can name in this course, or null. */
export async function rememberedTopic(
  db: { from: (t: string) => unknown },
  course: Course,
): Promise<string | null> {
  try {
    const { data, error } = await (db.from("tutor_memory") as MemoryQuery)
      .select("memory_key")
      .eq("course", course)
      .eq("kind", "mistake")
      .order("last_seen_at", { ascending: false })
      .limit(5);
    if (error) {
      console.warn("[hector] memory topic read failed");
      return null;
    }
    return (data ?? []).find((r) => hectorTopicLabel(course, r.memory_key))?.memory_key ?? null;
  } catch {
    console.warn("[hector] memory topic read failed");
    return null;
  }
}

const variantKey = (course: Course) => `hector.greeting.variant.${course}`;

/** A variant other than the one this device said last (when it can tell), remembered for next time. */
export function chooseGreetingVariant(
  course: Course,
  random: number = Math.random(),
  store: Pick<Storage, "getItem" | "setItem"> | null = safeStorage(),
): number {
  let last: number | null = null;
  try {
    const raw = store?.getItem(variantKey(course));
    last = raw === null || raw === undefined ? null : Number.parseInt(raw, 10);
    if (Number.isNaN(last)) last = null;
  } catch {
    last = null;
  }
  const variant = pickGreetingVariant(last, random);
  try {
    store?.setItem(variantKey(course), String(variant));
  } catch {
    /* a private window: the variant is still random */
  }
  return variant;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
