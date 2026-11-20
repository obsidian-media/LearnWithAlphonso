import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  correctionInstruction,
  displayText,
  extractCorrection,
  visibleWhileStreaming,
  type HectorCorrection,
} from "./hector-correction";

type Fixture = {
  extract: { name: string; raw: string; text: string; correction: HectorCorrection | null }[];
  streams: { name: string; chunks: string[]; visible: string[]; final: string }[];
  learner: { text: string; shown: string }[];
};
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../../shared/hector-corrections.json"),
    "utf8",
  ),
) as Fixture;

describe("hector correction parser (shared/hector-corrections.json)", () => {
  for (const c of fixture.extract) {
    it(`extract: ${c.name}`, () => {
      expect(extractCorrection(c.raw)).toEqual({ text: c.text, correction: c.correction });
    });
  }
  for (const s of fixture.streams) {
    it(`stream: ${s.name}`, () => {
      let acc = "";
      const seen = s.chunks.map((chunk) => {
        acc += chunk;
        return visibleWhileStreaming(acc);
      });
      expect(seen).toEqual(s.visible);
      expect(extractCorrection(acc).text).toBe(s.final);
    });
  }
  for (const l of fixture.learner) {
    it(`learner text is never parsed: ${l.text.slice(0, 20)}`, () => {
      expect(displayText("user", l.text)).toBe(l.shown);
      expect(l.shown).toBe(l.text);
    });
  }

  it("at every possible chunk boundary no half tag is visible and the text only grows", () => {
    for (const c of fixture.extract.filter((e) => !e.raw.includes("<correctional"))) {
      let prev = "";
      for (let i = 0; i <= c.raw.length; i++) {
        const v = visibleWhileStreaming(c.raw.slice(0, i));
        expect(v.toLowerCase()).not.toContain("<correction");
        expect(v.toLowerCase()).not.toContain("</correction");
        expect(v.startsWith(prev) || prev.startsWith(v)).toBe(true);
        prev = v;
      }
    }
  });

  it("a finished assistant reply is parsed, a learner's identical text is not", () => {
    const raw = 'Hi\n<correction>{"slip":"a","fix":"b"}</correction>';
    expect(displayText("assistant", raw)).toBe("Hi");
    expect(displayText("user", raw)).toBe(raw);
  });
});

describe("correctionInstruction", () => {
  const text = correctionInstruction("French");
  it("asks for at most one block, only for a meaningful error in the last message", () => {
    expect(text).toContain("LAST message");
    expect(text).toContain("At most one block");
    expect(text).toContain("<correction>");
    expect(text).toContain("typo");
    expect(text).toContain("in French");
  });

  it("rule 1: a misspelling of a known word is a typo, so no block", () => {
    expect(text).toContain("misspelling of a word the learner clearly knows");
    expect(text).toContain("realy for really");
    expect(text).toContain("add no block");
  });

  it("rule 2: the slip is the shortest span of the exact words, the fix corrects exactly that span", () => {
    expect(text).toContain("SHORTEST span of the learner's exact words");
    expect(text).toContain("usually 1 to 4 words");
    expect(text).toContain(`slip "don't", fix "doesn't"`);
    expect(text).toContain("never the whole sentence unless the whole sentence is the error");
    expect(text).toContain("corrected version of exactly that span");
  });

  it("rule 3: the card teaches, the reply answers what was meant and never explains or quizzes", () => {
    expect(text).toContain("THE CARD TEACHES");
    expect(text).toContain("answers what the learner MEANT");
    expect(text).toContain("keeps the conversation going");
    expect(text).toContain("never explain the rule, point out the mistake, or quiz the learner");
    expect(text).toContain("the note in the block does the teaching");
  });

  it("rule 4: the note shows the pattern and never guesses a grammar reason (live check: a false 'feminine so -s')", () => {
    expect(text).toContain("tiny example (une glace, des glaces)");
    expect(text).toContain("REASON only for a core");
    expect(text).toContain("never guess a reason");
    expect(text).toContain("When unsure, show the example and give no reason");
    expect(text).not.toContain("encouraging sentence in French on why");
  });

  it("rule 4: the card rule is the last rule before the closing line, with one worked example", () => {
    expect(text.indexOf("THE CARD TEACHES")).toBeGreaterThan(text.indexOf("At most one block"));
    expect(text.indexOf("THE CARD TEACHES")).toBeGreaterThan(text.indexOf("Keep the tone warm"));
    expect(text).toContain("What does she drink instead?");
    expect(text).toContain(`{"slip":"don't","fix":"doesn't"`);
    expect(text.trimEnd().endsWith("Now write your reply.")).toBe(true);
  });
});
