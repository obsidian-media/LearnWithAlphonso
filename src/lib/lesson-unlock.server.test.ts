import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCourse } from "../data/courses";
import { lessonStartVerdict } from "./lesson-unlock.server";
import { lessonsInLearningOrder } from "./lesson-unlock";
import { chainable, type ChainCall } from "./__testutils__/supabase-mock";

const USER = "user-1";
const order = lessonsInLearningOrder(
  getCourse("en").curriculum.flatMap((u) => u.lessons.map((l) => ({ id: l.id, level: u.level }))),
);
const first = order[0]!.id;
const second = order[1]!.id;
const firstA2 = order.find((l) => l.level === "A2")!.id;

function db(opts: { done: string[]; level: string | null; fail?: "completions" | "progress" }) {
  const calls: Record<string, ChainCall[]> = {};
  const client = {
    from(table: string) {
      calls[table] = [];
      if (table === "lesson_completions") {
        return chainable(
          opts.fail === "completions"
            ? { data: null, error: { message: "x" } }
            : { data: opts.done.map((lesson_id) => ({ lesson_id })), error: null },
          calls[table],
        );
      }
      return chainable(
        opts.fail === "progress"
          ? { data: null, error: { message: "x" } }
          : { data: opts.level ? { cefr_level: opts.level } : null, error: null },
        calls[table],
      );
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
const verdict = (d: ReturnType<typeof db>, id: string) =>
  lessonStartVerdict(d.client, USER, "en", id);

describe("lessonStartVerdict (web server read)", () => {
  it("refuses a lesson ahead of a fresh learner (the u5l1 case) and opens the first", async () => {
    expect(await verdict(db({ done: [], level: null }), "u5l1")).toBe("locked");
    expect(await verdict(db({ done: [], level: null }), first)).toBe("unlocked");
  });

  it("opens the next lesson after what they finished, and a replay", async () => {
    const d = db({ done: [first], level: "A1" });
    expect(await verdict(d, second)).toBe("unlocked");
    expect(await verdict(d, first)).toBe("unlocked");
  });

  it("honours a stored (placement) level", async () => {
    expect(await verdict(db({ done: [], level: "A2" }), firstA2)).toBe("unlocked");
    expect(await verdict(db({ done: [], level: "A1" }), firstA2)).toBe("locked");
  });

  it("reads only this learner's rows, in this course", async () => {
    const d = db({ done: [], level: null });
    await verdict(d, first);
    for (const table of ["lesson_completions", "language_progress"]) {
      const eqs = d.calls[table]!.filter((c) => c.method === "eq").map((c) => c.args);
      expect(eqs).toEqual([
        ["user_id", USER],
        ["language", "en"],
      ]);
    }
  });

  it("a failed read is unknown, never locked", async () => {
    expect(await verdict(db({ done: [], level: null, fail: "completions" }), "u5l1")).toBe(
      "unknown",
    );
    expect(await verdict(db({ done: [], level: null, fail: "progress" }), "u5l1")).toBe("unknown");
  });
});
