import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Question } from "../data/curriculum";
import { deriveAnswerCorrectness } from "./srs";
import { decideVerdict, knownWordConfusion } from "./translation-grader.server";

// One answer-grading fixture set, run by every runtime that grades a learner answer locally: this file (web), the
// Deno copy in supabase/functions/_shared/grading-parity.test.ts, the Swift Kit's GradingParityTests and the
// Android core's GradingParityTest. They all read tests/fixtures/grading-parity.json, so a rule that changes in one
// place and not the others turns a case red somewhere. Every runtime must produce `expected`; there is no per-runtime
// exception.
type Runtime = "web" | "deno" | "ios" | "android";
type Case = {
  id: string;
  kind:
    "mc" | "fill" | "reorder" | "listening" | "speak" | "translate" | "typo-verdict" | "confusion";
  course?: "en" | "fr" | "es";
  input?: string;
  answer?: string;
  choices?: string[];
  answerIndex?: number;
  acceptable?: string[];
  submission?: string;
  reply?: Record<string, unknown>;
  /** Goal-flavoured versions of the question: the input is right when it is right for the case OR for any of these. */
  variants?: Variant[];
  expected: boolean;
  runtimes?: Runtime[];
  note?: string;
};
type Variant = {
  choices?: string[];
  answerIndex?: number;
  answer?: string;
  bank?: string[];
  acceptable?: string[];
};
const GOAL_NAMES = ["travel", "work", "school", "family", "exam", "fun"] as const;

/** The fixture's variants as the Question.goalVariants a curriculum would carry (one goal each, in order). */
function goalVariantsOf(c: Case): Question["goalVariants"] {
  if (!c.variants) return undefined;
  const out: NonNullable<Question["goalVariants"]> = {};
  c.variants.forEach((v, i) => {
    out[GOAL_NAMES[i]!] = {
      prompt: "v",
      explanation: "e",
      ...(v.choices ? { choices: v.choices } : {}),
      ...(v.answerIndex !== undefined ? { answer: v.answerIndex } : {}),
      ...(v.answer !== undefined ? { answer: v.answer } : {}),
      ...(v.bank ? { bank: v.bank } : {}),
      ...(v.acceptable ? { acceptableAnswers: v.acceptable } : {}),
    };
  });
  return out;
}

const RUNTIME: Runtime = "web";
const fixture = JSON.parse(readFileSync("tests/fixtures/grading-parity.json", "utf8")) as {
  cases: Case[];
};
const applicable = fixture.cases.filter((c) =>
  (c.runtimes ?? ["web", "deno", "ios", "android"]).includes(RUNTIME),
);

function grade(c: Case): boolean {
  const course = c.course ?? "en";
  switch (c.kind) {
    case "typo-verdict":
      return decideVerdict(JSON.stringify(c.reply), c.acceptable ?? [], c.submission ?? "")!
        .correct;
    case "confusion":
      return knownWordConfusion(c.input!, c.acceptable ?? []) !== null;
    case "mc":
      return deriveAnswerCorrectness(
        {
          id: "q",
          type: "mc",
          prompt: "p",
          choices: c.choices!,
          answer: c.answerIndex!,
          explanation: "e",
          goalVariants: goalVariantsOf(c),
        } as Question,
        c.input!,
        course,
      );
    case "translate":
      return deriveAnswerCorrectness(
        {
          id: "q",
          type: "translate",
          prompt: "p",
          acceptableAnswers: c.acceptable!,
          explanation: "e",
          goalVariants: goalVariantsOf(c),
        } as Question,
        c.input!,
        course,
      );
    default:
      return deriveAnswerCorrectness(
        {
          id: "q",
          type: c.kind,
          prompt: "p",
          answer: c.answer!,
          explanation: "e",
          // A fill question carries its bank; the base bank is not graded, so a stand-in is enough.
          ...(c.kind === "fill" ? { bank: [c.answer!] } : {}),
          goalVariants: goalVariantsOf(c),
        } as unknown as Question,
        c.input!,
        course,
      );
  }
}

describe("grading parity fixture (web)", () => {
  it("has unique case ids and covers every question type", () => {
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of [
      "mc",
      "fill",
      "reorder",
      "listening",
      "speak",
      "translate",
      "typo-verdict",
      "confusion",
    ]) {
      expect(
        fixture.cases.some((c) => c.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  it.each(applicable.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(grade(c)).toBe(c.expected);
  });

  it("ran exactly the cases whose runtimes include web", () => {
    const excluded = fixture.cases.filter((c) => c.runtimes && !c.runtimes.includes(RUNTIME));
    expect(applicable.length).toBe(fixture.cases.length - excluded.length);
    expect(applicable.length).toBeGreaterThan(0);
  });
});

// The Swift Kit and the Android core read COPIES of the fixture (the Kit has to build on Windows, so no symlink). If
// the source changes and a copy does not, that runtime silently grades an older set.
describe("native copies of the grading fixture", () => {
  const source = readFileSync("tests/fixtures/grading-parity.json", "utf8");

  it("the iOS copy is byte-for-byte the shared file", () => {
    expect(
      readFileSync(
        "ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/grading-parity.json",
        "utf8",
      ),
    ).toBe(source);
  });

  it("the Android copy is byte-for-byte the shared file", () => {
    expect(
      readFileSync("android/LearnWithAlphonso/core/src/test/resources/grading-parity.json", "utf8"),
    ).toBe(source);
  });

  it("no case carries a per-runtime exception, and every runtimes entry names a real runtime", () => {
    for (const c of fixture.cases) {
      expect(c, c.id).not.toHaveProperty("divergent");
      for (const runtime of c.runtimes ?? []) {
        expect(["web", "deno", "ios", "android"], c.id).toContain(runtime);
      }
    }
  });
});
