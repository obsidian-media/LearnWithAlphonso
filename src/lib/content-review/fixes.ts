// The constrained fix applier: checks a proposed patch against the item it changes, before anything
// is written. A patch that breaks a constraint is rejected with the reason; it is never trimmed or
// half-applied. Constraints (docs/CONTENT-PLAYBOOK.md, "What a fix may change"):
//
// - Ids, question types, option counts and the answer's position never change (id-parity.test.ts:
//   ids are index-derived and are learners' review history).
// - The answer (key) stays the same unless the fix is a reviewed wrong-key correction (`keyChange`).
// - Options stay distinct, and no wrong option equals the answer.
// - A blank prompt keeps exactly one blank.
// - An explanation is never the generic '"x" is correct here.' line and, for a question with a single
//   answer text, quotes that answer in double quotes (save-word spans read quoted course text, and it
//   is the playbook's explanation rule).
// - English scenario prompts never change (older app builds send them verbatim; see scenarios.ts).
//   Any other conversation prompt change carries `needsLegacyPrompt`: the old text must go into
//   legacy-system-prompts.fixtures.json in the same PR, or /api/chat rejects older builds.

import type { ItemKind, ReviewItem } from "./inventory";
import { GENERIC_EXPLANATION } from "./gates";

export type Patch = Record<string, string | string[]>;

export type ProposedFix = {
  id: string;
  patch: Patch;
  /** True only when the judge decided the key itself is wrong (category wrong-key). */
  keyChange?: boolean;
  reason: string;
};

export type CheckedFix = ProposedFix & { needsLegacyPrompt?: boolean };

/** Fields a fix may set, per kind. Anything else (id, type, answer index, level...) is refused. */
export const EDITABLE: Record<ItemKind, readonly string[]> = {
  question: [
    "prompt",
    "choices",
    "bank",
    "answer",
    "explanation",
    "acceptableAnswers",
    "audioText",
    "tokens",
    "meaning",
    "example",
  ],
  placement: ["prompt", "choices", "answer", "acceptableAnswers", "audioText"],
  card: ["meaning", "example"],
  "lesson-meta": ["title", "subtitle"],
  "unit-meta": ["title", "description"],
  campaign: ["title", "blurb", "premise"],
  "campaign-scene": ["title", "opener", "systemPrompt"],
  scenario: ["title", "blurb", "opener", "systemPrompt"],
  "podcast-quiz": ["prompt", "choices"],
};

const norm = (s: string) => s.trim().toLowerCase().normalize("NFC");

/** The answer TEXT of a question-like object, or null when it has none (translate). */
export function answerText(d: Record<string, unknown>): string | null {
  const t = d.type;
  if (
    t === "mc" ||
    (t === undefined && Array.isArray(d.choices) && typeof d.answerIndex === "number")
  ) {
    const choices = d.choices as string[];
    const idx = (typeof d.answer === "number" ? d.answer : d.answerIndex) as number;
    return choices[idx] ?? null;
  }
  if (typeof d.answer === "string") return d.answer;
  return null;
}

function optionsField(d: Record<string, unknown>): "choices" | "bank" | null {
  if (Array.isArray(d.choices)) return "choices";
  if (Array.isArray(d.bank)) return "bank";
  return null;
}

/** The English word-card rules (vocab-meanings.test.ts cardProblems), applied to a card patch. */
export function cardRules(term: string, patch: Patch): string[] {
  const why: string[] = [];
  const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
  for (const field of ["meaning", "example"] as const) {
    const t = patch[field];
    if (typeof t !== "string") continue;
    if (!t.trim()) why.push(`the card ${field} is empty`);
    if (/_{2,}/.test(t)) why.push(`the card ${field} has a blank`);
    if (/→|->/.test(t)) why.push(`the card ${field} has an arrow`);
    if (/[()[\]]/.test(t)) why.push(`the card ${field} has a bracket clue`);
  }
  if (typeof patch.meaning === "string" && words(patch.meaning).length > 8)
    why.push("the card meaning is over 8 words");
  if (
    typeof patch.example === "string" &&
    term &&
    !patch.example.toLowerCase().includes(term.toLowerCase())
  )
    why.push("the card example does not use the term");
  return why;
}

