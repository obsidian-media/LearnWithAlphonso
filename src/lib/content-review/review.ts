// Turning items into requests and replies into verdicts, for every phase of the full content review.
// Pure: no network. Requests group a few items of ONE course (one rubric = one cache prefix); each
// item is given a short local key ("i1"...) so a reply cannot mangle a long id.

import type { Course } from "../../data/courses";
import type { ReviewItem } from "./inventory";
import {
  CATEGORIES,
  SEVERITIES,
  rubric,
  type Category,
  type RubricRole,
  type Severity,
} from "./rubric";

export type Verdict = {
  id: string;
  verdict: "ok" | "defect";
  category?: Category;
  severity?: Severity;
  problem?: string;
  fix?: string;
  confidence: number;
};

export type Chunk = {
  /** Valid as an Anthropic custom_id (^[a-zA-Z0-9_-]{1,64}$) and a Mistral custom_id. */
  customId: string;
  course: Course;
  items: ReviewItem[];
};

/** Items per request, by kind: long items (story scenes) go in fewer per request. */
export const ITEMS_PER_REQUEST: Record<string, number> = {
  question: 12,
  card: 15,
  "lesson-meta": 20,
  "unit-meta": 20,
  placement: 12,
  campaign: 4,
  "campaign-scene": 3,
  scenario: 3,
  "podcast-quiz": 10,
};

/** Output allowance per item: a defect entry with a problem and a fix is about 110 tokens. */
export const OUTPUT_TOKENS_PER_ITEM = 320;

/** Groups items into requests: one course and one kind per request, in inventory order. */
export function chunk(items: ReviewItem[], phase: string): Chunk[] {
  const out: Chunk[] = [];
  const groups = new Map<string, ReviewItem[]>();
  for (const it of items) {
    const k = `${it.course}|${it.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  for (const [k, group] of groups) {
    const [course, kind] = k.split("|") as [Course, string];
    const size = ITEMS_PER_REQUEST[kind] ?? 10;
    for (let i = 0; i < group.length; i += size)
      out.push({
        customId: `${phase}-${course}-${kind}-${i / size}`
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 64),
        course,
        items: group.slice(i, i + size),
      });
  }
  return out;
}

export const localKey = (i: number) => `i${i + 1}`;

/** The user message for one request. `extra` adds per-item context (a judge sees both verdicts). */
export function userMessage(c: Chunk, extra?: (it: ReviewItem) => string | undefined): string {
  return [
    `Review these ${c.items.length} items.`,
    ...c.items.map((it, i) => {
      const flags = it.flags?.length ? `\nknown flags: ${it.flags.join(", ")}` : "";
      const more = extra?.(it);
      return `\n### key: ${localKey(i)}\n${it.text}${flags}${more ? `\n${more}` : ""}`;
    }),
  ].join("\n");
}

export function maxTokensFor(c: Chunk, perItem = OUTPUT_TOKENS_PER_ITEM) {
  return Math.max(1024, c.items.length * perItem);
}

export function systemFor(c: Chunk, role: RubricRole = "review") {
  return rubric(c.course, role);
}

/** The first balanced JSON object in a reply (a model may wrap it in a code fence). */
export function firstJsonObject(text: string): string | null {
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
 * Verdicts for one chunk. A key the reply leaves out, repeats or garbles is in `missing`, never
 * counted as ok: an item with no verdict is re-queued, not passed.
 */
export function parseChunkReply(
  c: Chunk,
  text: string,
): { verdicts: Verdict[]; missing: string[]; errors: string[] } {
  const errors: string[] = [];
  const ids = c.items.map((it) => it.id);
  const json = firstJsonObject(text);
  let entries: Record<string, unknown>[] = [];
  if (!json) errors.push("no JSON object in the reply");
  else {
    try {
      const parsed = JSON.parse(json) as { items?: unknown };
      if (Array.isArray(parsed.items)) entries = parsed.items as Record<string, unknown>[];
      else errors.push('no "items" array');
    } catch (e) {
      errors.push(`invalid JSON: ${(e as Error).message}`);
    }
  }
  const byKey = new Map(c.items.map((it, i) => [localKey(i), it.id]));
  const seen = new Set<string>();
  const verdicts: Verdict[] = [];
  for (const raw of entries) {
    const key = typeof raw?.key === "string" ? raw.key.trim() : "";
    const id = byKey.get(key);
    if (!id) {
      errors.push(`unexpected key ${JSON.stringify(key)}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`repeated key ${key}`);
      continue;
    }
    if (raw.verdict !== "ok" && raw.verdict !== "defect") {
      errors.push(`${key}: verdict ${JSON.stringify(raw.verdict)}`);
      continue;
    }
    seen.add(id);
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence ?? 0.5) || 0));
    if (raw.verdict === "ok") {
      verdicts.push({ id, verdict: "ok", confidence });
      continue;
    }
    verdicts.push({
      id,
      verdict: "defect",
      confidence,
      category: (CATEGORIES as readonly string[]).includes(String(raw.category))
        ? (raw.category as Category)
        : "other",
      severity: (SEVERITIES as readonly string[]).includes(String(raw.severity))
        ? (raw.severity as Severity)
        : "major",
      problem: typeof raw.problem === "string" ? raw.problem : undefined,
      fix: typeof raw.fix === "string" ? raw.fix : undefined,
    });
  }
  return { verdicts, missing: ids.filter((id) => !seen.has(id)), errors };
}
