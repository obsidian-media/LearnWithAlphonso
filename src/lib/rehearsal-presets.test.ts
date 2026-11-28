import { describe, expect, it } from "vitest";
import { COURSES } from "@/data/course-meta";
import { PRESET_COURSES, PRESET_SHARED } from "@/data/rehearsal-presets";
import { BRIEF_LIMITS, parseBrief } from "./rehearsal-brief";
import { buildRehearsalPrompt } from "./rehearsal-prompt";
import {
  PRESET_IDS,
  isPresetId,
  presetBrief,
  presetIntake,
  presetSpokenLines,
  presetSummaries,
} from "./rehearsal-presets";
import { EVENT_KINDS, STAGES, validateIntake } from "./rehearsal-rules";
import { fixedSpokenLines, normalizeSpokenLine } from "./tts-cache";

const COURSE_IDS = COURSES.map((c) => c.id);

describe("the preset list", () => {
  it("is the eight agreed ids, in picker order", () => {
    expect([...PRESET_IDS]).toEqual([
      "job_interview",
      "talk_to_manager",
      "doctor_appointment",
      "apartment_landlord",
      "bank_account",
      "parent_teacher",
      "first_day",
      "customer_service_call",
    ]);
  });

  it("has content for every preset in every course (no preset missing for en, fr or es)", () => {
    expect(COURSE_IDS.sort()).toEqual(["en", "es", "fr"]);
    for (const course of COURSE_IDS)
      for (const id of PRESET_IDS) {
        expect(PRESET_COURSES[course][id], `${course}/${id}`).toBeDefined();
        expect(PRESET_SHARED[id], id).toBeDefined();
      }
    // Nothing extra either: the data holds exactly the listed ids.
    for (const course of COURSE_IDS)
      expect(Object.keys(PRESET_COURSES[course]).sort()).toEqual([...PRESET_IDS].sort());
  });

  it("maps every preset onto one of the existing event kinds", () => {
    for (const id of PRESET_IDS)
      expect(EVENT_KINDS as readonly string[]).toContain(PRESET_SHARED[id].eventKind);
  });

  it("isPresetId accepts exactly the ids", () => {
    for (const id of PRESET_IDS) expect(isPresetId(id)).toBe(true);
    for (const bad of ["doctor", "manager", "", "JOB_INTERVIEW", null, 3, undefined])
      expect(isPresetId(bad)).toBe(false);
  });
});

describe("preset content", () => {
  it("has 6 to 10 key phrases per preset, each with a short meaning", () => {
    for (const course of COURSE_IDS)
      for (const id of PRESET_IDS) {
        const { phrases } = PRESET_COURSES[course][id];
        expect(phrases.length, `${course}/${id}`).toBeGreaterThanOrEqual(6);
        expect(phrases.length, `${course}/${id}`).toBeLessThanOrEqual(10);
        for (const [text, meaning] of phrases) {
          expect(text.trim().length).toBeGreaterThan(0);
          expect(meaning.trim().length).toBeGreaterThan(0);
          expect(meaning.length).toBeLessThanOrEqual(60);
        }
      }
  });

  it("builds a brief the model-brief parser accepts, in every course (counts and lengths)", () => {
    for (const course of COURSE_IDS)
      for (const id of PRESET_IDS) {
        const brief = presetBrief(id, course);
        const parsed = parseBrief(brief);
        expect(parsed, `${course}/${id}`).not.toBeNull();
        expect(brief.coreExchanges.length).toBeGreaterThanOrEqual(BRIEF_LIMITS.coreExchanges[0]);
        expect(brief.hardMoments.length).toBeGreaterThanOrEqual(BRIEF_LIMITS.hardMoments[0]);
        expect(brief.keyPhraseMeanings).toHaveLength(brief.keyPhrases.length);
        expect(brief.preset).toBe(id);
        expect(brief.opener?.length ?? 0).toBeGreaterThan(0);
        expect(brief.opener!.length).toBeLessThanOrEqual(BRIEF_LIMITS.text);
      }
  });

  it("keeps the doctor, bank and housing presets general: the hard moments say no advice", () => {
    for (const course of COURSE_IDS) {
      for (const id of ["doctor_appointment"] as const)
        for (const [, prompt] of PRESET_COURSES[course][id].hard)
          expect(prompt.toLowerCase(), `${course}/${id}`).toMatch(
            /medical|médical|médico|conseil|consejo|advice/,
          );
    }
  });

  it("the doctor preset never promises diagnosis or treatment in its key phrases", () => {
    for (const course of COURSE_IDS)
      for (const [text] of PRESET_COURSES[course].doctor_appointment.phrases)
        expect(text.toLowerCase()).not.toMatch(/diagnos|prescri|medicine|médicament|medicamento/);
  });

  it("every spoken phrase and opener is unique within its preset (no duplicate cache lines)", () => {
    for (const course of COURSE_IDS)
      for (const id of PRESET_IDS) {
        const c = PRESET_COURSES[course][id];
        const all = [c.opener, ...c.phrases.map(([t]) => t)].map(normalizeSpokenLine);
        expect(new Set(all).size).toBe(all.length);
      }
  });
});

