// The French and Spanish content review panel (backlog 0.0-ay): two AI reviewers from different
// providers read lesson questions, campaign scenes and placement questions as a native teacher would,
// each returns a verdict per item, and the items are sorted into "both say defect", "disagree" and
// "both ok". The owner decided on 2026-11-05 that this replaces a native-speaker review.
//
// This file is the pure part: which items, what the reviewers are told, how their answers are read
// and combined, and what a run is estimated to cost. It never calls a network; the runner
// (scripts/content-panel/run.ts) does, and only when told to.

import { campaignsFor } from "../../data/campaigns";
import type { Question } from "../../data/curriculum";
import { curriculumEs } from "../../data/curriculum-es";
import { curriculumFr } from "../../data/curriculum-fr";
import { hash } from "../../data/bank-engine";
import type { PlacementQuestion } from "../../data/placement";
import { PLACEMENT_QUESTIONS_ES } from "../../data/placement-es";
import { PLACEMENT_QUESTIONS_FR } from "../../data/placement-fr";

export type PanelLang = "fr" | "es";
export type PanelSource = "lesson" | "campaign" | "placement";

export type PanelItem = {
  /** Stable id the reviewers echo back: "fr:lesson:fra2p6q3", "es:placement:ep6". */
  key: string;
  lang: PanelLang;
  source: PanelSource;
  level: string;
  /** What the reviewer reads: the item exactly as a learner meets it, with the key marked. */
  text: string;
  /** Why the item was put in the sample on purpose (an earlier PR asked for a native check). */
  flagged?: string;
};

