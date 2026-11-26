// Goal-flavoured variants (src/lib/goal-variants.ts): the server is never told which goal a learner saw, so an answer
// that is right in the base question OR in any variant is right. A failure here is the learner being shown a correct
// verdict for the version on screen and having the item lapsed. Run with --allow-env (the AI tests set a key).
import { assertEquals } from "jsr:@std/assert@1";
import { deriveAnswerCorrectness, type QuestionRow } from "./answer-correctness.ts";

const MC_WITH_VARIANT: QuestionRow = {
  type: "mc",
  prompt: "p",
  choices: ["cat", "dog", "bird"],
  bank: null,
  answer_index: 1,
  answer_text: null,
  goal_variants: [{ goal: "travel", choices: ["train", "bus", "taxi"], answer_index: 2 }],
};

const TRANSLATE: QuestionRow = {
  type: "translate",
  prompt: "Ask where the bank is.",
  choices: null,
  bank: ["Where is the bank?"],
  answer_index: null,
  answer_text: "Where is the bank?",
  goal_variants: [{ goal: "travel", bank: ["Where is the station?"] }],
};

const CONSENTED = { allowed: () => Promise.resolve(true) };
const originalFetch = globalThis.fetch;
function restore() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("OPENROUTER_API_KEY");
}

Deno.test("a goal variant's right answer is correct, and so is the base's", async () => {
  assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANT, "taxi"), true);
  assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANT, "dog"), true);
});

Deno.test("a wrong choice of the base or of a variant stays wrong", async () => {
  assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANT, "cat"), false);
  assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANT, "train"), false);
});

Deno.test("a row with no variants grades exactly as before", async () => {
  const plain: QuestionRow = { ...MC_WITH_VARIANT, goal_variants: null };
  assertEquals(await deriveAnswerCorrectness(plain, "taxi"), false);
  assertEquals(await deriveAnswerCorrectness(plain, "dog"), true);
});

Deno.test("a translate variant's wording is matched locally, with no model call", async () => {
  Deno.env.set("OPENROUTER_API_KEY", "test-key");
  globalThis.fetch = (() => {
    throw new Error("the model must not be called for a curated variant wording");
  }) as typeof fetch;
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "where is the station", "en", CONSENTED),
      true,
    );
  } finally {
    restore();
  }
});

Deno.test(
  "an unlisted translate answer asks the AI once, with the variants' wordings in the set",
  async () => {
    Deno.env.set("OPENROUTER_API_KEY", "test-key");
    const bodies: string[] = [];
    globalThis.fetch = ((_url: unknown, init?: { body?: string }) => {
      bodies.push(String(init?.body ?? ""));
      const verdict =
        '{"elements": [], "missing": [], "extra": [], "grammar": [], "correct": false, "reason": "No."}';
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: verdict } }] }), {
          status: 200,
        }),
      );
    }) as typeof fetch;
    try {
      assertEquals(
        await deriveAnswerCorrectness(TRANSLATE, "I have no idea", "en", CONSENTED),
        false,
      );
      assertEquals(bodies.length, 1);
      assertEquals(bodies[0]!.includes("Where is the station?"), true);
    } finally {
      restore();
    }
  },
);
