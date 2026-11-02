// scripts/smoke-llm-features.ts
/**
 * Runs every AI text feature once per course against the live model through the real chokepoint, prompt and parser,
 * and fails on any feature whose parser rejects the reply. A model can be fast in scripts/benchmark-llm.ts and still
 * return a JSON shape a feature cannot use, which in the app is a silent fallback, not an error.
 *
 *   OPENROUTER_API_KEY=... bun scripts/smoke-llm-features.ts
 *
 * Database writes are replaced by in-memory stand-ins; nothing touches Supabase. The key is never printed.
 * Uses the configured model list (LLM_CHAT_MODELS, else the default) and prints which model answered.
 */
import { gradeTranslationWithAi } from "../src/lib/translation-grader.server";
import { defineWord } from "../src/lib/saved-word.server";
import { generatePracticeQuestions } from "../src/lib/practice-generation.server";
import { detectAndRecordWeaknesses } from "../src/lib/weakness-detection.server";
import { proposeVocabCandidates } from "../src/lib/generative-vocab.server";
import { draftPack } from "../src/lib/pack-draft-generation.server";
import { buildHectorSystemPrompt } from "../src/lib/hector-conversation";
import { llmChatCompletion } from "../src/lib/llm-chat.server";
import { resolveLlmApiKey, resolveLlmChatModel } from "../src/lib/llm-chat-model.server";

const key = resolveLlmApiKey();
if (!key) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(1);
}
const model = resolveLlmChatModel();

type Course = "en" | "fr" | "es";
const CASES: Record<
  Course,
  { word: string; sentence: string; prompt: string; good: string; wrongTranscript: string }
> = {
  en: {
    word: "serendipity",
    sentence: "Meeting her there was pure serendipity.",
    prompt: "Translate into English: Je voudrais un café, s'il vous plaît.",
    good: "I would like a coffee, please.",
    wrongTranscript: "Yesterday I go to the store and I buyed two apple.",
  },
  fr: {
    word: "boulangerie",
    sentence: "Je vais à la boulangerie tous les matins.",
    prompt: "Translate into French: I would like a coffee, please.",
    good: "Je voudrais un café, s'il te plaît.",
    wrongTranscript: "Hier je vais au magasin et j'ai acheté deux pomme.",
  },
  es: {
    word: "madrugada",
    sentence: "Me desperté de madrugada para ver el amanecer.",
    prompt: "Translate into Spanish: I would like a coffee, please.",
    good: "Me gustaría un café, por favor.",
    wrongTranscript: "Ayer yo voy a la tienda y compré dos manzana.",
  },
};

let failures = 0;
async function check(label: string, run: () => Promise<boolean | string>, limitMs = 5_000) {
  const t0 = performance.now();
  let ok = false;
  let note = "";
  try {
    const r = await run();
    ok = r === true || (typeof r === "string" && r.length > 0);
    if (typeof r === "string") note = r;
  } catch (e) {
    note = e instanceof Error ? e.message.slice(0, 120) : "threw";
  }
  const ms = Math.round(performance.now() - t0);
  const slow = ms > limitMs;
  if (!ok || slow) failures++;
  console.log(
    `${ok && !slow ? "PASS" : "FAIL"} ${label.padEnd(32)} ${String(ms).padStart(6)} ms${slow ? " (too slow)" : ""}  ${note.replace(/\s+/g, " ").slice(0, 110)}`,
  );
}

console.log(`model list starts with ${model}`);
for (const course of ["en", "fr", "es"] as Course[]) {
  const c = CASES[course];
  await check(`${course} hector reply`, async () => {
    const res = await llmChatCompletion({
      apiKey: key,
      body: {
        model,
        max_tokens: 300,
        messages: [
          { role: "system", content: buildHectorSystemPrompt(course, "A2") },
          { role: "user", content: c.wrongTranscript },
        ],
      },
    });
    if (!res.ok) return `status ${res.status}`;
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return text ? `[${data.model}] ${text}` : "";
  });
  await check(`${course} translation grade`, async () => {
    const v = await gradeTranslationWithAi({
      prompt: c.prompt,
      acceptableAnswers: [c.good],
      submission: c.good.replace("please", "pls").replace("por favor", "porfa"),
      apiKey: key,
      model,
    });
    return v ? `correct=${v.correct}` : "";
  });
  await check(`${course} save-word definition`, async () => {
    const d = await defineWord({
      input: { word: c.word, sentence: c.sentence, course },
      apiKey: key,
      model,
    });
    return d ? `${d.meaning} | wrong: ${d.wrong.join(" / ")}` : "";
  });
  await check(
    `${course} generated practice`,
    async () => {
      const qs = await generatePracticeQuestions({
        topic: "ordering in a cafe",
        sampleQuestions: [{ prompt: c.prompt, answer: c.good }],
        llmApiKey: key,
        llmModel: model,
      });
      return qs.length > 0 ? `${qs.length} questions, e.g. ${qs[0].prompt}` : "";
    },
    16_000,
  );
  await check(`${course} weakness detection`, async () => {
    let saved = 0;
    const n = await detectAndRecordWeaknesses({
      userId: "smoke",
      sourceDescription: "conversation with Hector",
      transcriptMessages: [
        { role: "assistant", content: "What did you do yesterday?" },
        { role: "user", content: c.wrongTranscript },
      ],
      llmApiKey: key,
      llmModel: model,
      course,
      outputCheck: async (texts) => texts.map(() => false),
      dedupCheck: async () => false,
      adminInsertReviewItem: async () => {
        saved++;
        return true;
      },
      adminInsertEvent: async () => {},
    });
    return n > 0 ? `${n} weaknesses, ${saved} saved` : "";
  });
}
await check(
  "authoring: vocab proposal",
  async () => {
    const v = await proposeVocabCandidates({
      topic: "kitchen",
      posTypes: ["noun"],
      llmApiKey: key,
      llmModel: model,
    });
    return v.length > 0 ? `${v.length} candidates` : "";
  },
  60_000,
);
await check(
  "authoring: pack draft",
  async () => {
    const p = await draftPack({
      topic: "at the train station",
      targetLanguage: "French",
      kind: "pair",
      lineCount: 5,
      llmApiKey: key,
      llmModel: model,
    });
    return p ? "draft parsed" : "";
  },
  60_000,
);

console.log(failures ? `\n${failures} FAILED` : "\nall features PASS");
process.exit(failures ? 1 : 0);
