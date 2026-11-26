// Goal-flavoured variants (src/lib/goal-variants.ts): the client names the goal of the version it showed
// (`variantGoal`, null or absent for the base question), and an answer is right against the base OR that one version,
// never another goal's: a different meaning must not be marked right. Run with --allow-env (the AI tests set a key).
import { assertEquals } from "jsr:@std/assert@1";
import { deriveAnswerCorrectness, type QuestionRow } from "./answer-correctness.ts";

const MC_WITH_VARIANTS: QuestionRow = {
  type: "mc",
  prompt: "p",
  choices: ["cat", "dog", "bird"],
  bank: null,
  answer_index: 1,
  answer_text: null,
  goal_variants: [
    { goal: "travel", choices: ["train", "bus", "taxi"], answer_index: 2 },
    { goal: "work", choices: ["email", "memo", "report"], answer_index: 0 },
  ],
};

const SPEAK: QuestionRow = {
  type: "speak",
  prompt: "Say this aloud:",
  choices: null,
  bank: null,
  answer_index: null,
  answer_text: "She is a doctor",
  goal_variants: [
    { goal: "travel", answer_text: "She is a pilot" },
    { goal: "work", answer_text: "She is a chef" },
  ],
};

const TRANSLATE: QuestionRow = {
  type: "translate",
  prompt: "Ask where the bank is.",
  choices: null,
  bank: ["Where is the bank?"],
  answer_index: null,
  answer_text: "Where is the bank?",
  goal_variants: [
    { goal: "travel", prompt: "Ask where the station is.", bank: ["Where is the station?"] },
    { goal: "work", prompt: "Ask where the office is.", bank: ["Where is the office?"] },
  ],
};

const CONSENTED = { allowed: () => Promise.resolve(true) };
const originalFetch = globalThis.fetch;
function restore() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("OPENROUTER_API_KEY");
}

Deno.test("the shown version's right answer is correct, and so is the base's", async () => {
  assertEquals(
    await deriveAnswerCorrectness(MC_WITH_VARIANTS, "taxi", "en", undefined, "travel"),
    true,
  );
  assertEquals(
    await deriveAnswerCorrectness(MC_WITH_VARIANTS, "dog", "en", undefined, "travel"),
    true,
  );
});

Deno.test("a wrong choice of the base or of the shown version stays wrong", async () => {
  assertEquals(
    await deriveAnswerCorrectness(MC_WITH_VARIANTS, "cat", "en", undefined, "travel"),
    false,
  );
  assertEquals(
    await deriveAnswerCorrectness(MC_WITH_VARIANTS, "train", "en", undefined, "travel"),
    false,
  );
});

Deno.test("another goal's right answer is not right", async () => {
  assertEquals(
    await deriveAnswerCorrectness(MC_WITH_VARIANTS, "email", "en", undefined, "travel"),
    false,
  );
  assertEquals(
    await deriveAnswerCorrectness(SPEAK, "she is a chef", "en", undefined, "travel"),
    false,
  );
  assertEquals(
    await deriveAnswerCorrectness(SPEAK, "she is a pilot", "en", undefined, "work"),
    false,
  );
});

Deno.test(
  "with no goal sent (an older build, or the base question) only the base counts",
  async () => {
    assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANTS, "taxi"), false);
    assertEquals(
      await deriveAnswerCorrectness(MC_WITH_VARIANTS, "taxi", "en", undefined, null),
      false,
    );
    assertEquals(await deriveAnswerCorrectness(MC_WITH_VARIANTS, "dog"), true);
    assertEquals(await deriveAnswerCorrectness(SPEAK, "she is a pilot"), false);
    // A goal the question has no version for is the base too.
    assertEquals(
      await deriveAnswerCorrectness(MC_WITH_VARIANTS, "taxi", "en", undefined, "exam"),
      false,
    );
  },
);

Deno.test("a row with no variants grades exactly as before, whatever goal is sent", async () => {
  const plain: QuestionRow = { ...MC_WITH_VARIANTS, goal_variants: null };
  assertEquals(await deriveAnswerCorrectness(plain, "taxi", "en", undefined, "travel"), false);
  assertEquals(await deriveAnswerCorrectness(plain, "dog", "en", undefined, "travel"), true);
});

Deno.test(
  "a translate wording of the shown version is matched locally, with no model call",
  async () => {
    Deno.env.set("OPENROUTER_API_KEY", "test-key");
    globalThis.fetch = (() => {
      throw new Error("the model must not be called for a curated variant wording");
    }) as typeof fetch;
    try {
      assertEquals(
        await deriveAnswerCorrectness(TRANSLATE, "where is the station", "en", CONSENTED, "travel"),
        true,
      );
    } finally {
      restore();
    }
  },
);

Deno.test(
  "an unlisted translate answer asks the AI once, about the version on screen",
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
        await deriveAnswerCorrectness(TRANSLATE, "I have no idea", "en", CONSENTED, "travel"),
        false,
      );
      assertEquals(bodies.length, 1);
      // The shown version's wording and prompt are in the request; the other goal's are not.
      assertEquals(bodies[0]!.includes("Where is the station?"), true);
      assertEquals(bodies[0]!.includes("Ask where the station is."), true);
      assertEquals(bodies[0]!.includes("Where is the office?"), false);
    } finally {
      restore();
    }
  },
);
