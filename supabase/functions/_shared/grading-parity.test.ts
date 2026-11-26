// The Deno leg of the shared answer-grading fixture set. The web (src/lib/grading-parity.test.ts), the Swift Kit and
// the Android core read the same tests/fixtures/grading-parity.json; see the web test for how `runtimes` works. A JSON import needs no --allow-read, so CI runs this with a plain `deno test`.
import { assertEquals } from "jsr:@std/assert@1";
import fixture from "../../../tests/fixtures/grading-parity.json" with { type: "json" };
import { deriveAnswerCorrectness, type QuestionRow } from "./answer-correctness.ts";
import { decideVerdict, knownWordConfusion } from "./translation-grader.ts";

type Runtime = "web" | "deno" | "ios" | "android";
type Case = {
  id: string;
  kind: string;
  course?: "en" | "fr" | "es";
  input?: string;
  answer?: string;
  choices?: string[];
  answerIndex?: number;
  acceptable?: string[];
  submission?: string;
  reply?: Record<string, unknown>;
  expected: boolean;
  runtimes?: Runtime[];
};

const RUNTIME: Runtime = "deno";
const cases = (fixture.cases as Case[]).filter((c) =>
  (c.runtimes ?? ["web", "deno", "ios", "android"]).includes(RUNTIME),
);

async function grade(c: Case): Promise<boolean> {
  const course = c.course ?? "en";
  if (c.kind === "typo-verdict") {
    return decideVerdict(JSON.stringify(c.reply), c.acceptable ?? [], c.submission ?? "")!.correct;
  }
  if (c.kind === "confusion") return knownWordConfusion(c.input!, c.acceptable ?? []) !== null;
  const row: QuestionRow = {
    type: c.kind as QuestionRow["type"],
    prompt: "p",
    // For translate the DB keeps the curated phrasings in `bank`; no `ai` is passed, so only the local half runs.
    choices: c.kind === "mc" ? c.choices! : null,
    bank: c.kind === "translate" ? c.acceptable! : null,
    answer_index: c.kind === "mc" ? c.answerIndex! : null,
    answer_text: c.answer ?? null,
  };
  return await deriveAnswerCorrectness(row, c.input!, course);
}

Deno.test("fixture has unique ids and covers every question type", () => {
  const ids = (fixture.cases as Case[]).map((c) => c.id);
  assertEquals(new Set(ids).size, ids.length);
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
    assertEquals(
      (fixture.cases as Case[]).some((c) => c.kind === kind),
      true,
      kind,
    );
  }
});

for (const c of cases) {
  Deno.test(`grading parity: ${c.id}`, async () => {
    assertEquals(await grade(c), c.expected);
  });
}

Deno.test("grading parity: this runtime ran exactly the cases whose runtimes include it", () => {
  const all = fixture.cases as Case[];
  const excluded = all.filter((c) => c.runtimes && !c.runtimes.includes(RUNTIME));
  assertEquals(cases.length, all.length - excluded.length);
  assertEquals(cases.length > 0, true);
});
