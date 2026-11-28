import { describe, expect, it } from "vitest";
import type { Course } from "@/data/course-meta";
import {
  asksForRepetition,
  chooseRehearsalPace,
  paceLine,
  withRehearsalPace,
  type RehearsalPace,
} from "./rehearsal-pace";

const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

// English-course replies. "Full" = 4+ words, no English fallback (English course: never english).
const FULL_EN = "I would like to book a table";
const SHORT_EN = "Yes please";
// French course.
const FULL_FR = "Je voudrais réserver une table ce soir";
const SHORT_FR = "Oui merci";
const ENGLISH_FR = "Je voudrais une table pour deux, yes please";

const talk = (...learner: string[]) => learner.flatMap((t) => [a("Partner says something."), u(t)]);

describe("pace: fewer than three learner replies is always normal", () => {
  it.each([0, 1, 2])("%i replies", (n) => {
    const replies = Array.from({ length: n }, () => SHORT_EN);
    expect(chooseRehearsalPace(talk(...replies), "en")).toBe("normal");
  });
  it("even when the only replies are repetition requests", () => {
    expect(chooseRehearsalPace(talk("sorry?", "can you repeat that"), "en")).toBe("normal");
  });
  it("assistant turns are not learner replies", () => {
    expect(chooseRehearsalPace([a("x"), a("y"), a("z"), u(SHORT_EN), u(SHORT_EN)], "en")).toBe(
      "normal",
    );
  });
});

describe("pace: simplify when 2 of the last 3 learner replies are short or English", () => {
  it("2 short of 3 is simplify", () => {
    expect(chooseRehearsalPace(talk(FULL_EN, SHORT_EN, SHORT_EN), "en")).toBe("simplify");
    expect(chooseRehearsalPace(talk(SHORT_EN, FULL_EN, SHORT_EN), "en")).toBe("simplify");
  });
  it("1 short of 3 is normal", () => {
    expect(chooseRehearsalPace(talk(FULL_EN, FULL_EN, SHORT_EN), "en")).toBe("normal");
    expect(chooseRehearsalPace(talk(SHORT_EN, FULL_EN, FULL_EN), "en")).toBe("normal");
  });
  it("only the last 3 count: an old short reply is out of the window", () => {
    expect(chooseRehearsalPace(talk(SHORT_EN, SHORT_EN, FULL_EN, FULL_EN, FULL_EN), "en")).toBe(
      "faster",
    );
  });
  it("replies that fall back to English count in a French course", () => {
    expect(chooseRehearsalPace(talk(FULL_FR, ENGLISH_FR, ENGLISH_FR), "fr")).toBe("simplify");
    expect(chooseRehearsalPace(talk(FULL_FR, FULL_FR, ENGLISH_FR), "fr")).toBe("normal");
  });
  it("a mix of one short and one English is 2 weak", () => {
    expect(chooseRehearsalPace(talk(FULL_FR, SHORT_FR, ENGLISH_FR), "fr")).toBe("simplify");
  });
});

describe("pace: a bit faster after 3 full replies in a row", () => {
  it("3 full is faster", () => {
    expect(chooseRehearsalPace(talk(FULL_EN, FULL_EN, FULL_EN), "en")).toBe("faster");
    expect(chooseRehearsalPace(talk(FULL_FR, FULL_FR, FULL_FR), "fr")).toBe("faster");
  });
  it("2 full after a short one is not faster", () => {
    expect(chooseRehearsalPace(talk(SHORT_EN, FULL_EN, FULL_EN), "en")).toBe("normal");
  });
  it("a short reply in the middle breaks the run", () => {
    expect(chooseRehearsalPace(talk(FULL_EN, SHORT_EN, FULL_EN), "en")).toBe("normal");
  });
});

describe("pace: asking for repetition", () => {
  it.each<[Course, string]>([
    ["en", "Can you repeat that, please?"],
    ["en", "Sorry?"],
    ["en", "more slowly please"],
    ["fr", "Pouvez-vous répéter, s'il vous plaît ?"],
    ["fr", "Répétez"],
    ["fr", "plus lentement"],
    ["fr", "Pardon ?"],
    ["es", "¿Puede repetir, por favor?"],
    ["es", "más despacio"],
    ["es", "No entiendo"],
    ["es", "perdón"],
  ])("%s: %s", (course, text) => {
    expect(asksForRepetition(text, course)).toBe(true);
    // Three otherwise-full replies, the last one a request: simplify beats faster.
    const full =
      course === "fr" ? FULL_FR : course === "es" ? "Quiero reservar una mesa hoy" : FULL_EN;
    expect(chooseRehearsalPace(talk(full, full, text), course)).toBe("simplify");
  });

  it("is accent and case insensitive", () => {
    expect(asksForRepetition("REPETEZ", "fr")).toBe(true);
    expect(asksForRepetition("repetez", "fr")).toBe(true);
    expect(asksForRepetition("Pouvez vous répéter", "fr")).toBe(true);
    expect(asksForRepetition("MAS DESPACIO", "es")).toBe(true);
    expect(asksForRepetition("puede repetir", "es")).toBe(true);
    expect(asksForRepetition("PERDON", "es")).toBe(true);
    expect(asksForRepetition("CAN YOU REPEAT", "en")).toBe(true);
  });

  it("a one-word phrase only counts as the whole reply", () => {
    expect(asksForRepetition("Sorry I am late for the meeting", "en")).toBe(false);
    expect(asksForRepetition("What a lovely office you have", "en")).toBe(false);
    expect(asksForRepetition("Pardon, je suis en retard pour le rendez-vous", "fr")).toBe(false);
  });

  it("the phrase list is the course's own", () => {
    expect(asksForRepetition("más despacio", "fr")).toBe(false);
    expect(asksForRepetition("répétez", "es")).toBe(false);
  });

  it("only the latest reply's request counts, an earlier one does not", () => {
    expect(chooseRehearsalPace(talk("sorry?", FULL_EN, FULL_EN), "en")).toBe("normal");
  });
});