export const CATEGORIES = [
  "grammar",
  "naturalness",
  "register",
  "regional",
  "level",
  "wrong-key",
  "second-answer",
  "absurd-option",
  "giveaway",
  "explanation",
  "english-leak",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Verdict = {
  key: string;
  verdict: "ok" | "defect";
  category?: Category;
  problem?: string;
  fix?: string;
  confidence: number;
};

// ---- Items --------------------------------------------------------------------------------------

function renderQuestion(q: Question): string {
  const lines = [`type: ${q.type}`];
  if (q.type === "mc") {
    lines.push(`prompt: ${q.prompt}`);
    q.choices.forEach((c, i) => lines.push(`  ${String.fromCharCode(65 + i)}. ${c}`));
    lines.push(`KEY: ${q.choices[q.answer]}`);
  } else if (q.type === "fill") {
    lines.push(`prompt: ${q.prompt}`, `word bank: ${q.bank.join(" / ")}`, `KEY: ${q.answer}`);
  } else if (q.type === "listening") {
    lines.push(`audio says: ${q.audioText}`, `prompt: ${q.prompt}`);
    q.choices.forEach((c, i) => lines.push(`  ${String.fromCharCode(65 + i)}. ${c}`));
    lines.push(`KEY: ${q.answer}`);
  } else if (q.type === "translate") {
    lines.push(`task: ${q.prompt}`, `accepted answers: ${q.acceptableAnswers.join(" | ")}`);
  } else if (q.type === "reorder") {
    lines.push(`prompt: ${q.prompt}`, `KEY: ${q.answer}`);
  } else if (q.type === "speak") {
    lines.push(`say aloud: ${q.answer}`);
  }
  if ("explanation" in q && q.explanation) lines.push(`explanation shown after: ${q.explanation}`);
  return lines.join("\n");
}

function renderPlacement(q: PlacementQuestion): string {
  if (q.type === "mc")
    return [
      "type: mc (placement test)",
      `prompt: ${q.prompt}`,
      ...q.choices.map((c, i) => `  ${String.fromCharCode(65 + i)}. ${c}`),
      `KEY: ${q.choices[q.answer]}`,
    ].join("\n");
  if (q.type === "listening")
    return [
      "type: listening (placement test)",
      `audio says: ${q.audioText}`,
      ...q.choices.map((c, i) => `  ${String.fromCharCode(65 + i)}. ${c}`),
      `KEY: ${q.answer}`,
    ].join("\n");
  return [
    "type: translate (placement test)",
    `task: ${q.prompt}`,
    `accepted answers: ${q.acceptableAnswers.join(" | ")}`,
  ].join("\n");
}

export function lessonItems(lang: PanelLang): PanelItem[] {
  const units = lang === "fr" ? curriculumFr : curriculumEs;
  return units.flatMap((u) =>
    u.lessons.flatMap((l) =>
      l.questions
        .filter((q) => q.type !== "speak")
        .map((q) => ({
          key: `${lang}:lesson:${q.id}`,
          lang,
          source: "lesson" as const,
          level: u.level,
          text: `unit: ${u.title} (${u.level})\n${renderQuestion(q)}`,
        })),
    ),
  );
}

export function placementItems(lang: PanelLang): PanelItem[] {
  const qs = lang === "fr" ? PLACEMENT_QUESTIONS_FR : PLACEMENT_QUESTIONS_ES;
  return qs.map((q) => ({
    key: `${lang}:placement:${q.id}`,
    lang,
    source: "placement" as const,
    level: q.level,
    text: `band: ${q.level}\n${renderPlacement(q)}`,
  }));
}

export function campaignItems(lang: PanelLang): PanelItem[] {
  return campaignsFor(lang).flatMap((c) =>
    c.scenes.map((s) => ({
      key: `${lang}:campaign:${c.id}/${s.id}`,
      lang,
      source: "campaign" as const,
      level: c.level,
      text: [
        `story: ${c.title} (${c.level})`,
        `scene: ${s.title}`,
        `opening line the learner sees: ${s.opener}`,
        `instructions the conversation partner follows (judge register and naturalness of the target-language text only): ${s.systemPrompt}`,
      ].join("\n"),
    })),
  );
}

/**
 * Items an earlier PR asked a native speaker to check (#390 campaigns, #396 placement). They are
 * always in the sample. The #391 list names packs and clues rather than items; its packs get a
 * share of the lesson sample instead (FLAGGED_PACKS).
 */
export const FLAGGED: Record<PanelLang, Record<string, string>> = {
  fr: {
    "fr:placement:fp6": "#396: entre / vers / depuis / chez",
    "fr:placement:fp9b": "#396",
    "fr:placement:fp10": "#396: sera vs est",
    "fr:placement:fp10b": '#396: "finissait" as a distractor',
    "fr:placement:fp11b": '#396: "une hausse de dingue", "un gros coup de hausse"',
    "fr:placement:fp13": '#396: "dégoter", "se payer" as informal "acheter"',
    "fr:placement:fp14b": '#396: "un paquet de", "pas mal de"',
    "fr:placement:fp15": "#396: the four noun/sentence options",
    "fr:placement:fp15b": '#396: dangling "en marchant" options',
  },
  es: {
    "es:placement:ep6": "#396: entre / en / sobre / bajo",
    "es:placement:ep9b": "#396",
    "es:placement:ep10": '#396: "será publicado" vs "es publicado"',
    "es:placement:ep10b": "#396",
    "es:placement:ep13": '#396: "agenciarse", "pillar", "llevarse" as informal "comprar"',
    "es:placement:ep14": "#396: insista",
    "es:placement:ep14b": '#396: "tropecientas pruebas"',
    "es:placement:ep15": '#396: "no es que no quiera"',
    "es:placement:ep15b": "#396: gerund subject agreement",
  },
};

/** Packs the #391 PR asked a native speaker to read (clues, written options, translate wordings). */
export const FLAGGED_PACKS: Record<PanelLang, string[]> = {
  fr: ["fra2p4", "fra2p5", "fra2p12", "fra2p15", "fra1p21", "fra2p21", "fra2p6", "fra2p1"],
  es: ["esa2p5", "esa2p9", "esa1p18", "esa2p27", "esa1p22", "esa2p26"],
};

/** #390's campaign notes apply to every scene of these stories. */
const FLAGGED_CAMPAIGNS = ["market-day", "dinner-guest", "lost-bag", "refund-return"];

export type SamplePlan = { lessons: number; flaggedLessons: number; placement: number };
export const DEFAULT_PLAN: SamplePlan = { lessons: 75, flaggedLessons: 18, placement: 30 };

const bySeed = (seed: string) => (a: PanelItem, b: PanelItem) =>
  hash(`${seed}:${a.key}`) - hash(`${seed}:${b.key}`);

/** Lesson items spread over the levels in proportion to their counts (largest remainder). */
function stratified(items: PanelItem[], n: number, seed: string): PanelItem[] {
  const groups = new Map<string, PanelItem[]>();
  for (const it of items) groups.set(it.level, [...(groups.get(it.level) ?? []), it]);
  const total = items.length;
  const shares = [...groups.entries()].map(([level, g]) => ({
    level,
    g: [...g].sort(bySeed(seed)),
    exact: (g.length / total) * n,
  }));
  const base = shares.map((s) => Math.floor(s.exact));
  let left = n - base.reduce((a, b) => a + b, 0);
  shares
    .map((s, i) => ({ i, r: s.exact - base[i]! }))
    .sort((a, b) => b.r - a.r)
    .forEach(({ i }) => {
      if (left > 0) {
        base[i]!++;
        left--;
      }
    });
  return shares.flatMap((s, i) => s.g.slice(0, base[i]));
}

/**
 * The run's items for one language: every campaign scene, every flagged placement item plus a
 * seeded draw to `plan.placement`, a seeded draw from the #391 packs, and a level-stratified draw
 * from all lesson questions. Deterministic for a seed.
 */
export function samplePanelItems(
  lang: PanelLang,
  seed: string,
  plan: SamplePlan = DEFAULT_PLAN,
): PanelItem[] {
  const flagged = FLAGGED[lang];
  const mark = (it: PanelItem): PanelItem =>
    flagged[it.key] ? { ...it, flagged: flagged[it.key] } : it;

  const campaigns = campaignItems(lang).map((it) =>
    FLAGGED_CAMPAIGNS.some((c) => it.key.includes(`:${c}/`))
      ? { ...it, flagged: "#390: new story campaign" }
      : it,
  );

  const allPlacement = placementItems(lang).map(mark);
  const mustPlacement = allPlacement.filter((it) => it.flagged);
  const restPlacement = allPlacement.filter((it) => !it.flagged).sort(bySeed(seed));
  const placement = [
    ...mustPlacement,
    ...restPlacement.slice(0, Math.max(0, plan.placement - mustPlacement.length)),
  ];

  const lessons = lessonItems(lang);
  const packOf = (key: string) => key.split(":")[2]!.replace(/q\d+$/, "");
  const inFlaggedPack = lessons
    .filter((it) => FLAGGED_PACKS[lang].includes(packOf(it.key)))
    .sort(bySeed(seed))
    .slice(0, plan.flaggedLessons)
    .map((it) => ({ ...it, flagged: `#391: pack ${packOf(it.key)}` }));
  const taken = new Set(inFlaggedPack.map((it) => it.key));
  const drawn = stratified(
    lessons.filter((it) => !taken.has(it.key)),
    plan.lessons,
    seed,
  );

  return [...campaigns, ...placement, ...inFlaggedPack, ...drawn];
}

// ---- What the reviewers are told ----------------------------------------------------------------

const LANG_NAME: Record<PanelLang, string> = { fr: "French", es: "Spanish" };

export function systemPrompt(lang: PanelLang): string {
  const variety =
    lang === "es"
      ? "The course teaches Latin American Spanish (seseo, no vosotros); flag Spain-only usage as 'regional' only when a Latin American learner would be misled."
      : "The course teaches standard European French; flag Quebec-only or very regional usage as 'regional'.";
  return [
    `You are an experienced native ${LANG_NAME[lang]} teacher reviewing items from a language-learning app for English speakers.`,
    "Judge each item as you would before it reaches a learner. Look for:",
    "- grammar: the target-language text (prompt, key, options, explanation) has an error;",
    "- naturalness: correct but not what a native speaker would say;",
    "- register: tu/vous or tú/usted inconsistent with the situation or within the item;",
    `- regional: ${variety}`,
    "- level: clearly wrong for the stated CEFR level;",
    "- wrong-key: the marked KEY is wrong;",
    "- second-answer: another option is ALSO correct and nothing in the item rules it out;",
    "- absurd-option: a wrong option nobody would ever pick (wrong word class, nonsense);",
    "- giveaway: the answer can be found without the skill being tested (only one option fits the bracketed hint, the English gloss gives it away);",
    "- explanation: the explanation is wrong or does not explain;",
    "- english-leak: English where target-language text should be (bracketed hints and glosses are intended);",
    "- other.",
    "Wrong options are SUPPOSED to be wrong: do not flag an option for being incorrect, only for being also correct or absurd.",
    "Only flag real problems a careful teacher would fix. When in doubt, say ok with a lower confidence.",
    "Reply with JSON only, no prose, in exactly this shape:",
    '{"items":[{"key":"<the item key>","verdict":"ok"|"defect","category":"<one of the categories above, defect only>","problem":"<one sentence, defect only>","fix":"<the corrected text or option, defect only>","confidence":<0 to 1>}]}',
    "Return one entry for every item key you were given, in the same order.",
  ].join("\n");
}

export function batchMessage(items: PanelItem[]): string {
  return [
    `Review these ${items.length} items.`,
    ...items.map((it) => `\n### key: ${it.key}\n${it.text}`),
  ].join("\n");
}

export function batches(items: PanelItem[], size: Record<PanelSource, number>): PanelItem[][] {
  const out: PanelItem[][] = [];
  for (const source of ["lesson", "placement", "campaign"] as const) {
    const group = items.filter((it) => it.source === source);
    for (let i = 0; i < group.length; i += size[source]) out.push(group.slice(i, i + size[source]));
  }
  return out;
}

export const BATCH_SIZE: Record<PanelSource, number> = { lesson: 15, placement: 10, campaign: 4 };

// ---- Reading the answers ------------------------------------------------------------------------

/** The first balanced JSON object in a reply (models sometimes wrap it in a code fence). */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Verdicts for the expected keys. A key the reply leaves out, repeats or garbles is reported in
 * `errors` and gets no verdict, so it lands in "missing" rather than silently in "ok".
 */
export function parseVerdicts(
  text: string,
  expected: string[],
): { verdicts: Verdict[]; errors: string[] } {
  const errors: string[] = [];
  const json = firstJsonObject(text);
  if (!json) return { verdicts: [], errors: ["no JSON object in the reply"] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { verdicts: [], errors: [`invalid JSON: ${(e as Error).message}`] };
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return { verdicts: [], errors: ['no "items" array'] };
  const want = new Set(expected);
  const seen = new Set<string>();
  const verdicts: Verdict[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    const key = typeof raw?.key === "string" ? raw.key.trim() : "";
    if (!want.has(key)) {
      errors.push(`unexpected key ${JSON.stringify(key)}`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`repeated key ${key}`);
      continue;
    }
    if (raw.verdict !== "ok" && raw.verdict !== "defect") {
      errors.push(`${key}: verdict ${JSON.stringify(raw.verdict)}`);
      continue;
    }
    seen.add(key);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence ?? 0.5) || 0));
    const category = (CATEGORIES as readonly string[]).includes(String(raw.category))
      ? (raw.category as Category)
      : raw.verdict === "defect"
        ? "other"
        : undefined;
    verdicts.push({
      key,
      verdict: raw.verdict,
      confidence,
      ...(raw.verdict === "defect"
        ? {
            category,
            problem: typeof raw.problem === "string" ? raw.problem : undefined,
            fix: typeof raw.fix === "string" ? raw.fix : undefined,
          }
        : {}),
    });
  }
  for (const k of expected) if (!seen.has(k)) errors.push(`missing ${k}`);
  return { verdicts, errors };
}