/** Validates `fix` against `item`. Returns the reasons it is refused; empty means it may be applied. */
export function checkFix(item: ReviewItem, fix: ProposedFix): string[] {
  const why: string[] = [];
  const d = item.data;
  const allowed = EDITABLE[item.kind];
  const keys = Object.keys(fix.patch);
  if (!keys.length) why.push("empty patch");
  for (const k of keys) {
    if (!allowed.includes(k)) {
      why.push(`field "${k}" may not be changed on a ${item.kind}`);
      continue;
    }
    const before = d[k];
    const after = fix.patch[k];
    if (before === undefined) {
      // Adding an authored card meaning or example to a question is allowed; nothing else is.
      if (!(item.kind === "question" && (k === "meaning" || k === "example")))
        why.push(`field "${k}" does not exist on this item`);
      if (typeof after !== "string") why.push(`field "${k}" must be text`);
      continue;
    }
    if (Array.isArray(before) !== Array.isArray(after)) why.push(`field "${k}" changes shape`);
    else if (Array.isArray(before) && Array.isArray(after)) {
      if (k !== "acceptableAnswers" && after.length !== before.length)
        why.push(`field "${k}" has ${after.length} entries, the item has ${before.length}`);
      if (after.some((x) => typeof x !== "string" || !x.trim()))
        why.push(`field "${k}" has an empty entry`);
    } else if (typeof after !== "string" || (!after.trim() && k !== "meaning" && k !== "example"))
      why.push(`field "${k}" must be non-empty text`);
    if (
      typeof after === "string" &&
      typeof before === "string" &&
      after.length > before.length * 2 + 300
    )
      why.push(`field "${k}" grew from ${before.length} to ${after.length} characters`);
  }
  if (why.length) return why;

  const next: Record<string, unknown> = { ...d, ...fix.patch };
  const isQuestionLike =
    item.kind === "question" || item.kind === "placement" || item.kind === "podcast-quiz";

  if (isQuestionLike) {
    const oldAnswer = answerText(d);
    const opt = optionsField(d);
    // The answer's position never moves; for mc the index stays and the text at it is the key.
    let newAnswer = oldAnswer;
    if (opt === "choices" && typeof d.answer === "number")
      newAnswer = (next.choices as string[])[d.answer as number] ?? null;
    else if (item.kind === "podcast-quiz")
      newAnswer = (next.choices as string[])[d.answerIndex as number] ?? null;
    else if (typeof next.answer === "string") newAnswer = next.answer;
    if (
      oldAnswer !== null &&
      newAnswer !== null &&
      norm(oldAnswer) !== norm(newAnswer) &&
      !fix.keyChange
    )
      why.push(
        `the answer changes ("${oldAnswer}" -> "${newAnswer}") without a reviewed key change`,
      );
    if (opt && newAnswer !== null) {
      const options = next[opt] as string[];
      if (!options.some((o) => o === newAnswer))
        why.push(`the answer "${newAnswer}" is not among the options`);
      const lower = options.map(norm);
      if (new Set(lower).size !== lower.length) why.push("two options are the same");
      if (options.filter((o) => norm(o) === norm(newAnswer)).length > 1)
        why.push("a wrong option equals the answer");
    }
    if (Array.isArray(d.acceptableAnswers)) {
      const before = d.acceptableAnswers as string[];
      const after = next.acceptableAnswers as string[];
      if (!after.length) why.push("no accepted answer left");
      else if (norm(after[0]!) !== norm(before[0]!) && !fix.keyChange)
        why.push("the first accepted answer changes without a reviewed key change");
    }
    if (Array.isArray(d.tokens)) {
      const words = (s: string) => s.split(/\s+/).filter(Boolean).sort().join(" ");
      if (words((next.tokens as string[]).join(" ")) !== words(String(next.answer)))
        why.push("the reorder tokens are not the answer's words");
    }
    if (typeof d.prompt === "string" && d.prompt.includes("___")) {
      const blanks = String(next.prompt).split("___").length - 1;
      if (blanks !== 1) why.push(`the prompt has ${blanks} blanks, it needs exactly one`);
    }
    if (
      typeof d.audioText === "string" &&
      typeof next.prompt === "string" &&
      next.prompt.includes(String(next.audioText))
    )
      why.push("a listening prompt restates its audio");
  }

  if (typeof fix.patch.explanation === "string") {
    const e = fix.patch.explanation;
    if (GENERIC_EXPLANATION.test(e) || /is correct here/i.test(e))
      why.push("the explanation is the generic line");
    const ans = answerText(next);
    if (ans && item.kind === "question" && !e.includes(`"${ans}"`))
      why.push(`the explanation does not quote the answer as "${ans}"`);
  }
  if (item.kind === "card") why.push(...cardRules(String(item.data.term ?? ""), fix.patch));
  if (
    item.kind === "card" &&
    typeof fix.patch.meaning === "string" &&
    /is correct here/i.test(fix.patch.meaning)
  )
    why.push("a card meaning is the quiz explanation");
  if (
    (item.kind === "scenario" || item.kind === "campaign-scene") &&
    "systemPrompt" in fix.patch &&
    item.course === "en"
  )
    why.push("English conversation prompts are frozen (older builds send them verbatim)");
  if (fix.keyChange && !isQuestionLike) why.push("a key change on an item with no key");
  return why;
}

/** Checks every fix; returns the ones that pass (with their follow-up needs) and the refusals. */
export function checkFixes(
  items: Map<string, ReviewItem>,
  fixes: ProposedFix[],
): { ok: CheckedFix[]; refused: { fix: ProposedFix; why: string[] }[] } {
  const ok: CheckedFix[] = [];
  const refused: { fix: ProposedFix; why: string[] }[] = [];
  const seen = new Set<string>();
  for (const f of fixes) {
    const item = items.get(f.id);
    if (!item) {
      refused.push({ fix: f, why: ["unknown item id"] });
      continue;
    }
    if (seen.has(f.id)) {
      refused.push({ fix: f, why: ["a second fix for the same item"] });
      continue;
    }
    const why = checkFix(item, f);
    if (why.length) refused.push({ fix: f, why });
    else {
      seen.add(f.id);
      ok.push({ ...f, ...("systemPrompt" in f.patch ? { needsLegacyPrompt: true } : {}) });
    }
  }
  return { ok, refused };
}

/** The item's data with the patch applied (what the overlay produces at build time). */
export function applyPatch<T extends Record<string, unknown>>(data: T, patch: Patch): T {
  return { ...data, ...patch };
}

/**
 * The overlay file for one course: { "<item id>": { patch, reason, keyChange? } }, sorted by id so
 * a re-run diffs cleanly. The delivery PRs apply it to the source data (see the playbook).
 */
export function overlayJson(fixes: CheckedFix[]): string {
  const sorted = [...fixes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const f of sorted)
    out[f.id] = { patch: f.patch, reason: f.reason, ...(f.keyChange ? { keyChange: true } : {}) };
  return `${JSON.stringify(out, null, 1)}\n`;
}
