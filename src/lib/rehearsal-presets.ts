import type { Course } from "@/data/course-meta";
import { PRESET_COURSES, PRESET_IDS, PRESET_SHARED, type PresetId } from "@/data/rehearsal-presets";
import type { RehearsalBrief } from "./rehearsal-brief";
import { STAGES, type EventKind, type Intake, type Stage } from "./rehearsal-rules";

export { PRESET_IDS, isPresetId, type PresetId } from "@/data/rehearsal-presets";

/**
 * What the picker and the preview show for one quick-start (GET /api/rehearsal-presets). `title`, `blurb`, `goal` and
 * `meaning` are in the app's own language (English today); `text` is in the course language. The apps hard-code none of
 * it: the server owns the content.
 */
export type PresetSummary = {
  id: PresetId;
  eventKind: EventKind;
  title: string;
  blurb: string;
  counterpart: string;
  stages: { key: Stage; goal: string }[];
  keyPhrases: { text: string; meaning: string }[];
};

/** The eight quick-starts for a course, in the order the picker shows them. */
export function presetSummaries(course: Course): PresetSummary[] {
  return PRESET_IDS.map((id) => {
    const s = PRESET_SHARED[id];
    return {
      id,
      eventKind: s.eventKind,
      title: s.label,
      blurb: s.blurb,
      counterpart: s.counterpart,
      stages: STAGES.map((key) => ({ key, goal: s.stageGoals[key] })),
      keyPhrases: PRESET_COURSES[course][id].phrases.map(([text, meaning]) => ({ text, meaning })),
    };
  });
}

/** The rehearsal row's own fields for a preset (kind and counterpart are fixed text, so no filter is needed). */
export function presetIntake(id: PresetId, course: Course, eventDate: string | null): Intake {
  const s = PRESET_SHARED[id];
  return { course, eventKind: s.eventKind, eventDate, counterpart: s.counterpart, worries: null };
}

/** The hand-written brief for a preset in a course. Pure and synchronous: this is what replaces the model call. */
export function presetBrief(id: PresetId, course: Course): RehearsalBrief {
  const c = PRESET_COURSES[course][id];
  return {
    setting: c.setting,
    persona: { role: c.role, tone: c.tone },
    keyPhrases: c.phrases.map(([phrase]) => phrase),
    coreExchanges: [...c.exchanges],
    hardMoments: c.hard.map(([label, prompt], i) => ({ id: `h${i + 1}`, label, prompt })),
    preset: id,
    opener: c.opener,
    keyPhraseMeanings: c.phrases.map(([, meaning]) => meaning),
  };
}

/** The lines of a preset that are spoken aloud, for the shared spoken-line cache (tts-cache.ts): the opener and phrases. */
export function presetSpokenLines(): string[] {
  const out: string[] = [];
  for (const course of Object.keys(PRESET_COURSES) as Course[]) {
    for (const id of PRESET_IDS) {
      const c = PRESET_COURSES[course][id];
      out.push(c.opener, ...c.phrases.map(([phrase]) => phrase));
    }
  }
  return out;
}