// ---- Combining the two reviewers ----------------------------------------------------------------

export type Combined = {
  bothDefect: { key: string; a: Verdict; b: Verdict }[];
  disagree: { key: string; a: Verdict; b: Verdict }[];
  bothOk: string[];
  /** One reviewer or both gave no usable verdict. */
  missing: string[];
};

export function combine(keys: string[], a: Verdict[], b: Verdict[]): Combined {
  const ma = new Map(a.map((v) => [v.key, v]));
  const mb = new Map(b.map((v) => [v.key, v]));
  const out: Combined = { bothDefect: [], disagree: [], bothOk: [], missing: [] };
  for (const key of keys) {
    const va = ma.get(key);
    const vb = mb.get(key);
    if (!va || !vb) out.missing.push(key);
    else if (va.verdict === "defect" && vb.verdict === "defect")
      out.bothDefect.push({ key, a: va, b: vb });
    else if (va.verdict === "ok" && vb.verdict === "ok") out.bothOk.push(key);
    else out.disagree.push({ key, a: va, b: vb });
  }
  return out;
}

/** Both flag it, with confidence at least `min` each: the defects to fix without a human decision. */
export function clearCut(c: Combined, min = 0.7) {
  return c.bothDefect.filter((d) => d.a.confidence >= min && d.b.confidence >= min);
}

