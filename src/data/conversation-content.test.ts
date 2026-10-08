import { describe, expect, it } from "vitest";
import type { Course } from "./courses";
import {
  ALL_SYSTEM_PROMPTS,
  CONTENT_COURSES,
  SCENARIOS,
  getScenario,
  localizeScenario,
  scenarioPrompt,
  scenariosFor,
} from "./scenarios";
import {
  CAMPAIGNS,
  campaignPrompt,
  campaignScenePrompt,
  campaignsFor,
  localizeCampaign,
} from "./campaigns";
import { detectContentLanguage } from "./content-language";

/**
 * parity guard: every scenario and every campaign scene exists in every
 * course, each variant is non-empty and in the right language, and no two
 * courses share a variant. Language is checked with detectContentLanguage,
 * which is coarse on purpose: it exists to catch a variant pasted under the
 * wrong key, not to grade the writing (that is the native review).
 */
const COURSES: Course[] = ["en", "fr", "es"];

/** The name inside "<name>, <role>": its last word ("Dra. Paredes" gives "Paredes"). */
function personaName(persona: string): string {
  return persona.split(",")[0].trim().split(" ").pop() ?? "";
}

describe("CONTENT_COURSES", () => {
  it("is exactly the three courses", () => {
    expect([...CONTENT_COURSES]).toEqual(COURSES);
  });
});

