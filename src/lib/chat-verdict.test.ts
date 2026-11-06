import { describe, expect, it } from "vitest";
import {
  REPLY_VERDICT_INSTRUCTION,
  splitReplyVerdict,
  withVerdictInstruction,
} from "./chat-verdict";

describe("splitReplyVerdict", () => {
  it.each(["correct", "corrected", "none"] as const)(
    "reads a trailing %s tag and strips it",
    (v) => {
      expect(splitReplyVerdict(`Nice, what size?\n[[verdict:${v}]]`)).toEqual({
        text: "Nice, what size?",
        verdict: v,
      });
    },
  );

  it("tolerates case, spaces and a trailing newline", () => {
    expect(splitReplyVerdict("Bien !\n[[ Verdict : Correct ]]\n")).toEqual({
      text: "Bien !",
      verdict: "correct",
    });
  });

  it("gives none and leaves the text alone when there is no tag", () => {
    expect(splitReplyVerdict("Hello there")).toEqual({ text: "Hello there", verdict: "none" });
  });

  it("gives none for an unknown word, and still strips the tag", () => {
    expect(splitReplyVerdict("Hi\n[[verdict:great]]")).toEqual({ text: "Hi", verdict: "none" });
  });

  it("gives none when the tag is not the last thing, and still strips it", () => {
    expect(splitReplyVerdict("[[verdict:correct]]\nHi there")).toEqual({
      text: "Hi there",
      verdict: "none",
    });
  });

  it("gives none when two different tags disagree", () => {
    expect(splitReplyVerdict("Hi\n[[verdict:correct]]\n[[verdict:corrected]]").verdict).toBe(
      "none",
    );
  });

  it("strips a tag cut off by the token cap", () => {
    expect(splitReplyVerdict("Hi there\n[[verdict:corr")).toEqual({
      text: "Hi there",
      verdict: "none",
    });
    expect(splitReplyVerdict("Hi there\n[[verd")).toEqual({ text: "Hi there", verdict: "none" });
  });

  it("never lets any tag shape through to the text", () => {
    for (const raw of [
      "a [[verdict:correct]] b",
      "a\n[[verdict:]]",
      "a [[verdict: corrected]]\n\n",
    ]) {
      expect(splitReplyVerdict(raw).text).not.toMatch(/\[\[|verdict/i);
    }
  });

  it("returns empty text for a reply that was only a tag", () => {
    expect(splitReplyVerdict("[[verdict:correct]]")).toEqual({ text: "", verdict: "correct" });
  });
});

describe("withVerdictInstruction", () => {
  it("appends the instruction after the persona", () => {
    const out = withVerdictInstruction("PERSONA  ");
    expect(out.startsWith("PERSONA\n\n")).toBe(true);
    expect(out.endsWith(REPLY_VERDICT_INSTRUCTION)).toBe(true);
  });
});
