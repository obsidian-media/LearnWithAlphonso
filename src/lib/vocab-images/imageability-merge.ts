import {
  IMAGE_CATEGORIES,
  validateImageabilityData,
  type ImageCategory,
  type ImageabilityData,
} from "./imageability";
import type { ImageLang } from "./types";

export type CandidateBatch = {
  batch: string;
  lang: ImageLang;
  candidates: { term: string; key: string; meaning: string; enHint: string | null }[];
};

export type ClassificationResult = {
  batch: string;
  lang: ImageLang;
  deny: string[];
  queries: Record<string, string>;
} & Record<ImageCategory, string[]>;

const sortUnique = (xs: string[]) => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function mergeClassification(
  current: ImageabilityData,
  batch: CandidateBatch,
  result: ClassificationResult,
): { data: ImageabilityData; problems: string[] } {
  if (result.batch !== batch.batch || result.lang !== batch.lang) {
    return { data: current, problems: [`result is for batch ${result.batch}, not ${batch.batch}`] };
  }
  const problems: string[] = [];
  const id = batch.batch;
  const candidates = new Set(batch.candidates.map((c) => c.term));
  const placed = new Map<string, number>();
  const buckets: string[][] = [...IMAGE_CATEGORIES.map((c) => result[c]), result.deny];
  for (const list of buckets) for (const t of list) placed.set(t, (placed.get(t) ?? 0) + 1);

  for (const t of candidates) if (!placed.has(t)) problems.push(`${id}: "${t}" is not classified`);
  for (const [t, n] of placed)
    if (n > 1) problems.push(`${id}: "${t}" is classified more than once`);
  for (const t of placed.keys())
    if (!candidates.has(t)) problems.push(`${id}: "${t}" is not a candidate in this batch`);

  const imageable = new Set(IMAGE_CATEGORIES.flatMap((c) => result[c]));
  if (batch.lang !== "en") {
    for (const t of imageable)
      if (!result.queries[t]?.trim()) problems.push(`${id}: imageable "${t}" has no English query`);
  }
  for (const t of Object.keys(result.queries)) {
    if (!imageable.has(t)) problems.push(`${id}: query given for non-imageable "${t}"`);
  }
  if (problems.length) return { data: current, problems };

  const data: ImageabilityData = structuredClone(current);
  const lang = batch.lang;
  for (const c of IMAGE_CATEGORIES)
    data.imageable[lang][c] = sortUnique([...data.imageable[lang][c], ...result[c]]);
  data.deny[lang] = sortUnique([...data.deny[lang], ...result.deny]);
  data.queries[lang] = Object.fromEntries(
    Object.entries({ ...data.queries[lang], ...result.queries }).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  const structural = validateImageabilityData(data).map((p) => `${id}: ${p}`);
  return structural.length ? { data: current, problems: structural } : { data, problems: [] };
}
