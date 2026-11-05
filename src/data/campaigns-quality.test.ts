import { describe, expect, it } from "vitest";
import { CAMPAIGNS, campaignScenePrompt, campaignsFor } from "./campaigns";
import { languageScores } from "./content-language";

/**
 * Cheap, mechanical quality guards for every campaign: length bounds, the language of each
 * text, placeholder and brand bans, and "no dead end" structure. They do not replace a native
 * speaker (see the PR's "needs native-speaker check" list); they catch the slips a reviewer
 * should never have to find: a stray English sentence in a French line, an opener the learner
 * cannot answer, a scene that can never be completed.
 *
 * Campaigns are linear: scene N unlocks scene N+1 once the learner has sent `minTurns`
 * messages, so "every branch reachable" reduces to "every scene is reachable in order and
 * can be completed by a plausible number of turns".
 */
const COURSES = ["en", "fr", "es"] as const;
type Course = (typeof COURSES)[number];

const LIMITS = {
  title: [7, 48],
  persona: [8, 52],
  opener: [25, 190],
  blurb: [40, 160],
  premise: [300, 1100],
  systemPrompt: [300, 2200],
} as const;

/** The first five campaigns, which predate the opener-question and no-dash rules. */
const LEGACY_IDS = ["city-day", "first-week-job", "doctors-visit", "train-trip", "new-flat"];
const SCENE_OF_LEGACY = new Set(
  CAMPAIGNS.filter((c) => LEGACY_IDS.includes(c.id)).flatMap((c) => c.scenes.map((s) => s.id)),
);

/** Every field of every campaign that a learner or the model sees, in one course. */
function texts(course: Course, includeBlurb: boolean) {
  const out: { label: string; field: keyof typeof LIMITS; text: string }[] = [];
  for (const c of CAMPAIGNS) {
    out.push({ label: `${c.id}.title`, field: "title", text: c.title[course] });
    out.push({ label: `${c.id}.premise`, field: "premise", text: c.premise[course] });
    if (includeBlurb) out.push({ label: `${c.id}.blurb`, field: "blurb", text: c.blurb[course] });
    for (const s of c.scenes) {
      out.push({ label: `${s.id}.title`, field: "title", text: s.title[course] });
      out.push({ label: `${s.id}.persona`, field: "persona", text: s.persona[course] });
      out.push({ label: `${s.id}.opener`, field: "opener", text: s.opener[course] });
      out.push({
        label: `${s.id}.systemPrompt`,
        field: "systemPrompt",
        text: s.systemPrompt[course],
      });
    }
  }
  return out;
}

describe("campaign text length bounds", () => {
  for (const course of COURSES) {
    it(`${course}: every field is neither a stub nor a wall of text`, () => {
      for (const { label, field, text } of texts(course, true)) {
        const [min, max] = LIMITS[field];
        expect(text.length, `${label}.${course} (${text.length} chars)`).toBeGreaterThanOrEqual(
          min,
        );
        expect(text.length, `${label}.${course} (${text.length} chars)`).toBeLessThanOrEqual(max);
      }
    });
  }
});

