// scripts/check-translation-grader.ts
/**
 * Runs the written-answer regression set (scripts/translation-grader-regression.json) against the REAL model through
 * the same function the servers use (gradeTranslationWithAi), after the same local accept-list check, and prints how
 * many known-wrong answers it let through and how many known-right ones it accepted.
 *
 *   OPENROUTER_API_KEY=... bun scripts/check-translation-grader.ts [--cap 1.00] [--out results.json]
 *
 * The goal is 0 wrong answers accepted and at least 90% of the right ones accepted, measured on the MODEL-JUDGED
 * cases only: a case the local accept-list settles never reached the model, so it is reported separately. A "no
 * opinion" on a known-wrong case is a failure (production keeps the local verdict, so nothing rejected it). The exit
 * code is 1 when the gate is missed. Spend is read from the `usage.cost` OpenRouter returns on every reply and the run stops at the cap
 * (default $1). The key is never printed. Owner-run: it costs a few cents and needs network.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gradeTranslationWithAi } from "../src/lib/translation-grader.server";
import { matchesAcceptableAnswer } from "../src/lib/translation-answer";
import { resolveLlmApiKey, resolveLlmChatModel } from "../src/lib/llm-chat-model.server";

type Case = {
  id: string;
  course: "en" | "fr" | "es";
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
  });
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

// A case the local accept-list settles never reached the model: it is reported on its own and counts toward neither
// the rate nor the gate, except a known-wrong case the list accepts, which is a failure the model never got to catch.
const modelJudged = results.filter((r) => !r.local);
const localHits = results.filter((r) => r.local);
const wrong = modelJudged.filter((r) => !r.c.expectCorrect);
const right = modelJudged.filter((r) => r.c.expectCorrect);
const wrongAccepted = wrong.filter((r) => r.outcome === "accepted");
const noVerdict = (r: Result) => r.outcome === "no-opinion" || r.outcome === "skipped-cap";
// A wrong case with no model verdict was NOT rejected by the grader (production keeps the local verdict).
const wrongNoOpinion = wrong.filter(noVerdict);
const rightAccepted = right.filter((r) => r.outcome === "accepted");
const rightNoOpinion = right.filter(noVerdict);
const localWrongAccepted = localHits.filter((r) => !r.c.expectCorrect);

for (const r of modelJudged) {
  const bad =
    (r.c.expectCorrect && r.outcome !== "accepted") ||
    (!r.c.expectCorrect && r.outcome !== "rejected");
  if (!bad) continue;
  const label = r.c.expectCorrect
    ? "RIGHT not accepted"
    : r.outcome === "accepted"
      ? "WRONG accepted"
      : "WRONG got NO OPINION (failure)";
  console.log(
    `${label} [${r.outcome}] ${r.c.id} (${r.c.kind})\n  asked:  ${r.c.prompt}\n  answer: ${r.c.submission}\n  reason: ${r.reason ?? "-"}`,
  );
}
for (const r of localWrongAccepted) {
  console.log(
    `WRONG accepted by the LOCAL accept-list (failure) ${r.c.id} (${r.c.kind})\n  answer: ${r.c.submission}`,
  );
}
const pct = right.length ? ((rightAccepted.length / right.length) * 100).toFixed(1) : "n/a";
console.log(
  `\nmodel: ${model}\ncases: ${results.length}; settled by the local accept-list, not model-judged: ${localHits.length} (${localHits.map((r) => r.c.id).join(", ") || "none"})` +
    `\nmodel-judged: ${modelJudged.length} (${wrong.length} known-wrong, ${right.length} known-right)` +
    `\nwrong answers accepted: ${wrongAccepted.length} of ${wrong.length}` +
    `\nwrong answers with NO model opinion (counted as failures): ${wrongNoOpinion.length}` +
    `\nright answers accepted: ${rightAccepted.length} of ${right.length} (${pct}%), no opinion: ${rightNoOpinion.length}` +
    `\nknown-wrong answers accepted by the local list: ${localWrongAccepted.length}` +
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
        local: r.local,
        reason: r.reason,
      })),
      null,
      2,
    ),
  );
}
const ok =
  wrongAccepted.length === 0 &&
  wrongNoOpinion.length === 0 &&
  localWrongAccepted.length === 0 &&
  right.length > 0 &&
  rightAccepted.length / right.length >= 0.9;
process.exit(ok ? 0 : 1);
