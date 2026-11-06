// The Opus judge (phase 5) and the rewrite tasks (phase 6) of the full content review. The judge
// reads an item, its automatic flags, and both reviewers' verdicts, then decides: keep it, fix it
// (with a structured patch that fixes.ts checks), or send it to the owner. Rewrites use the same
// reply shape with a task-specific instruction. Pure: no network.

import type { Course } from "../../data/courses";
import type { ReviewItem } from "./inventory";
import { EDITABLE, type Patch, type ProposedFix } from "./fixes";
import { rubric } from "./rubric";
import { firstJsonObject, localKey, type Chunk, type Verdict } from "./review";

export type Decision = "keep" | "fix" | "owner";

export type Ruling = {
  id: string;
  decision: Decision;
  category?: string;
  confidence: number;
  reason: string;
  patch?: Patch;
  keyChange?: boolean;
};

/**
 * Below this, a "fix" goes to the owner list instead of being applied. 0.5, not 0.7: on the pilot
 * (2026-11-06) the 0.5-0.65 fixes were real but modest improvements (a vague gloss, a weak option),
 * and every applied fix is re-read by a fresh reviewer in phase 7; a re-flag goes to a second judge
 * round before it can reach the owner. At 0.7 the owner list would have been about 1,900 items.
 */
export const MIN_FIX_CONFIDENCE = 0.5;

const PATCH_RULES = [
  "A patch lists ONLY the fields you change, with their full new value.",
  "Never change an id, a question type, the number of options, or where the answer sits in the option list. To replace a wrong option, give the whole option list with the answer at the same position.",
  'Keep the answer unless it is wrong; if it is wrong, set "keyChange": true and say why in reason.',
  "A fill-in prompt keeps exactly one ___ blank.",
  'An explanation says why THIS answer is right for THIS sentence, in one or two plain English sentences, and MUST contain the answer exactly as the key spells it, in double quotes ("parle"); a patch without it is refused. Never write a generic line such as \'"x" is correct here.\'.',
  "Wrong options: the same kind of word as the answer, tempting to a learner, and ruled out by something in the item (add a short bracketed clue to the prompt if two options would fit).",
  'Use "owner" only when a native teacher could reasonably disagree with any fix (a taste or regional call), not because a fix is hard.',
];

export function judgeSystem(course: Course): string {
  return [
    rubric(course),
    "",
    "YOUR ROLE NOW: you are the final judge. Two reviewers from different providers read each item; their verdicts are below the item. They may both be wrong. Decide on your own reading.",
    'For each item return {"key","decision":"keep"|"fix"|"owner","category","confidence":0-1,"reason":"<one sentence>","patch":{...},"keyChange":false}.',
    "Rules for a patch:",
    ...PATCH_RULES.map((r) => `- ${r}`),
    'Reply with JSON only: {"items":[...]}, one entry per key, in order.',
  ].join("\n");
}

const fmt = (who: string, v: Verdict | undefined) =>
  !v
    ? `${who}: (not reviewed)`
    : v.verdict === "ok"
      ? `${who}: ok (${v.confidence})`
      : `${who}: defect, ${v.category}/${v.severity} (${v.confidence}): ${v.problem ?? ""} Suggested: ${v.fix ?? ""}`;

/** Per-item context for the judge: the editable fields as JSON, and both verdicts. */
export function judgeContext(
  it: ReviewItem,
  claude: Map<string, Verdict>,
  mistral: Map<string, Verdict>,
): string {
  const editable = Object.fromEntries(
    EDITABLE[it.kind].filter((k) => it.data[k] !== undefined).map((k) => [k, it.data[k]]),
  );
  return [
    `editable fields now: ${JSON.stringify(editable)}`,
    fmt("reviewer A (Claude Sonnet)", claude.get(it.id)),
    fmt("reviewer B (Mistral)", mistral.get(it.id)),
  ].join("\n");
}

