import { describe, expect, it } from "vitest";
import { CAMPAIGNS, getCampaign } from "./campaigns";
import { NO_MEDICAL } from "./campaigns-more";

describe("campaigns data", () => {
  it("ships at least one campaign with 2+ scenes (proof of the architecture)", () => {
    expect(CAMPAIGNS.length).toBeGreaterThanOrEqual(1);
    for (const c of CAMPAIGNS) {
      expect(c.scenes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every scene a positive minTurns gate", () => {
    for (const c of CAMPAIGNS) {
      for (const s of c.scenes) {
        expect(s.minTurns).toBeGreaterThan(0);
      }
    }
  });

  it("getCampaign finds a known campaign by id and returns undefined for an unknown one", () => {
    expect(getCampaign("city-day")?.title.en).toBe("A day in a new city");
    expect(getCampaign("city-day")?.title.fr).toBe("Une journée à Lyon");
    expect(getCampaign("city-day")?.title.es).toBe("Un día en la Ciudad de México");
    expect(getCampaign("does-not-exist")).toBeUndefined();
  });

  it("has unique scene ids within each campaign", () => {
    for (const c of CAMPAIGNS) {
      const ids = c.scenes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("story campaigns", () => {
  const COURSES = ["en", "fr", "es"] as const;
  const EXPECTED: Record<string, string[]> = {
    "city-day": ["coffee-stop", "directions", "small-talk"],
    "first-week-job": ["job-meet-team", "job-find-way", "job-lunch-order", "job-coffee-chat"],
    "doctors-visit": ["doctor-book-phone", "doctor-symptoms", "doctor-pharmacy"],
    "train-trip": ["train-buy-ticket", "train-delay-help", "train-hotel-checkin"],
    "new-flat": ["flat-viewing", "flat-broken-heater", "flat-neighbour"],
    "market-day": ["market-plan-picnic", "market-buy-food", "market-picnic"],
    "dinner-guest": ["dinner-arrive", "dinner-table", "dinner-goodbye"],
    "lost-bag": ["lost-ask-driver", "lost-property-office", "lost-tell-friend"],
    "refund-return": ["refund-shop", "refund-parcel", "refund-opinion"],
  };

  it("ships exactly these campaigns with these scene ids, in this order (ids are stable)", () => {
    expect(Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c.scenes.map((s) => s.id)]))).toEqual(
      EXPECTED,
    );
  });

  it("gives every campaign 3 or 4 scenes", () => {
    for (const c of CAMPAIGNS) {
      expect(c.scenes.length, c.id).toBeGreaterThanOrEqual(3);
      expect(c.scenes.length, c.id).toBeLessThanOrEqual(4);
    }
  });

  it("keeps campaign ids and scene ids unique across the whole catalogue", () => {
    const campaignIds = CAMPAIGNS.map((c) => c.id);
    expect(new Set(campaignIds).size).toBe(campaignIds.length);
    const sceneIds = CAMPAIGNS.flatMap((c) => c.scenes.map((s) => s.id));
    expect(new Set(sceneIds).size).toBe(sceneIds.length);
  });

  it("gives every scene a finishable goal in every course", () => {
    const marker = {
      en: "goal in this scene:",
      fr: "L'objectif de l'apprenant dans cette scène :",
      es: "El objetivo del estudiante en esta escena:",
    } as const;
    for (const c of CAMPAIGNS.filter((camp) => camp.id !== "city-day")) {
      for (const s of c.scenes) {
        for (const course of COURSES) {
          const prompt = s.systemPrompt[course];
          const at = prompt.indexOf(marker[course]);
          expect(at, `${s.id}.${course} states a goal`).toBeGreaterThan(-1);
          const goal = prompt.slice(at + marker[course].length).split(/[.]\s/)[0];
          expect(goal.trim().length, `${s.id}.${course} goal is not empty`).toBeGreaterThan(20);
        }
      }
    }
  });

  it("pins the whole practice-only guard in every clinic scene: no advice, kind decline, emergency exit", () => {
    const doctors = getCampaign("doctors-visit")!;
    // Each clause on its own, so removing any one of them turns this red.
    const clauses = {
      en: [
        "never diagnose, never name a medicine or a dose, and never say how to treat anything.",
        "kindly say that the doctor or the pharmacist will go through it with them",
        "chest pain, trouble breathing or thoughts of harming themselves, step out of character",
        "contact local emergency services or a trusted adult right now",
      ],
      fr: [
        "ne pose jamais de diagnostic, ne nomme aucun médicament ni aucune dose",
        "que le médecin ou le pharmacien l'expliquera",
        "une douleur à la poitrine, une difficulté à respirer ou des idées de se faire du mal, sors brièvement de ton personnage",
        "contacter tout de suite les secours de son pays",
      ],
      es: [
        "nunca des un diagnóstico, nunca nombres un medicamento ni una dosis",
        "que la médica o el farmacéutico lo explicará",
        "dolor en el pecho, dificultad para respirar o ideas de hacerse daño, sal brevemente de tu personaje",
        "servicios de emergencia de su país",
      ],
    } as const;
    for (const s of doctors.scenes) {
      for (const course of COURSES) {
        expect(s.systemPrompt[course], `${s.id}.${course} has the whole guard`).toContain(
          NO_MEDICAL[course],
        );
        for (const clause of clauses[course]) {
          expect(NO_MEDICAL[course], `${course} guard clause`).toContain(clause);
          expect(s.systemPrompt[course], `${s.id}.${course}: ${clause}`).toContain(clause);
        }
      }
    }
  });

  it("the guard check can fail: a prompt missing the emergency clause is caught", () => {
    const cut = NO_MEDICAL.en.replace(/ If the learner describes chest pain.*$/, "");
    expect(`You are Maya. ${cut}`).not.toContain(NO_MEDICAL.en);
  });

  it("never asks the booking caller for a surname, phone number or address (ai-safety rule)", () => {
    const book = getCampaign("doctors-visit")!.scenes[0];
    expect(book.systemPrompt.en).toContain("Never ask for a surname, a phone number, an address");
    expect(book.systemPrompt.fr).toContain("Ne demande jamais un nom de famille");
    expect(book.systemPrompt.es).toContain("Nunca pidas apellido, número de teléfono");
    for (const course of COURSES) {
      expect(book.systemPrompt[course]).toMatch(/first name|prénom|nombre de pila/);
    }
  });

  it("keeps the doctor's visit free of drug names and doses in learner-facing lines", () => {
    const doctors = getCampaign("doctors-visit")!;
    // No dose or strength anywhere in the learner-facing lines ("500 mg", "2 tablets").
    for (const s of doctors.scenes) {
      for (const course of COURSES) {
        expect(s.opener[course]).not.toMatch(/\d+\s?(mg|ml|comprim|tablet|pastilla)/i);
      }
    }
  });

  it("names no real brand or company", () => {
    // Brands the app's neighbours (rail, hotels, drugstores, chains) would naturally reach for.
    const banned =
      /\b(sncf|tgv|renfe|amtrak|ouigo|eurostar|starbucks|mcdonald|ikea|airbnb|booking\.com|hilton|marriott|ibis|walmart|cvs|walgreens|uber)\b/i;
    for (const c of CAMPAIGNS) {
      for (const course of COURSES) {
        expect(c.premise[course], `${c.id}.premise.${course}`).not.toMatch(banned);
        for (const s of c.scenes) {
          for (const f of ["title", "persona", "systemPrompt", "opener"] as const) {
            expect(s[f][course], `${s.id}.${f}.${course}`).not.toMatch(banned);
          }
        }
      }
    }
  });
});
