// The cost plan of the full content review: every phase's requests built from the REAL items and
// prompts (the same builders the runner submits), priced at the expected and the worst case.
//
// Phases whose item set is only known after an earlier phase (the second opinion, the judge, the
// re-review) use a seeded stand-in of the assumed size, drawn from the real items, so the prompt
// sizes are real and only the COUNT is an assumption. Every assumption is a named constant below and
// is printed with the plan.

import type { ReviewItem } from "./inventory";
import { expectedUsd, priceOf, worstCaseUsd, type RequestShape } from "./pricing";
import { chunk, maxTokensFor, userMessage, systemFor, type Chunk } from "./review";
import { judgeSystem, rewriteSystem, type RewriteTask } from "./judge";
import { FLAG } from "./gates";
import { MISTRAL_OUTPUT_TOKENS_PER_ITEM } from "./mistral-batch";
import { blindSample, stratifiedDraw } from "./sampling";

export const ASSUME = {
  /** Share of items Sonnet flags (first panel run: 72 of 302, 24%, in a sample weighted to known-bad packs). */
  claudeFlagRate: 0.2,
  /** Share of Claude-passed items that get a Mistral control read. */
  controlRate: 0.1,
  /** Share of control items Mistral flags (they go to the judge too). */
  mistralControlFlagRate: 0.1,
  /** Share of re-reviewed changed items flagged again (go to a second judge round). */
  reflagRate: 0.1,
  /** Blind sample size per course. */
  blindPerCourse: 100,
  /** Expected output tokens per item. */
  out: {
    review: 50,
    mistral: 1_550, // Mistral Large 4 reasons first: about 1,500 tokens an item on the first panel run
    judge: 700, // Opus 5.5 cannot turn thinking off; effort "medium", a ruling and patch about 200
    explanation: 120,
    cloze: 700,
  },
  /** max_tokens per item: the worst case the ledger reserves. */
  maxOut: {
    review: 220,
    mistral: MISTRAL_OUTPUT_TOKENS_PER_ITEM,
    judge: 1_500,
    explanation: 400,
    cloze: 1_500,
  },
} as const;

export const MODEL = {
  review: "claude-sonnet-5-5",
  judge: "claude-opus-5-5",
  mistral: "mistral-large-4",
} as const;

export type PhaseCost = {
  phase: string;
  model: string;
  items: number;
  requests: number;
  expectedUsd: number;
  worstUsd: number;
  note: string;
};

function costOf(
  phase: string,
  model: string,
  chunks: Chunk[],
  system: (c: Chunk) => string,
  outPerItem: number,
  maxPerItem: number,
  note: string,
  extra?: (it: ReviewItem) => string,
): PhaseCost {
  const p = priceOf(model);
  let expected = 0;
  let worst = 0;
  let items = 0;
  for (const c of chunks) {
    const sys = system(c);
    // Mistral has no prompt cache: its whole prompt is uncached.
    const shape: RequestShape = {
      cached: p.provider === "anthropic" ? sys : "",
      uncached: (p.provider === "anthropic" ? "" : sys) + userMessage(c, extra),
      messages: 2,
      maxTokens: maxTokensFor(c, maxPerItem),
    };
    expected += expectedUsd(model, shape, c.items.length * outPerItem);
    worst += worstCaseUsd(model, shape);
    items += c.items.length;
  }
  return {
    phase,
    model,
    items,
    requests: chunks.length,
    expectedUsd: expected,
    worstUsd: worst,
    note,
  };
}

/** A stand-in for a judge's extra context: the editable fields and two verdicts, at a typical size. */
const JUDGE_CONTEXT_STANDIN = (it: ReviewItem) =>
  `editable fields now: ${JSON.stringify(it.data).slice(0, 600)}\nreviewer A (Claude Sonnet): defect, second-answer/major (0.8): ${"x".repeat(160)}\nreviewer B (Mistral): defect, second-answer/major (0.7): ${"x".repeat(160)}`;

