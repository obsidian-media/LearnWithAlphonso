/**
 * What one finished rehearsal run teaches the tutor (a rehearsal_runs row), as the server builds it from the recap
 * model's reply. Pure: no I/O.
 *
 * The memory never holds the learner's own words. Moment labels come from a closed list (the rehearsal's own hard
 * moments), so a label the model made up, or a learner's phrase it copied, is dropped. Corrected forms are the
 * model's corrected sentence, and one that carries a digit is dropped whole (a salary, a date, an address number).
 */
export const RUN_MEMORY_MAX_ITEMS = 5;
export const RUN_MEMORY_MAX_CHARS = 140;

export type RunMoments = { shown: string[]; wentWell: string[] };

const EMPTY: RunMoments = { shown: [], wentWell: [] };

function labelsIn(v: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && allowed.includes(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

/** The `moments` of the recap model's JSON reply, checked against the rehearsal's hard-moment labels. */
export function parseRehearsalMoments(content: string, labels: readonly string[]): RunMoments {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return EMPTY;
  let obj: unknown;
  try {
    obj = JSON.parse(content.slice(start, end + 1));
  } catch {
    return EMPTY;
  }
  const moments = (obj as { moments?: unknown } | null)?.moments;
  if (!moments || typeof moments !== "object") return EMPTY;
  const raw = moments as { shown?: unknown; wentWell?: unknown };
  const shown = labelsIn(raw.shown, labels);
  // A moment cannot have gone well without being raised.
  const wentWell = labelsIn(raw.wentWell, shown);
  return { shown, wentWell };
}

const capped = (items: string[]): string[] =>
  items
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= RUN_MEMORY_MAX_CHARS)
    .slice(0, RUN_MEMORY_MAX_ITEMS);

export function buildRunMemory(args: {
  corrections: { fixed: string }[];
  moments: RunMoments | null;
  labels: readonly string[];
}): { momentsShown: string[]; wentWell: string[]; corrections: string[] } {
  const moments = args.moments ?? EMPTY;
  const forms: string[] = [];
  for (const c of args.corrections) {
    const f = c.fixed.trim();
    if (/\d/.test(f) || forms.includes(f)) continue;
    forms.push(f);
  }
  return {
    momentsShown: capped(labelsIn(moments.shown, args.labels)),
    wentWell: capped(labelsIn(moments.wentWell, args.labels)),
    corrections: capped(forms),
  };
}