describe("the pace line", () => {
  const courses: Course[] = ["en", "fr", "es"];
  const paces: RehearsalPace[] = ["simplify", "normal", "faster"];

  it("every course has three distinct lines", () => {
    for (const c of courses) {
      expect(new Set(paces.map((p) => paceLine(c, p))).size).toBe(3);
    }
  });

  it("none announces a change", () => {
    const announce =
      /let me slow|slow(ing)? down|je vais ralentir|vais parler plus|voy a hablar más despacio|voy a ir más/i;
    for (const c of courses) for (const p of paces) expect(paceLine(c, p)).not.toMatch(announce);
  });

  it("simplify and faster tell the partner not to mention it; every line holds the brief and stage", () => {
    const hold: Record<Course, RegExp> = {
      en: /Stay inside the brief and the stage/,
      fr: /Reste dans le cadre du bloc et de l'étape/,
      es: /Quédate dentro del bloque y de la etapa/,
    };
    const quiet: Record<Course, RegExp> = {
      en: /Never mention/,
      fr: /Ne dis jamais/,
      es: /No digas nunca/,
    };
    for (const c of courses) {
      for (const p of paces) expect(paceLine(c, p)).toMatch(hold[c]);
      expect(paceLine(c, "simplify")).toMatch(quiet[c]);
      expect(paceLine(c, "faster")).toMatch(quiet[c]);
    }
  });

  it("withRehearsalPace appends exactly one line and never the learner's words", () => {
    const secret = "my-secret-learner-text-xyz";
    const { prompt, pace } = withRehearsalPace("BASE PROMPT", talk(secret, secret, secret), "en");
    expect(pace).toBe("simplify");
    expect(prompt).toBe(`BASE PROMPT\n\n${paceLine("en", "simplify")}`);
    expect(prompt).not.toContain(secret);
    const all = paces.map((p) => paceLine("en", p));
    expect(all.filter((l) => prompt.includes(l))).toHaveLength(1);
  });
});

describe("pace: comprehension phrases only count in a brief reply or a question", () => {
  it.each<[Course, string]>([
    ["es", "No entiendo por qué subió el precio de la cuenta"],
    ["fr", "Je ne comprends pas pourquoi le prix a augmenté ce mois-ci"],
    ["en", "I don't understand why the price went up this month"],
  ])("%s: a long answer containing the phrase is not a request", (course, text) => {
    expect(asksForRepetition(text, course)).toBe(false);
    const full =
      course === "fr" ? FULL_FR : course === "es" ? "Quiero reservar una mesa hoy" : FULL_EN;
    expect(chooseRehearsalPace(talk(full, full, text), course)).toBe("faster");
  });

  it("a long reply that ends with a question mark still counts", () => {
    expect(
      asksForRepetition("No entiendo muy bien lo que quiere decir, puede explicarlo?", "es"),
    ).toBe(true);
  });

  it("a brief reply counts without a question mark", () => {
    expect(asksForRepetition("No entiendo", "es")).toBe(true);
    expect(asksForRepetition("Je ne comprends pas", "fr")).toBe(true);
    expect(asksForRepetition("I don't understand", "en")).toBe(true);
  });
});

describe("pace: more common requests", () => {
  it.each<[Course, string]>([
    ["es", "No entendí"],
    ["es", "Otra vez, por favor"],
    ["es", "¿Puede repetirlo?"],
    ["es", "Repetirlo, por favor"],
    ["es", "Repítame eso"],
    ["fr", "Tu peux répéter ?"],
    ["fr", "Vous pouvez répéter"],
    ["fr", "Peux-tu répéter"],
    ["fr", "Répéter"],
    ["fr", "Encore une fois"],
    ["fr", "Pas compris"],
    ["en", "I didn't catch that"],
  ])("%s: %s", (course, text) => {
    expect(asksForRepetition(text, course)).toBe(true);
  });

  it("a bare apology is not a request", () => {
    expect(asksForRepetition("Désolé", "fr")).toBe(false);
    expect(asksForRepetition("desole", "fr")).toBe(false);
  });

  it("a long answer that merely mentions repeating is not a request", () => {
    expect(
      asksForRepetition("Hier j'ai dû répéter la même phrase pour toute l'équipe au bureau", "fr"),
    ).toBe(false);
    expect(
      asksForRepetition(
        "Lo hice otra vez porque el cliente cambió de opinión sobre el pedido",
        "es",
      ),
    ).toBe(false);
  });
});