// ---- Cost -----------------------------------------------------------------------------------------

/** US dollars per million tokens. */
export type Pricing = { prompt: number; completion: number };

/** French and Spanish run at roughly 3.2 characters per token in the tokenizers we use; rounded down to be safe. */
export const CHARS_PER_TOKEN = 3;
/** A verdict entry with a defect, its problem and its fix is about 90 tokens; most items are "ok" and shorter. */
export const OUTPUT_TOKENS_PER_ITEM = 120;

export function estimateBatchTokens(lang: PanelLang, batch: PanelItem[]) {
  const prompt = Math.ceil(
    (systemPrompt(lang).length + batchMessage(batch).length) / CHARS_PER_TOKEN,
  );
  return { prompt, completion: batch.length * OUTPUT_TOKENS_PER_ITEM };
}

export function estimateCost(
  work: { lang: PanelLang; batch: PanelItem[] }[],
  pricing: Pricing,
): { promptTokens: number; completionTokens: number; usd: number } {
  let promptTokens = 0;
  let completionTokens = 0;
  for (const w of work) {
    const t = estimateBatchTokens(w.lang, w.batch);
    promptTokens += t.prompt;
    completionTokens += t.completion;
  }
  const usd = (promptTokens * pricing.prompt + completionTokens * pricing.completion) / 1_000_000;
  return { promptTokens, completionTokens, usd };
}

