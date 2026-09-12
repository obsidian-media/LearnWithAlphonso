import type { Lesson, Question, Unit } from "./curriculum";
import type { Level } from "./levels";

/**
 * Shared content-bank engine. A pack holds ~25 terse lines that the
 * generator expands into 5-question lessons grouped into units. Used by
 * every course (English, French, …).
 */
export type Pack = {
  id: string;
  title: string;
  subtitle: string;
  note: string;
  /** "pair" lines: "left|right" — prompt asks for the right side. */
  kind: "pair" | "cloze";
  /** prompt template for pair packs, `%s` is the left side. */
  prompt?: string;
  data: string;
};

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDistractors(answer: string, pool: string[], seed: string) {
  const others = pool.filter((o) => o.toLowerCase() !== answer.toLowerCase());
  const start = hash(seed) % Math.max(1, others.length);
  const out: string[] = [];
  for (let i = 0; out.length < 3 && i < others.length; i++) {
    const cand = others[(start + i * 7) % others.length];
    if (cand && !out.includes(cand)) out.push(cand);
  }
  return out;
}

export function packQuestions(pack: Pack): Question[] {
  const lines = pack.data
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((p) => p.trim()));
  const pool = lines.map((l) => l[1]!);
  return lines.map(([left, right], i) => {
    const answer = right!;
    const seed = `${pack.id}-${i}`;
    const distractors = pickDistractors(answer, pool, seed);
    const prompt = pack.kind === "pair" ? (pack.prompt ?? "%s").replace("%s", left!) : left!;
    const explanation =
      pack.kind === "pair"
        ? `${left} → ${answer}. ${pack.note}`
        : `"${answer}" is correct here. ${pack.note}`;
    const useMc = (hash(seed) & 1) === 0 || distractors.length < 3;
    if (useMc) {
      const choices = [answer, ...distractors];
      const at = hash(seed + "x") % choices.length;
      choices[0] = choices[at]!;
      choices[at] = answer;
      return {
        id: `${pack.id}q${i}`,
        type: "mc",
        prompt,
        choices,
        answer: at,
        explanation,
      };
    }
    return {
      id: `${pack.id}q${i}`,
      type: "fill",
      prompt: pack.kind === "cloze" ? prompt : `${prompt} ___`,
      bank: [answer, ...distractors].sort((a, b) => hash(a + seed) - hash(b + seed)),
      answer,
      explanation,
    };
  });
}

/**
 * Re-shuffles a question's answer-order presentation (MC choice order, or
 * fill-bank word order) using a fresh seed, leaving the underlying prompt/
 * answer/explanation untouched. Since the curriculum is built once at
 * module load (not per-attempt), this is what makes replaying the same
 * lesson feel different each time: call it with a new per-attempt seed
 * when a lesson mounts, rather than relying on packQuestions()'s
 * one-time-at-load seed.
 */
export function reshuffleQuestion(q: Question, seed: string): Question {
  if (q.type === "mc") {
    const order = q.choices
      .map((_, i) => i)
      .sort((a, b) => hash(`${seed}-${a}`) - hash(`${seed}-${b}`));
    const choices = order.map((i) => q.choices[i]!);
    return { ...q, choices, answer: order.indexOf(q.answer) };
  }
  const bank = [...q.bank].sort((a, b) => hash(seed + a) - hash(seed + b));
  return { ...q, bank };
}

const QUESTIONS_PER_LESSON = 5;
const LESSONS_PER_UNIT = 5;

export function buildLevel(level: Level, packs: Pack[], startUnitIndex: number): Unit[] {
  const units: Unit[] = [];
  packs.forEach((pack) => {
    const qs = packQuestions(pack);
    const lessons: Lesson[] = [];
    for (let i = 0; i < qs.length; i += QUESTIONS_PER_LESSON) {
      const slice = qs.slice(i, i + QUESTIONS_PER_LESSON);
      if (slice.length < 3) break;
      const n = lessons.length + 1;
      lessons.push({
        id: `${pack.id}l${n}`,
        title: `${pack.title} ${n}`,
        subtitle: pack.subtitle,
        questions: slice,
      });
    }
    for (let i = 0; i < lessons.length; i += LESSONS_PER_UNIT) {
      const group = lessons.slice(i, i + LESSONS_PER_UNIT);
      const idx = startUnitIndex + units.length + 1;
      units.push({
        id: `${pack.id}u${i / LESSONS_PER_UNIT + 1}`,
        level,
        eyebrow: `Unit ${idx}`,
        title: pack.title,
        description: `${pack.subtitle} — ${pack.note}`,
        lessons: group,
      });
    }
  });
  return units;
}

export function unitsFromBank(
  bank: Record<Level, Pack[]>,
  existingCountByLevel: Record<Level, number>,
): Unit[] {
  const levels: Level[] = ["A1", "A2", "B1", "B2", "C1"];
  return levels.flatMap((l) => buildLevel(l, bank[l] ?? [], existingCountByLevel[l] ?? 0));
}