export type RewriteTask = "explanation" | "cloze-options" | "drill-options";

const REWRITE_INSTRUCTION: Record<RewriteTask, string> = {
  explanation:
    'TASK: each item has a generic explanation. Write a specific one (one or two plain English sentences: the rule or the clue that makes THIS answer right, quoting the answer in double quotes). Return decision "fix" with patch {"explanation": "..."}; touch nothing else unless the item is wrong, in which case fix that too.',
  "cloze-options":
    'TASK: each fill-in item takes its wrong options from other lines of its pack, so they are often another kind of word. Replace them with wrong options of the SAME kind as the answer that a learner might pick and that the sentence rules out (add a short bracketed clue to the prompt where two would fit). Return decision "fix" with patch {"choices"|"bank": [the full list, answer at the same position]} and, if needed, "prompt".',
  "drill-options":
    'TASK: each item conjugates the bracketed verb, but some wrong options are other verbs. Replace every wrong option with another form of the SAME verb in the same tense that the subject rules out. Return decision "fix" with patch {"choices"|"bank": [the full list, answer at the same position]}.',
};

export function rewriteSystem(course: Course, task: RewriteTask): string {
  return [judgeSystem(course), "", REWRITE_INSTRUCTION[task]].join("\n");
}

/** Reads a judge or rewrite reply. A key with no usable ruling is missing (re-queued, never kept). */
export function parseRulings(c: Chunk, text: string): { rulings: Ruling[]; missing: string[] } {
  const byKey = new Map(c.items.map((it, i) => [localKey(i), it.id]));
  const rulings: Ruling[] = [];
  const seen = new Set<string>();
  let entries: Record<string, unknown>[] = [];
  const json = firstJsonObject(text);
  if (json) {
    try {
      const p = JSON.parse(json) as { items?: unknown };
      if (Array.isArray(p.items)) entries = p.items as Record<string, unknown>[];
    } catch {
      entries = [];
    }
  }
  for (const raw of entries) {
    const id = byKey.get(typeof raw?.key === "string" ? raw.key.trim() : "");
    if (!id || seen.has(id)) continue;
    const decision = raw.decision;
    if (decision !== "keep" && decision !== "fix" && decision !== "owner") continue;
    const patch =
      raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch)
        ? (raw.patch as Patch)
        : undefined;
    if (decision === "fix" && (!patch || !Object.keys(patch).length)) continue;
    seen.add(id);
    rulings.push({
      id,
      decision,
      category: typeof raw.category === "string" ? raw.category : undefined,
      confidence: Math.min(1, Math.max(0, Number(raw.confidence ?? 0.5) || 0)),
      reason: typeof raw.reason === "string" ? raw.reason : "",
      ...(decision === "fix" ? { patch, keyChange: raw.keyChange === true } : {}),
    });
  }
  return { rulings, missing: c.items.map((it) => it.id).filter((id) => !seen.has(id)) };
}

/**
 * Where each ruling goes: a confident fix becomes a proposed fix (fixes.ts checks it next), a keep
 * closes the item, and everything else is the owner's (kept short by the confidence bar).
 */
export function route(rulings: Ruling[]): {
  fixes: ProposedFix[];
  kept: string[];
  owner: Ruling[];
} {
  const fixes: ProposedFix[] = [];
  const kept: string[] = [];
  const owner: Ruling[] = [];
  for (const r of rulings) {
    if (r.decision === "keep") kept.push(r.id);
    else if (r.decision === "fix" && r.confidence >= MIN_FIX_CONFIDENCE && r.patch)
      fixes.push({
        id: r.id,
        patch: r.patch,
        reason: r.reason,
        // A key change is only honoured when the judge also called it a wrong key.
        ...(r.keyChange && r.category === "wrong-key" ? { keyChange: true } : {}),
      });
    else owner.push(r);
  }
  return { fixes, kept, owner };
}