/**
 * What a call cost. Under BYOK OpenRouter reports cost US$0 (the provider bills the owner directly),
 * so the cap would never trip on that figure: the largest of the reported cost, the provider's
 * upstream cost and the reported tokens at the model's list price counts against --max-usd.
 */
export function callCost(
  usage:
    | {
        cost?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        cost_details?: { upstream_inference_cost?: number };
      }
    | undefined,
  pricing: Pricing,
): number {
  const listed =
    ((usage?.prompt_tokens ?? 0) * pricing.prompt +
      (usage?.completion_tokens ?? 0) * pricing.completion) /
    1_000_000;
  // Under BYOK, cost_details.upstream_inference_cost is what the provider charged the owner.
  return Math.max(usage?.cost ?? 0, usage?.cost_details?.upstream_inference_cost ?? 0, listed);
}

/**
 * "auto" picks the newest model of these families in OpenRouter's list: Claude Sonnet (a strong
 * reviewer at a fraction of Opus's price) and Mistral Large (Mistral's largest general model).
 * Variants such as ":batch" are left out.
 */
export const MODEL_FAMILY: Record<"claude" | "mistral", RegExp> = {
  claude: /^anthropic\/claude-(\d[\d.]*-)?sonnet(-\d[\d.]*)?$/,
  mistral: /^mistralai\/mistral-large(-\d+)*$/,
};

