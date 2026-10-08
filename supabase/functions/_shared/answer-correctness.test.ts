// What this guards is the agreement between the verdict the player showed the
// learner and the verdict that drives their review schedule. A disagreement is
// invisible from either side alone: the screen says "Still got it" and the item
// lapses anyway.
import { assertEquals } from "jsr:@std/assert@1";
import { deriveAnswerCorrectness, type QuestionRow } from "./answer-correctness.ts";

const TRANSLATE: QuestionRow = {
  type: "translate",
  prompt: "Say you do not understand.",
  choices: null,
  bank: ["I do not understand.", "I don't understand."],
  answer_index: null,
  answer_text: "I do not understand.",
};

const CONSENTED = { allowed: () => Promise.resolve(true) };
const originalFetch = globalThis.fetch;

function stubVerdict(content: string) {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
    )) as typeof fetch;
}

function stubFailure() {
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
}

function restore() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("NVIDIA_API_KEY");
}

Deno.test("a curated phrasing is graded correct without any model call", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  globalThis.fetch = (() => {
    throw new Error("the model must not be called for a curated phrasing");
  }) as typeof fetch;
  try {
    assertEquals(await deriveAnswerCorrectness(TRANSLATE, "i dont understand"), true);
  } finally {
    restore();
  }
});

Deno.test("an AI-accepted paraphrase is graded correct, not lapsed", async () => {
  // The player accepted a wording the curated list did not anticipate. If this
  // function string-matched only, the learner would be shown "Still got it" and
  // have the item lapsed anyway.
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  stubVerdict('{"correct": true, "reason": "Same meaning."}');
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED),
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("an unavailable AI grader leaves the local verdict standing", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  stubFailure();
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED),
      false,
    );
    assertEquals(await deriveAnswerCorrectness(TRANSLATE, "I don't understand"), true);
  } finally {
    restore();
  }
});

Deno.test("with no key configured, translate grading degrades to local-only", async () => {
  stubFailure();
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED),
      false,
    );
    assertEquals(await deriveAnswerCorrectness(TRANSLATE, "I do not understand"), true);
  } finally {
    restore();
  }
});

Deno.test("unparseable model output is no opinion, not a wrong answer", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  stubVerdict("hard to say really");
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED),
      false,
    );
  } finally {
    restore();
  }
});

Deno.test("checkQuota returning false blocks the AI call entirely", async () => {
  // 2026-09-29 audit finding: this branch used to have no quota
  // enforcement at all. checkQuota is the fix -- confirm it actually
  // gates the vendor call rather than just being ignored.
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  globalThis.fetch = (() => {
    throw new Error("the model must not be called when quota is exhausted");
  }) as typeof fetch;
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", {
        allowed: () => Promise.resolve(true),
        checkQuota: () => Promise.resolve(false),
      }),
      false,
    );
  } finally {
    restore();
  }
});

Deno.test("checkQuota returning true still allows a real AI-accepted paraphrase", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  stubVerdict('{"correct": true, "reason": "Same meaning."}');
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", {
        allowed: () => Promise.resolve(true),
        checkQuota: () => Promise.resolve(true),
      }),
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("omitting checkQuota (with consent) leaves the AI grader unlimited", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  stubVerdict('{"correct": true, "reason": "Same meaning."}');
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED),
      true,
    );
  } finally {
    restore();
  }
});

Deno.test("without consent the translate branch makes zero model calls, even with a key and quota", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  let quotaAsked = false;
  try {
    assertEquals(
      await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", {
        allowed: () => Promise.resolve(false),
        checkQuota: () => {
          quotaAsked = true;
          return Promise.resolve(true);
        },
      }),
      false,
    );
    assertEquals(calls, 0);
    assertEquals(quotaAsked, false);
  } finally {
    restore();
  }
});

Deno.test("omitting the AI options means no AI at all (safe default)", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  globalThis.fetch = (() => {
    throw new Error("the model must not be called without explicit AI options");
  }) as typeof fetch;
  try {
    assertEquals(await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you"), false);
  } finally {
    restore();
  }
});

Deno.test("consent is not even asked for a curated phrasing", async () => {
  let asked = false;
  assertEquals(
    await deriveAnswerCorrectness(TRANSLATE, "I don't understand", "en", {
      allowed: () => {
        asked = true;
        return Promise.resolve(true);
      },
    }),
    true,
  );
  assertEquals(asked, false);
});

Deno.test("the AI grading prompt carries the safety preamble", async () => {
  Deno.env.set("NVIDIA_API_KEY", "test-key");
  let first: { role: string; content: string } | undefined;
  globalThis.fetch = ((_u: string, init?: RequestInit) => {
    first = JSON.parse(String(init?.body)).messages[0];
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"correct": true, "reason": "ok"}' } }] })),
    );
  }) as typeof fetch;
  try {
    await deriveAnswerCorrectness(TRANSLATE, "I really do not follow you", "en", CONSENTED);
    assertEquals(first?.role, "system");
    assertEquals(first?.content.includes("SAFETY RULES"), true);
  } finally {
    restore();
  }
});

Deno.test("the other question types still grade synchronously and unchanged", async () => {
  const mc: QuestionRow = {
    type: "mc",
    prompt: null,
    choices: ["a", "b"],
    bank: null,
    answer_index: 1,
    answer_text: null,
  };
  assertEquals(await deriveAnswerCorrectness(mc, "b"), true);
  assertEquals(await deriveAnswerCorrectness(mc, "a"), false);

  const speak: QuestionRow = {
    type: "speak",
    prompt: null,
    choices: null,
    bank: null,
    answer_index: null,
    answer_text: "She's a doctor.",
  };
  assertEquals(await deriveAnswerCorrectness(speak, "she is a doctor"), true);

  const fill: QuestionRow = {
    type: "fill",
    prompt: null,
    choices: null,
    bank: ["meet"],
    answer_index: null,
    answer_text: "meet",
  };
  assertEquals(await deriveAnswerCorrectness(fill, " MEET "), true);
});