describe("scenario parity", () => {
  it("authors every text field of every scenario in every course, non-empty", () => {
    for (const s of SCENARIOS) {
      for (const field of ["title", "blurb", "persona", "systemPrompt", "opener"] as const) {
        expect(Object.keys(s[field]).sort(), `${s.id}.${field}`).toEqual(["en", "es", "fr"]);
        for (const c of COURSES) {
          expect(s[field][c].trim().length, `${s.id}.${field}.${c}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("writes each course's prompt and opener in that course's language", () => {
    for (const s of SCENARIOS) {
      for (const c of COURSES) {
        expect(detectContentLanguage(s.systemPrompt[c]), `${s.id}.systemPrompt.${c}`).toBe(c);
        expect(detectContentLanguage(s.opener[c]), `${s.id}.opener.${c}`).toBe(c);
      }
    }
  });

  it("never reuses one course's text for another course", () => {
    for (const s of SCENARIOS) {
      for (const field of ["title", "persona", "systemPrompt", "opener"] as const) {
        expect(new Set(COURSES.map((c) => s[field][c])).size, `${s.id}.${field}`).toBe(3);
      }
    }
  });

  it("names each course's persona inside that course's system prompt", () => {
    for (const s of SCENARIOS) {
      for (const c of COURSES) {
        const name = personaName(s.persona[c]);
        expect(name.length, `${s.id}.persona.${c}`).toBeGreaterThan(1);
        expect(s.systemPrompt[c], `${s.id}.systemPrompt.${c}`).toContain(name);
      }
    }
  });

  it("tells the fr and es personas to answer in the target language", () => {
    for (const s of SCENARIOS) {
      expect(s.systemPrompt.fr, s.id).toContain("Réponds toujours en français");
      expect(s.systemPrompt.es, s.id).toContain("Responde siempre en español latinoamericano");
    }
  });

  it("keeps Spanish in the course's Latin American variety", () => {
    for (const s of SCENARIOS) {
      const text = `${s.systemPrompt.es.replace("nunca uses «vosotros» ni «vos»", "")} ${s.opener.es}`;
      expect(text, s.id).not.toMatch(/\bvosotr|\bvuestr|\bpiso\b|\bcoger\b|\bordenador\b/i);
    }
  });

  it("puts no literal double hyphen in learner-facing text", () => {
    for (const s of SCENARIOS) {
      for (const c of COURSES) {
        for (const field of ["title", "blurb", "persona", "opener"] as const) {
          expect(s[field][c], `${s.id}.${field}.${c}`).not.toContain("--");
        }
      }
    }
  });

  it("carries no safety text: the server appends the safety preamble", () => {
    for (const s of SCENARIOS) {
      for (const c of COURSES) {
        expect(s.systemPrompt[c], `${s.id}.${c}`).not.toMatch(/safety|sécurité|seguridad/i);
      }
    }
  });
});

describe("scenario accessors", () => {
  it("scenarioPrompt returns the course variant and throws on an unknown id", () => {
    for (const s of SCENARIOS) {
      for (const c of COURSES) expect(scenarioPrompt(s.id, c)).toBe(s.systemPrompt[c]);
    }
    expect(() => scenarioPrompt("nope", "fr")).toThrow("Unknown scenario id: nope");
  });

  it("localizeScenario flattens one course in the legacy key order", () => {
    const flat = localizeScenario(getScenario("coffee")!, "fr");
    expect(Object.keys(flat)).toEqual([
      "id",
      "title",
      "emoji",
      "blurb",
      "level",
      "systemPrompt",
      "opener",
    ]);
    expect(flat.title).toBe("Au café");
    expect(flat.opener).toBe(getScenario("coffee")!.opener.fr);
  });

  it("scenariosFor keeps catalog order and ids identical across courses", () => {
    const ids = SCENARIOS.map((s) => s.id);
    for (const c of COURSES) expect(scenariosFor(c).map((s) => s.id)).toEqual(ids);
  });
});

describe("campaign parity", () => {
  it("authors every campaign and scene field in every course, non-empty", () => {
    for (const camp of CAMPAIGNS) {
      for (const field of ["title", "blurb", "premise"] as const) {
        for (const c of COURSES) {
          expect(camp[field][c].trim().length, `${camp.id}.${field}.${c}`).toBeGreaterThan(0);
        }
      }
      for (const scene of camp.scenes) {
        for (const field of ["title", "persona", "systemPrompt", "opener"] as const) {
          for (const c of COURSES) {
            const label = `${camp.id}/${scene.id}.${field}.${c}`;
            expect(scene[field][c].trim().length, label).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("writes each course's premise, scene prompts and openers in that language", () => {
    for (const camp of CAMPAIGNS) {
      for (const c of COURSES) {
        expect(detectContentLanguage(camp.premise[c]), `${camp.id}.premise.${c}`).toBe(c);
        for (const scene of camp.scenes) {
          const label = `${camp.id}/${scene.id}`;
          expect(detectContentLanguage(scene.systemPrompt[c]), `${label}.systemPrompt.${c}`).toBe(
            c,
          );
          expect(detectContentLanguage(scene.opener[c]), `${label}.opener.${c}`).toBe(c);
          expect(scene.systemPrompt[c]).toContain(personaName(scene.persona[c]));
        }
      }
    }
  });

  it("composes campaignScenePrompt exactly like the legacy inline template", () => {
    for (const camp of CAMPAIGNS) {
      for (const scene of camp.scenes) {
        for (const c of COURSES) {
          expect(campaignScenePrompt(camp.id, scene.id, c)).toBe(
            `${camp.premise[c]}\n\n${scene.systemPrompt[c]}`,
          );
        }
      }
    }
    expect(campaignPrompt("P", "S")).toBe("P\n\nS");
    expect(() => campaignScenePrompt("nope", "x", "en")).toThrow("Unknown campaign id: nope");
    expect(() => campaignScenePrompt("city-day", "nope", "en")).toThrow(
      "Unknown scene id: city-day/nope",
    );
  });

  it("localizeCampaign keeps scene ids and minTurns identical across courses", () => {
    for (const camp of CAMPAIGNS) {
      const en = localizeCampaign(camp, "en");
      for (const c of COURSES) {
        const flat = localizeCampaign(camp, c);
        expect(flat.scenes.map((s) => [s.id, s.minTurns])).toEqual(
          en.scenes.map((s) => [s.id, s.minTurns]),
        );
      }
    }
    expect(campaignsFor("es").map((c) => c.id)).toEqual(CAMPAIGNS.map((c) => c.id));
  });
});

describe("ALL_SYSTEM_PROMPTS", () => {
  it("holds every scenario and campaign-scene prompt of every course, and nothing else", () => {
    const expected = new Set<string>();
    for (const s of SCENARIOS) for (const c of COURSES) expected.add(s.systemPrompt[c]);
    for (const camp of CAMPAIGNS) {
      for (const scene of camp.scenes) {
        for (const c of COURSES) expected.add(campaignScenePrompt(camp.id, scene.id, c));
      }
    }
    expect(ALL_SYSTEM_PROMPTS.size).toBe(expected.size);
    for (const p of expected) expect(ALL_SYSTEM_PROMPTS.has(p)).toBe(true);
    // 12 scenarios + 3 campaign scenes = 15 prompts, times 3 courses, all distinct.
    expect(ALL_SYSTEM_PROMPTS.size).toBe(45);
  });
});
