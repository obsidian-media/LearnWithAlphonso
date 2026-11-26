import { describe, expect, it } from "vitest";
import { loadMemoryPrimingMessage, memoryTopics } from "./hector-memory.server";

const ev = (category: string, n = 1) =>
  Array.from({ length: n }, (_, i) => ({
    category,
    event_type: "detected",
    created_at: `2026-11-0${i + 1}T00:00:00Z`,
  }));

describe("Hector memory topics are per course", () => {
  it("keeps an English-only category for English and drops it for Spanish and French", () => {
    const events = [...ev("phrasal-verbs", 3), ...ev("articles")];
    expect(memoryTopics(events, "en")).toEqual(["phrasal-verbs", "articles"]);
    expect(memoryTopics(events, "es")).toEqual(["articles"]);
    expect(memoryTopics(events, "fr")).toEqual(["articles"]);
  });

  it("reads only the most recent weakness events, newest first", async () => {
    const calls: Record<string, unknown[]> = {};
    const db = {
      from: (t: string) => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit"])
          q[m] = (...args: unknown[]) => {
            (calls[`${t}.${m}`] ??= []).push(args);
            return q;
          };
        q.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
        return q;
      },
    };
    await loadMemoryPrimingMessage(db, "u1", "es");
    expect(calls["weakness_events.limit"]).toEqual([[50]]);
    // Only this course's events: the filter on the course column, next to the learner's own.
    expect(calls["weakness_events.eq"]).toContainEqual(["course", "es"]);
    expect(calls["weakness_events.eq"]).toContainEqual(["user_id", "u1"]);
    expect(calls["weakness_events.order"]).toEqual([["created_at", { ascending: false }]]);
  });
});
