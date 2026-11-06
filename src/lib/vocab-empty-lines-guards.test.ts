import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PR #351 leaves a word's meaning empty (the data has no real gloss yet) and its example empty for quiz-style
// prompts. Every place that prints them must skip an empty line instead of drawing an empty row or box.
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("empty word meanings and examples are not drawn", () => {
  it("web: every printed meaning and example sits behind its own check", () => {
    const web = read("src/routes/_authenticated/lesson.$id.tsx");
    const printed = [...web.matchAll(/\{v\.(meaning|example)\}/g)];
    // The word card prints each once (the Studio Ink word list went with the round-6 lesson).
    expect(printed.length).toBe(2);
    for (const m of printed) {
      const before = web.slice(Math.max(0, m.index! - 260), m.index);
      expect(before, `{v.${m[1]}} at ${m.index}`).toMatch(new RegExp(`\\{v\\.${m[1]} && \\(?`));
    }
  });

  it("Android: the vocab card prints meaning and example only when they have text", () => {
    const kt = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/lesson/LessonScreen.kt",
    );
    const printed = [...kt.matchAll(/Text\(item\.(meaning|example)\b/g)];
    expect(printed.length).toBe(2);
    for (const m of printed) {
      const before = kt.slice(Math.max(0, m.index! - 120), m.index);
      expect(before, `item.${m[1]}`).toContain(`if (item.${m[1]}.isNotEmpty())`);
    }
  });
});
