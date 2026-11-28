import type { Course } from "@/data/course-meta";
import type { Level } from "@/data/levels";
import { HECTOR_TEMPLATES } from "@/data/rehearsal-hector-templates";
import { REHEARSAL_TEMPLATES } from "@/data/rehearsal-templates";
import type { RehearsalBrief } from "./rehearsal-brief";
import { fencedData } from "./rehearsal-fence";
import type { EventKind, Persona, RunMemory, Stage } from "./rehearsal-rules";

export type { RunMemory } from "./rehearsal-rules";

/** Fixed text, per course: begin with the brief's own opener, word for word. */
const OPENER_RULE: Record<Course, string> = {
  en: "Begin with the line named opener in the block, word for word, then continue in character.",
  fr: "Commence par la phrase nommée opener dans le bloc, mot pour mot, puis continue dans ton rôle.",
  es: "Empieza con la frase llamada opener en el bloque, palabra por palabra, y sigue después en tu papel.",
};

/**
 * The system prompt of one rehearsal stage, built on the server from a vetted template per course and stage
 * (src/data/rehearsal-templates.ts), the rehearsal's brief and the memory of earlier runs. The app never sends prompt
 * text: /api/chat takes `{rehearsal: {id, stage}}` and builds this itself.
 *
 * Layout: the template's role lines, the level, ONE fenced data block, then the template's behaviour, the opener rule,
 * the general-only rule (appointment, housing), the AI-honesty rule and the closing reminder. Everything outside the
 * block is fixed text chosen by (course, stage, event kind, level, whether there is memory); everything derived from
 * the learner (the brief, the memory) is inside the block as quoted values, so a brief that says "ignore previous
 * instructions" is only ever data. The server appends the verdict instruction and SAFETY_PREAMBLE after this.
 */
export function buildRehearsalPrompt(input: {
  course: Course;
  stage: Stage;
  level: Level;
  brief: RehearsalBrief;
  runs: RunMemory[];
  eventKind: EventKind;
  /** Alphonso (default) or Hector. Hector swaps the stage's role and behaviour for the tougher, longer-debrief ones. */
  persona?: Persona;
  /** Hard mode: only ever with Hector on the last stage; anything else ignores it, so a stray flag can never leak in. */
  hard?: boolean;
}): string {
  const t = REHEARSAL_TEMPLATES[input.course];
  const hector = input.persona === "hector" ? HECTOR_TEMPLATES[input.course] : null;
  const hardMode = hector !== null && input.hard === true && input.stage === "hard_moments";
  const { brief, stage } = input;

  const lastRun = [...input.runs].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)).at(-1);
  const lastCorrection = lastRun?.corrections[0];
  const handled = new Set(input.runs.flatMap((r) => r.wentWell));
  const pending = brief.hardMoments.filter((m) => !handled.has(m.label));
  const retry = pending[0];
  const hasMemory = Boolean(lastCorrection) || (input.runs.length > 0 && Boolean(retry));

  const fields: [string, string][] = [
    ["setting", brief.setting],
    ["counterpart_role", brief.persona.role],
    ["counterpart_tone", brief.persona.tone],
  ];
  if (stage === "warmup") {
    brief.keyPhrases.forEach((p, i) => fields.push([`key_phrase_${i + 1}`, p]));
  } else if (stage === "conversation") {
    brief.coreExchanges.forEach((e, i) => fields.push([`core_exchange_${i + 1}`, e]));
  } else {
    // The hard moments the learner has not yet handled well; all of them once every one has been.
    const chosen = pending.length > 0 ? pending : brief.hardMoments;
    chosen.forEach((m, i) => fields.push([`hard_moment_${i + 1}`, `${m.label}: ${m.prompt}`]));
  }
  // A quick-start brief has a fixed first line for the counterpart (never a model-written or learner-written one).
  const useOpener = stage === "conversation" && Boolean(brief.opener) && !hasMemory;
  if (useOpener) fields.push(["opener", brief.opener!]);
  if (input.runs.length > 0) {
    fields.push(["runs_so_far", String(input.runs.length)]);
    if (lastCorrection) fields.push(["last_correction", lastCorrection]);
    if (retry && input.runs.length > 0) fields.push(["retry_moment", retry.label]);
  }

  const parts = [
    (hector ?? t).stages[stage].role(t.event[input.eventKind]),
    t.level(input.level),
    fencedData(fields),
    t.dataNote,
    (hector ?? t).stages[stage].behaviour,
    ...(hardMode && hector ? [hector.hardMode] : []),
    hasMemory ? t.withMemory : t.firstRun,
    ...(useOpener ? [OPENER_RULE[input.course]] : []),
    ...(input.eventKind === "appointment" || input.eventKind === "housing" ? [t.generalOnly] : []),
    t.aiHonesty,
    t.closing,
  ];
  return parts.join("\n\n");
}
