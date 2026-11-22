// scripts/check-translation-grader.ts
/**
 * Runs the written-answer regression set (scripts/translation-grader-regression.json) against the REAL model through
 * the same function the servers use (gradeTranslationWithAi), after the same local accept-list check, and prints how
 * many known-wrong answers it let through and how many known-right ones it accepted.
 *
 *   OPENROUTER_API_KEY=... bun scripts/check-translation-grader.ts [--cap 1.00] [--out results.json]
 *
 * The goal is 0 wrong answers accepted and at least 90% of the right ones accepted; the exit code is 1 when either
 * is missed. Spend is read from the `usage.cost` OpenRouter returns on every reply and the run stops at the cap
 * (default $1). The key is never printed. Owner-run: it costs a few cents and needs network.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gradeTranslationWithAi } from "../src/lib/translation-grader.server";
import { matchesAcceptableAnswer } from "../src/lib/translation-answer";
import { resolveLlmApiKey, resolveLlmChatModel } from "../src/lib/llm-chat-model.server";

type Case = {
  id: string;
  course: "en" | "fr" | "es";
  level: string;
  prompt: string;
  acceptableAnswers: string[];
  submission: string;
  expectCorrect: boolean;
  kind: string;
};

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const capUsd = Number(flag("--cap") ?? "1");
const outPath = flag("--out");

const key = resolveLlmApiKey();
if (!key) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(1);
}
const model = resolveLlmChatModel();
const cases = JSON.parse(
  readFileSync(new URL("./translation-grader-regression.json", import.meta.url), "utf8"),
) as Case[];

// Spend: OpenRouter returns usage.cost on every reply (llm-chat.server.ts asks for it), but it is 0 on a BYOK route,
// where the real charge is cost_details.upstream_inference_cost. When neither is there the run falls back to an
// upper-bound estimate from token counts ($1 per million in, $5 per million out), so the cap still means something.
let spentUsd = 0;
let calls = 0;
let tokensIn = 0;
let tokensOut = 0;
let estimated = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const res = await realFetch(...args);
  calls += 1;
  try {
    const body = (await res.clone().json()) as {
      usage?: {
        cost?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        cost_details?: { upstream_inference_cost?: number };
      };
    };
    const u = body.usage;
    const reported = (u?.cost ?? 0) + (u?.cost_details?.upstream_inference_cost ?? 0);
    const tin = u?.prompt_tokens ?? 0;
    const tout = u?.completion_tokens ?? 0;
    tokensIn += tin;
    tokensOut += tout;
    if (reported > 0) spentUsd += reported;
    else {
      estimated = true;
      spentUsd += (tin * 1 + tout * 5) / 1e6;
    }
  } catch {
    // An unreadable body is simply not counted.
  }
  return res;
}) as typeof fetch;

type Outcome = "accepted" | "rejected" | "no-opinion" | "skipped-cap";
type Result = { c: Case; outcome: Outcome; reason: string | null; local: boolean };

async function run(c: Case): Promise<Result> {
  if (matchesAcceptableAnswer(c.submission, c.acceptableAnswers)) {
    return { c, outcome: "accepted", reason: "local accept-list match", local: true };
  }
  if (spentUsd >= capUsd) return { c, outcome: "skipped-cap", reason: null, local: false };
  const verdict = await gradeTranslationWithAi({
    prompt: c.prompt,
    acceptableAnswers: c.acceptableAnswers,
    submission: c.submission,
    apiKey: key as string,
    model,
    course: c.course,
    level: c.level,
  } as Parameters<typeof gradeTranslationWithAi>[0]);
  if (!verdict) return { c, outcome: "no-opinion", reason: null, local: false };
  return {
    c,
    outcome: verdict.correct ? "accepted" : "rejected",
    reason: verdict.reason,
    local: false,
  };
}

const results: Result[] = new Array(cases.length);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await run(cases[i]!);
    }
  }),
);

const wrong = results.filter((r) => !r.c.expectCorrect);
const right = results.filter((r) => r.c.expectCorrect);
const wrongAccepted = wrong.filter((r) => r.outcome === "accepted");
const rightAccepted = right.filter((r) => r.outcome === "accepted");
const noOpinion = results.filter((r) => r.outcome === "no-opinion" || r.outcome === "skipped-cap");

for (const r of results) {
  const bad =
    (r.c.expectCorrect && r.outcome !== "accepted") ||
    (!r.c.expectCorrect && r.outcome === "accepted");
  if (!bad) continue;
  console.log(
    `${r.c.expectCorrect ? "RIGHT rejected" : "WRONG accepted"} [${r.outcome}] ${r.c.id} (${r.c.kind})\n  asked:  ${r.c.prompt}\n  answer: ${r.c.submission}\n  reason: ${r.reason ?? "-"}`,
  );
}
const pct = right.length ? ((rightAccepted.length / right.length) * 100).toFixed(1) : "n/a";
console.log(
  `\nmodel: ${model}\ncases: ${results.length} (${wrong.length} known-wrong, ${right.length} known-right)` +
    `\nwrong answers accepted: ${wrongAccepted.length} of ${wrong.length}` +
    `\nright answers accepted: ${rightAccepted.length} of ${right.length} (${pct}%)` +
    `\nno opinion / skipped:   ${noOpinion.length}` +
    `\nmodel calls: ${calls}, tokens in/out: ${tokensIn}/${tokensOut}, cost: $${spentUsd.toFixed(4)}${estimated ? " (estimated from tokens, upper bound)" : ""} (cap $${capUsd.toFixed(2)})`,
);
if (outPath) {
  writeFileSync(
    outPath,
    JSON.stringify(
      results.map((r) => ({
        id: r.c.id,
        kind: r.c.kind,
        expectCorrect: r.c.expectCorrect,
        outcome: r.outcome,
        reason: r.reason,
      })),
      null,
      2,
    ),
  );
}
const ok =
  wrongAccepted.length === 0 && right.length > 0 && rightAccepted.length / right.length >= 0.9;
process.exit(ok ? 0 : 1);
