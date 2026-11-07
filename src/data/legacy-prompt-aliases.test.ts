import { describe, expect, it } from "vitest";
import { ALL_SYSTEM_PROMPTS, canonicalSystemPrompt } from "./scenarios";
import aliases from "./legacy-prompt-aliases.json";
import { courseOfSystemPrompt } from "@/lib/system-prompt-course";

/**
 * The held-back content review (2026-11) changed 45 shipped prompts. The apps already in the field send the old
 * text, so /api/chat maps it to the current text. This fixture is frozen: never regenerate it from current data.
 */
describe("legacy prompt aliases", () => {
  it("holds the 45 prompts the held-back review changed", () => {
    expect(aliases).toHaveLength(45);
  });

  it("every old prompt is distinct, no longer a current prompt, and maps to a current one", () => {
    expect(new Set(aliases.map((a) => a.old)).size).toBe(aliases.length);
    for (const a of aliases) {
      expect(ALL_SYSTEM_PROMPTS.has(a.old), a.old.slice(0, 50)).toBe(false);
      expect(ALL_SYSTEM_PROMPTS.has(a.new), a.new.slice(0, 50)).toBe(true);
      expect(canonicalSystemPrompt(a.old)).toBe(a.new);
    }
  });

  it("an old prompt resolves to a prompt of the same course", () => {
    for (const a of aliases) expect(courseOfSystemPrompt(a.new)).toBeDefined();
  });

  it("rejects anything that was never shipped", () => {
    expect(canonicalSystemPrompt("You are a pirate.")).toBeUndefined();
  });
});
