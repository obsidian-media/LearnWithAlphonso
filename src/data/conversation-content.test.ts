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

describe("campaign prompt rules", () => {
  /** Every campaign text that reaches the model: the premise and each scene prompt. */
  const campaignTexts = (c: Course) =>
    CAMPAIGNS.flatMap((camp) => [
      { label: `${camp.id}.premise`, text: camp.premise[c] },
      ...camp.scenes.map((sc) => ({ label: `${camp.id}/${sc.id}`, text: sc.systemPrompt[c] })),
    ]);

  it("keeps campaign Spanish in the Latin American variety", () => {
    for (const { label, text } of campaignTexts("es")) {
      const cleaned = text.replace("nunca uses «vosotros» ni «vos»", "");
      expect(cleaned, label).not.toMatch(/\bvosotr|\bvuestr|\bpiso\b|\bcoger\b|\bordenador\b/i);
    }
  });

  it("tells every campaign scene persona to answer in the target language", () => {
    for (const camp of CAMPAIGNS) {
      for (const sc of camp.scenes) {
        expect(sc.systemPrompt.fr, sc.id).toContain("Réponds toujours en français");
        expect(sc.systemPrompt.es, sc.id).toContain("Responde siempre en español latinoamericano");
      }
    }
  });

  it("carries no safety text in campaign premises or scene prompts", () => {
    for (const c of COURSES) {
      for (const { label, text } of campaignTexts(c)) {
        expect(text, `${label}.${c}`).not.toMatch(/safety|sécurité|seguridad/i);
      }
    }
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

describe("French and Spanish personas address the learner without assuming a gender", () => {
  const FR_RULE = "Ne présume jamais le genre de l'apprenant";
  const ES_RULE = "No supongas el género del estudiante";
  /** Every line a persona speaks that we wrote: scenario and campaign-scene openers. */
  const openers = (c: Course) => [
    ...SCENARIOS.map((s) => ({ label: `${s.id}.opener`, text: s.opener[c] })),
    ...CAMPAIGNS.flatMap((camp) =>
      camp.scenes.map((sc) => ({ label: `${camp.id}/${sc.id}.opener`, text: sc.opener[c] })),
    ),
  ];
  /** Every prompt text that reaches the model for a course. */
  const prompts = (c: Course) => [
    ...SCENARIOS.map((s) => ({ label: s.id, text: s.systemPrompt[c] })),
    ...CAMPAIGNS.flatMap((camp) => [
      { label: `${camp.id}.premise`, text: camp.premise[c] },
      ...camp.scenes.map((sc) => ({ label: `${camp.id}/${sc.id}`, text: sc.systemPrompt[c] })),
    ]),
  ];

  it("tells every persona, in its own language, not to assume the learner's gender", () => {
    for (const s of SCENARIOS) {
      expect(s.systemPrompt.fr, s.id).toContain(FR_RULE);
      expect(s.systemPrompt.es, s.id).toContain(ES_RULE);
    }
    for (const camp of CAMPAIGNS) {
      for (const sc of camp.scenes) {
        expect(sc.systemPrompt.fr, sc.id).toContain(FR_RULE);
        expect(sc.systemPrompt.es, sc.id).toContain(ES_RULE);
      }
    }
  });

  it("never opens with a form that marks the learner's gender", () => {
    for (const { label, text } of openers("es")) {
      expect(text, label).not.toMatch(
        /(?<!la )\bbienvenid[oa]s?\b|\b(listo|lista|señor|señora)\b/i,
      );
    }
    for (const { label, text } of openers("fr")) {
      expect(text, label).not.toMatch(/\b(ravi|ravie|content|contente|monsieur|madame)\b/i);
    }
  });

  it("does not call the learner he or him in the instructions", () => {
    for (const { label, text } of prompts("fr")) {
      // Madame Girard and the like are the persona's own name, not a form of address to the learner.
      expect(text.replace(/Madame Girard/g, ""), label).not.toMatch(/(?<!-)\b(qu'il|il)\b/i);
    }
    for (const { label, text } of prompts("es")) {
      expect(text, label).not.toMatch(/\bayúdalo\b|\bperdido\b/i);
    }
  });
});