// ---- Report ---------------------------------------------------------------------------------------

export type ReviewerInfo = { label: string; model: string; providers: string[] };

function categoryCounts(
  c: Combined,
): Record<string, { both: number; aOnly: number; bOnly: number }> {
  const out: Record<string, { both: number; aOnly: number; bOnly: number }> = {};
  const bump = (cat: string | undefined, k: "both" | "aOnly" | "bOnly") => {
    const key = cat ?? "other";
    out[key] = out[key] ?? { both: 0, aOnly: 0, bOnly: 0 };
    out[key][k]++;
  };
  for (const d of c.bothDefect) bump(d.a.category, "both");
  for (const d of c.disagree)
    if (d.a.verdict === "defect") bump(d.a.category, "aOnly");
    else bump(d.b.category, "bOnly");
  return out;
}

const cell = (s: string | undefined) => (s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function summaryMarkdown(params: {
  date: string;
  seed: string;
  reviewers: [ReviewerInfo, ReviewerInfo];
  itemsByLang: Record<PanelLang, number>;
  combined: Combined;
  costUsd: number;
  textOf: (key: string) => string;
}): string {
  const {
    combined: c,
    reviewers: [ra, rb],
  } = params;
  const counts = categoryCounts(c);
  const lines: string[] = [
    `# FR/ES review panel, first run (${params.date})`,
    "",
    `Two reviewers, seed \`${params.seed}\`: **${ra.label}** \`${ra.model}\` (served by ${ra.providers.join(", ") || "unknown"}) and **${rb.label}** \`${rb.model}\` (served by ${rb.providers.join(", ") || "unknown"}).`,
    `Items: ${params.itemsByLang.fr} French, ${params.itemsByLang.es} Spanish. Cost: US$${params.costUsd.toFixed(2)} (OpenRouter's reported cost, or under BYOK, where it reports $0, the tokens at the model's list price).`,
    "",
    "| Outcome | Items |",
    "| --- | --- |",
    `| Both say defect | ${c.bothDefect.length} |`,
    `| Disagree | ${c.disagree.length} |`,
    `| Both ok | ${c.bothOk.length} |`,
    `| No usable verdict from one reviewer | ${c.missing.length} |`,
    "",
    "## Defects per category",
    "",
    `| Category | Both | ${ra.label} only | ${rb.label} only |`,
    "| --- | --- | --- | --- |",
    ...Object.entries(counts)
      .sort((x, y) => y[1].both - x[1].both)
      .map(([cat, n]) => `| ${cat} | ${n.both} | ${n.aOnly} | ${n.bOnly} |`),
    "",
    "## Both say defect",
    "",
    `| Item | ${ra.label} | ${rb.label} |`,
    "| --- | --- | --- |",
    ...c.bothDefect.map(
      (d) =>
        `| \`${d.key}\` | ${d.a.category} (${d.a.confidence}): ${cell(d.a.problem)} Fix: ${cell(d.a.fix)} | ${d.b.category} (${d.b.confidence}): ${cell(d.b.problem)} Fix: ${cell(d.b.fix)} |`,
    ),
    "",
    "## Disagreements (for the owner)",
    "",
    "| Item | Says defect | Problem and fix |",
    "| --- | --- | --- |",
    ...c.disagree.map((d) => {
      const [who, v] = d.a.verdict === "defect" ? [ra.label, d.a] : [rb.label, d.b];
      return `| \`${d.key}\` | ${who} | ${v.category} (${v.confidence}): ${cell(v.problem)} Fix: ${cell(v.fix)} |`;
    }),
    "",
  ];
  if (c.missing.length)
    lines.push("## No usable verdict", "", ...c.missing.map((k) => `- \`${k}\``), "");
  return lines.join("\n");
}