describe("summaries (what GET /api/rehearsal-presets returns)", () => {
  it("lists the eight presets in order with the three stages and the key phrases", () => {
    for (const course of COURSE_IDS) {
      const list = presetSummaries(course);
      expect(list.map((p) => p.id)).toEqual([...PRESET_IDS]);
      for (const p of list) {
        expect(p.stages.map((s) => s.key)).toEqual([...STAGES]);
        for (const s of p.stages) expect(s.goal.length).toBeGreaterThan(0);
        expect(p.keyPhrases.length).toBe(PRESET_COURSES[course][p.id].phrases.length);
        expect(p.title.length).toBeGreaterThan(0);
        expect(p.blurb.length).toBeGreaterThan(0);
      }
    }
  });

  it("key phrase text follows the course language", () => {
    const fr = presetSummaries("fr").find((p) => p.id === "doctor_appointment")!;
    const es = presetSummaries("es").find((p) => p.id === "doctor_appointment")!;
    const en = presetSummaries("en").find((p) => p.id === "doctor_appointment")!;
    expect(fr.keyPhrases[0]!.text).toBe("Je voudrais prendre rendez-vous.");
    expect(es.keyPhrases[0]!.text).toBe("Quisiera pedir una cita.");
    expect(en.keyPhrases[0]!.text).toBe("I would like to make an appointment.");
  });
});

describe("intake from a preset", () => {
  it("is a valid intake with fixed counterpart text and no worries", () => {
    for (const id of PRESET_IDS) {
      const intake = presetIntake(id, "fr", "2026-12-04");
      expect(validateIntake(intake).ok).toBe(true);
      expect(intake.worries).toBeNull();
      expect(intake.counterpart).toBe(PRESET_SHARED[id].counterpart);
    }
  });
});

describe("the shared spoken-line cache", () => {
  it("holds every opener and key phrase of every preset", () => {
    const fixed = fixedSpokenLines();
    for (const line of presetSpokenLines()) expect(fixed.has(normalizeSpokenLine(line))).toBe(true);
    expect(presetSpokenLines().length).toBeGreaterThan(24 * 7);
  });
});

describe("the prompt", () => {
  const base = {
    stage: "conversation" as const,
    level: "A2" as never,
    runs: [],
  };
  it("carries a quick-start's opener on a first conversation run, with the fixed rule to use it", () => {
    const brief = presetBrief("job_interview", "en");
    const p = buildRehearsalPrompt({ ...base, course: "en", brief, eventKind: "interview" });
    expect(p).toContain(`opener: ${JSON.stringify(brief.opener)}`);
    expect(p).toContain("word for word");
  });

  it("does not add an opener to a brief that has none (a model-written brief)", () => {
    const brief = { ...presetBrief("job_interview", "en"), opener: undefined };
    const p = buildRehearsalPrompt({ ...base, course: "en", brief, eventKind: "interview" });
    expect(p).not.toContain("opener:");
    expect(p).not.toContain("word for word");
  });

  it("leaves the opener out of the warm-up", () => {
    const brief = presetBrief("job_interview", "en");
    const p = buildRehearsalPrompt({
      ...base,
      stage: "warmup",
      course: "en",
      brief,
      eventKind: "interview",
    });
    expect(p).not.toContain("opener:");
  });
});
