/**
 * Which parts of a lesson explanation are in the course's language, for the French and Spanish
 * courses, where an explanation is English with course text quoted inside it. Only text the QUESTION
 * itself proves is course-language is offered for saving; nothing is guessed from a dictionary.
 *
 * Proven course-language text, by question type:
 * - translate: the acceptable answers; listening: the audio text; speak: the answer. (Reorder is left out: neither course has one, so it is unverified.)
 * - mc/fill: the correct answer, but ONLY when the prompt states that the answer is in the course
 *   language ("... in French?", "The French word for ..."). "The idiom X means..." has an English
 *   answer, so it offers nothing.
 *
 * A candidate counts only where the explanation quotes it ("...") or puts it right after an arrow
 * ("hello → Salut."), so the same letters inside an English word, or in unquoted English prose, never
 * match. Twin of CourseLanguageSpans.swift: keep the rules and tests the same.
 */
export type SpanQuestion = {
  type: string;
  prompt: string;
  explanation: string;
  answer?: string | number;
  choices?: string[];
  acceptableAnswers?: string[];
  audioText?: string;
};

const LANGUAGE = "(?:French|Spanish)";
// The prompt says the ANSWER is in the course language.
const ANSWER_IN_COURSE_LANGUAGE = [
  new RegExp(`^how do you say .* in ${LANGUAGE}\\?`, "i"),
  new RegExp(`^the ${LANGUAGE}(?: word)? for `, "i"),
  new RegExp(`^the opposite of .* in ${LANGUAGE} is`, "i"),
];

function candidates(q: SpanQuestion): string[] {
  switch (q.type) {
    case "translate":
      return q.acceptableAnswers ?? [];
    case "listening":
      return q.audioText ? [q.audioText] : [];
    case "speak":
      return typeof q.answer === "string" ? [q.answer] : [];
    case "mc":
    case "fill": {
      if (!ANSWER_IN_COURSE_LANGUAGE.some((re) => re.test(q.prompt.trim()))) return [];
      if (typeof q.answer === "string") return [q.answer];
      if (typeof q.answer === "number" && q.choices?.[q.answer]) return [q.choices[q.answer]];
      return [];
    }
    default:
      return [];
  }
}

const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);

type Hit = { start: number; end: number };

/** Where the explanation quotes `text` or puts it right after an arrow. */
function hitsFor(explanation: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const quoted = `"${text}"`;
  for (let at = explanation.indexOf(quoted); at >= 0; at = explanation.indexOf(quoted, at + 1)) {
    hits.push({ start: at + 1, end: at + 1 + text.length });
  }
  const arrow = `→ ${text}`;
  for (let at = explanation.indexOf(arrow); at >= 0; at = explanation.indexOf(arrow, at + 1)) {
    const end = at + arrow.length;
    if (!isLetter(explanation[end])) hits.push({ start: at + 2, end });
  }
  return hits;
}

/** The course-language strings the explanation contains, each safe to offer for saving. */
export function courseLanguageSpans(q: SpanQuestion): string[] {
  const explanation = q.explanation.normalize("NFC");
  const out: string[] = [];
  for (const raw of candidates(q)) {
    const text = raw.trim().normalize("NFC");
    if (text && !out.includes(text) && hitsFor(explanation, text).length > 0) out.push(text);
  }
  return out;
}

/** The explanation cut into plain pieces and course-language pieces, in order. */
export function splitExplanation(
  explanation: string,
  spans: string[],
): { text: string; course: boolean }[] {
  const text = explanation.normalize("NFC");
  const hits = spans.flatMap((s) => hitsFor(text, s)).sort((a, b) => a.start - b.start);
  const pieces: { text: string; course: boolean }[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    if (h.start > cursor) pieces.push({ text: text.slice(cursor, h.start), course: false });
    pieces.push({ text: text.slice(h.start, h.end), course: true });
    cursor = h.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), course: false });
  return pieces;
}