export function costPlan(items: ReviewItem[], seed = "20261106"): PhaseCost[] {
  const strat = (it: ReviewItem) => `${it.course}|${it.kind}`;
  const has = (f: string) => (it: ReviewItem) => it.flags?.includes(f) ?? false;
  const out: PhaseCost[] = [];

  // Phase 3: Sonnet on every item.
  out.push(
    costOf(
      "3 full pass",
      MODEL.review,
      chunk(items, "review"),
      (c) => systemFor(c),
      ASSUME.out.review,
      ASSUME.maxOut.review,
      "every item, Batches API, rubric cached 1h",
    ),
  );

  // Phase 4: Mistral on Claude's flags plus a control share of the passed items.
  const flaggedN = Math.round(items.length * ASSUME.claudeFlagRate);
  const controlN = Math.round((items.length - flaggedN) * ASSUME.controlRate);
  const second = stratifiedDraw(items, flaggedN + controlN, `${seed}:second`, strat);
  out.push(
    costOf(
      "4 second opinion",
      MODEL.mistral,
      chunk(second, "second"),
      (c) => systemFor(c),
      ASSUME.out.mistral,
      ASSUME.maxOut.mistral,
      `${flaggedN} flagged (assumed ${ASSUME.claudeFlagRate * 100}%) + ${controlN} control (${ASSUME.controlRate * 100}% of passed); Mistral batch, no cache`,
    ),
  );

  // Phase 5: Opus judge on every flagged item plus Mistral's flags among the control.
  const judgeN = flaggedN + Math.round(controlN * ASSUME.mistralControlFlagRate);
  const judged = stratifiedDraw(items, judgeN, `${seed}:judge`, strat);
  out.push(
    costOf(
      "5 judge",
      MODEL.judge,
      chunk(judged, "judge"),
      (c) => judgeSystem(c.course),
      ASSUME.out.judge,
      ASSUME.maxOut.judge,
      `${judgeN} items, effort medium`,
      JUDGE_CONTEXT_STANDIN,
    ),
  );

  // Phase 6: rewrites. The item sets are known now (deterministic flags).
  const rewrite = (
    task: RewriteTask,
    flag: string,
    model: string,
    outN: number,
    maxN: number,
    note: string,
  ) =>
    costOf(
      `6 rewrite: ${task}`,
      model,
      chunk(items.filter(has(flag)), task),
      (c) => rewriteSystem(c.course, task),
      outN,
      maxN,
      note,
      JUDGE_CONTEXT_STANDIN,
    );
  out.push(
    rewrite(
      "explanation",
      FLAG.genericExplanation,
      MODEL.review,
      ASSUME.out.explanation,
      ASSUME.maxOut.explanation,
      "every generic explanation, Sonnet (formulaic; every result re-reviewed in phase 7)",
    ),
  );
  out.push(
    rewrite(
      "cloze-options",
      FLAG.clozeFromPool,
      MODEL.judge,
      ASSUME.out.cloze,
      ASSUME.maxOut.cloze,
      "B1-C1 FR/ES cloze lines with pool distractors, Opus",
    ),
  );
  out.push({
    phase: "6 rewrite: drill-options",
    model: "engine",
    items: items.filter(has(FLAG.drillNonForm)).length,
    requests: 0,
    expectedUsd: 0,
    worstUsd: 0,
    note: "B1-C1 drills go through the #427 conjugation engine (paradigms + gate), no model call",
  });

  // Phase 7: fresh Sonnet re-review of every changed item, a second judge round on re-flags, the blind sample.
  const changedN =
    judgeN +
    items.filter(has(FLAG.genericExplanation)).length +
    items.filter(has(FLAG.clozeFromPool)).length +
    items.filter(has(FLAG.drillNonForm)).length;
  const changed = stratifiedDraw(items, Math.min(items.length, changedN), `${seed}:changed`, strat);
  out.push(
    costOf(
      "7 re-review changed",
      MODEL.review,
      chunk(changed, "verify"),
      (c) => systemFor(c, "verify"),
      ASSUME.out.review,
      ASSUME.maxOut.review,
      `${changedN} changed items (upper estimate: every judged item counted as changed)`,
    ),
  );
  const reflagN = Math.round(changedN * ASSUME.reflagRate);
  out.push(
    costOf(
      "7 judge round 2",
      MODEL.judge,
      chunk(stratifiedDraw(items, reflagN, `${seed}:reflag`, strat), "judge2"),
      (c) => judgeSystem(c.course),
      ASSUME.out.judge,
      ASSUME.maxOut.judge,
      `${reflagN} re-flagged (assumed ${ASSUME.reflagRate * 100}%)`,
      JUDGE_CONTEXT_STANDIN,
    ),
  );
  const blind = blindSample(items, ASSUME.blindPerCourse, `${seed}:blind`);
  out.push(
    costOf(
      "7 blind sample: Sonnet",
      MODEL.review,
      chunk(blind, "blind"),
      (c) => systemFor(c, "verify"),
      ASSUME.out.review,
      ASSUME.maxOut.review,
      `${blind.length} items`,
    ),
  );
  out.push(
    costOf(
      "7 blind sample: Mistral",
      MODEL.mistral,
      chunk(blind, "blindm"),
      (c) => systemFor(c, "verify"),
      ASSUME.out.mistral,
      ASSUME.maxOut.mistral,
      `${blind.length} items, every one`,
    ),
  );
  out.push(
    costOf(
      "7 blind sample: Opus",
      MODEL.judge,
      chunk(blind, "blindj"),
      (c) => judgeSystem(c.course),
      ASSUME.out.judge,
      ASSUME.maxOut.judge,
      `${blind.length} items, every one (the measured rate is Opus-settled)`,
      JUDGE_CONTEXT_STANDIN,
    ),
  );
  return out;
}

export function planMarkdown(rows: PhaseCost[], cap: number): string {
  const total = rows.reduce((a, r) => a + r.expectedUsd, 0);
  const worst = rows.reduce((a, r) => a + r.worstUsd, 0);
  return [
    "| Phase | Model | Items | Requests | Expected US$ | Worst case US$ | Basis |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...rows.map(
      (r) =>
        `| ${r.phase} | \`${r.model}\` | ${r.items} | ${r.requests} | ${r.expectedUsd.toFixed(2)} | ${r.worstUsd.toFixed(2)} | ${r.note} |`,
    ),
    `| **Total** | | | | **${total.toFixed(2)}** | ${worst.toFixed(2)} | cap $${cap} |`,
  ].join("\n");
}