describe("campaign text hygiene", () => {
  // Capitalised names only, so "apple tart" and "pastel de manzana" stay legal.
  const BRANDS =
    /\b(Google|Apple|Amazon|Netflix|Spotify|eBay|Zara|Decathlon|Carrefour|Leclerc|Auchan|Lidl|Aldi|Fnac|Darty|Renault|Peugeot|Nespresso|Mercadona|Oxxo|WhatsApp|PayPal|Mastercard|Facebook|Instagram|TikTok|Tesla|Nike|Adidas)\b/;
  const PLACEHOLDER =
    /lorem ipsum|\bTODO\b|\bTBD\b|\bFIXME\b|\bundefined\b|\bnull\b|\{\{|\}\}|\$\{|\bxxx\b/;

  for (const course of COURSES) {
    it(`${course}: no placeholder, brand, doubled space, stray whitespace or em dash in new text`, () => {
      for (const { label, text } of texts(course, true)) {
        expect(text, label).not.toMatch(PLACEHOLDER);
        expect(text, label).not.toMatch(BRANDS);
        expect(text, label).not.toMatch(/ {2}/);
        expect(text, label).toBe(text.trim());
        // The first five campaigns predate the no-dash style rule; every newer one follows it.
        if (
          !LEGACY_IDS.some((id) => label.startsWith(id) || SCENE_OF_LEGACY.has(label.split(".")[0]))
        )
          expect(text, label).not.toContain("—");
      }
    });
  }

  it("the hygiene check can fail: it sees a brand and a placeholder", () => {
    expect("Order from Amazon").toMatch(BRANDS);
    expect("pastel de manzana").not.toMatch(BRANDS);
    expect("TODO: write this").toMatch(PLACEHOLDER);
    expect("todo el día").not.toMatch(PLACEHOLDER);
  });
});

describe("campaign text is in the right language", () => {
  const FR_WORDS = /\b(le|la|les|une|des|est|vous|pour|avec|dans|et)\b/i;

  for (const course of ["fr", "es"] as const) {
    it(`${course}: no English words in titles, personas, openers, premises or prompts`, () => {
      // Blurbs are excluded on purpose: the list screen shows them in the app's UI language.
      for (const { label, text } of texts(course, false)) {
        // Every prompt is authored in the target language, so an English stopword is a slip.
        expect(languageScores(text).en, `${label}.${course}`).toBe(0);
      }
    });
  }

  it("fr has no Spanish-only characters; es has no French-only letters", () => {
    for (const { label, text } of texts("fr", false)) {
      expect(text, label).not.toMatch(/[ñ¿¡]/);
    }
    for (const { label, text } of texts("es", false)) {
      expect(text, label).not.toMatch(/[àèùâêîôûëïçœ]/);
    }
  });

  it("es has no French function words; en has no French or Spanish accents or inverted marks in titles and openers", () => {
    for (const { label, text } of texts("es", false)) {
      expect(text, label).not.toMatch(/\b(vous|nous|avec|pour|dans|c'est|est-ce)\b/i);
    }
    for (const c of CAMPAIGNS) {
      const shown = [c.title.en, c.blurb.en, ...c.scenes.flatMap((s) => [s.title.en, s.opener.en])];
      for (const t of shown) {
        expect(t, `${c.id} en`).not.toMatch(/[¿¡«»]/);
        expect(t, `${c.id} en`).not.toMatch(FR_WORDS);
      }
    }
  });

  it("the language check can fail: it sees English in a French line and a Spanish mark", () => {
    expect(languageScores("Bonjour, what would you like ?").en).toBeGreaterThan(0);
    expect(languageScores("Bonjour, que voulez-vous ?").en).toBe(0);
    expect("¿Qué quiere?").toMatch(/[ñ¿¡]/);
  });

  it("fr and es blurbs are not copies of the English one (the course city is localised)", () => {
    for (const c of CAMPAIGNS) {
      expect(c.blurb.fr, c.id).not.toBe(c.blurb.en);
      expect(c.blurb.es, c.id).not.toBe(c.blurb.en);
    }
  });
});

describe("campaign structure has no dead ends", () => {
  // The first five campaigns predate this rule: a few of their personas wait to be asked
  // (the neighbour, the hotel receptionist) and open with a statement on purpose.
  it("every opener of a newer campaign hands the turn to the learner (asks something) in every course", () => {
    for (const c of CAMPAIGNS.filter((camp) => !LEGACY_IDS.includes(camp.id))) {
      for (const s of c.scenes) {
        for (const course of COURSES) {
          expect(s.opener[course], `${s.id}.opener.${course}`).toContain("?");
        }
      }
    }
  });

  it("every scene can be completed: minTurns is 2 to 5 and the same in every course", () => {
    for (const c of CAMPAIGNS) {
      for (const s of c.scenes) {
        expect(s.minTurns, s.id).toBeGreaterThanOrEqual(2);
        expect(s.minTurns, s.id).toBeLessThanOrEqual(5);
      }
      for (const course of COURSES) {
        const local = campaignsFor(course).find((x) => x.id === c.id)!;
        expect(
          local.scenes.map((s) => [s.id, s.minTurns]),
          `${c.id}.${course}`,
        ).toEqual(c.scenes.map((s) => [s.id, s.minTurns]));
      }
    }
  });

  it("every scene is reachable in order and its prompt is the premise plus its own brief", () => {
    for (const c of CAMPAIGNS) {
      for (const [i, s] of c.scenes.entries()) {
        for (const course of COURSES) {
          const prompt = campaignScenePrompt(c.id, s.id, course);
          expect(
            prompt.startsWith(c.premise[course]),
            `${s.id}.${course} starts with premise`,
          ).toBe(true);
          expect(prompt.endsWith(s.systemPrompt[course]), `${s.id}.${course} ends with brief`).toBe(
            true,
          );
          // Scene i+1 exists only after scene i in every course: the order is the unlock chain.
          expect(campaignsFor(course).find((x) => x.id === c.id)!.scenes[i].id).toBe(s.id);
        }
      }
    }
  });

  // A persona may recur on purpose (Leo plans the picnic and shares it), so only the opener
  // and the scene title must differ between the scenes of one campaign.
  it("no campaign repeats an opener or a scene title", () => {
    for (const c of CAMPAIGNS) {
      const openers = c.scenes.map((s) => s.opener.en);
      expect(new Set(openers).size, c.id).toBe(openers.length);
      const titles = c.scenes.map((s) => s.title.en);
      expect(new Set(titles).size, c.id).toBe(titles.length);
    }
  });

  it("a scene prompt does not name its own persona as someone else (the persona first name appears in the brief)", () => {
    for (const c of CAMPAIGNS) {
      for (const s of c.scenes) {
        // en: "Name, the role" or "Name, at/serving ...": the first name is in the brief.
        const first = s.persona.en.split(",")[0].split(" ")[0];
        expect(s.systemPrompt.en, `${s.id} en persona`).toContain(first);
      }
    }
  });
});

describe("form-filling scenes ask for a first name only (ai-safety rule)", () => {
  // The scenes where a persona writes the learner's details down: the lost property form and
  // the support chat. Each must forbid the personal details and allow only a first name.
  const FORM_SCENES = ["lost-property-office", "refund-parcel"];
  const RULES = {
    en: {
      never: /never ask for a surname, a phone number, an address/i,
      only: /ask only for a first name/i,
    },
    fr: {
      never: /ne demande jamais un nom de famille, un numéro de téléphone, une adresse/i,
      only: /demande seulement un prénom/i,
    },
    es: {
      never: /nunca pidas apellido, número de teléfono, dirección/i,
      only: /pide solo (el|un) nombre de pila/i,
    },
  } as const;

  for (const id of FORM_SCENES) {
    it(`${id} forbids surname, phone and address and asks only for a first name, in every course`, () => {
      const scene = CAMPAIGNS.flatMap((c) => c.scenes).find((s) => s.id === id);
      expect(scene, id).toBeDefined();
      for (const course of COURSES) {
        expect(scene!.systemPrompt[course], `${id}.${course}`).toMatch(RULES[course].never);
        expect(scene!.systemPrompt[course], `${id}.${course}`).toMatch(RULES[course].only);
      }
    });
  }
});
