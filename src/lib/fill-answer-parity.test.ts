import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Question } from "../data/curriculum";
import { deriveAnswerCorrectness, normaliseFillAnswer } from "./srs";

// The fill-in rule lives twice: here for the player and the web servers, and in the Deno copy the complete-lesson
// and grade-review Edge Functions (the native apps' path) grade with. If they differed, one platform would accept
// "l’ami" and the other mark it wrong. The Deno file cannot be imported here (it imports Deno-only modules), so the
// block between the markers is compared as text; answer-correctness.test.ts runs the same vectors under Deno.
const block = (path: string) => {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const m = /\/\/ FILL-ANSWER-NORMALISER:BEGIN[\s\S]*?\/\/ FILL-ANSWER-NORMALISER:END/.exec(src);
  expect(m, path).not.toBeNull();
  return m![0];
};

const fill = (answer: string): Question =>
  ({ id: "q", type: "fill", prompt: "___", answer, bank: [answer], explanation: "" }) as Question;

describe("fill-in answers", () => {
  it("are normalised by the same code on the web and in the Edge Functions", () => {
    expect(block("supabase/functions/_shared/answer-correctness.ts")).toBe(block("src/lib/srs.ts"));
  });

  it.each([
    ["l’ami", "l'ami"], // iOS smart punctuation
    ["aujourd‘hui", "aujourd'hui"],
    ["c ʼest", "c'est"],
    ["  Je  m'appelle ", "je m'appelle"],
    ["s' il vous plaît", "s'il vous plaît"],
    ["à\u00a0bientôt", "à bientôt"], // a no-break space from a French keyboard
  ])("accepts %j for the key %j", (typed, key) => {
    expect(deriveAnswerCorrectness(fill(key), typed, "fr")).toBe(true);
  });

  it("accepts a decomposed accent (o + combining circumflex) against the composed key", () => {
    expect(deriveAnswerCorrectness(fill("bientôt"), "bientôt".normalize("NFD"), "fr")).toBe(true);
  });

  it("still marks a different word wrong", () => {
    expect(deriveAnswerCorrectness(fill("l'ami"), "l'amie", "fr")).toBe(false);
    expect(deriveAnswerCorrectness(fill("meet"), "meat")).toBe(false);
    expect(normaliseFillAnswer("Good")).toBe("good");
  });
});
