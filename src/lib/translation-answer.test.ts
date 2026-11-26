import { describe, expect, it } from "vitest";
import { matchesAcceptableAnswer, normaliseWritten } from "./translation-answer";

const ACCEPTED = ["I don't understand.", "I do not understand.", "Sorry, I don't understand."];

describe("matchesAcceptableAnswer", () => {
  it("accepts any curated phrasing regardless of case and end punctuation", () => {
    expect(matchesAcceptableAnswer("i dont understand", ACCEPTED)).toBe(true);
    expect(matchesAcceptableAnswer("I DO NOT UNDERSTAND!", ACCEPTED)).toBe(true);
    expect(matchesAcceptableAnswer("sorry, I don't understand", ACCEPTED)).toBe(true);
  });

  it("answers the contraction question the same way spoken answers do", () => {
    // A typed translation and a spoken one face the same "is don't the same as
    // do not" question. Answering it twice would mean a phrasing accepted when
    // said and rejected when typed, for no reason the learner could ever see.
    expect(normaliseWritten("I don't understand")).toBe(normaliseWritten("I do not understand"));
    expect(normaliseWritten("we are meeting at the café")).toBe(
      normaliseWritten("We are meeting at the cafe"),
    );
  });

  it("rejects a different sentence and a partial one", () => {
    expect(matchesAcceptableAnswer("I understand", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("I do not", ACCEPTED)).toBe(false);
  });

  it("treats an empty submission as no answer", () => {
    expect(matchesAcceptableAnswer("", ACCEPTED)).toBe(false);
    expect(matchesAcceptableAnswer("   ", ACCEPTED)).toBe(false);
  });

  it("fails closed on an empty acceptable list", () => {
    // A malformed pack line must never make every answer correct. This is the
    // direction that matters: over-accepting is invisible to the learner and
    // silently destroys the question.
    expect(matchesAcceptableAnswer("anything at all", [])).toBe(false);
  });
});

describe("written Spanish: a missing tilde is a slip unless it makes a different real word", () => {
  const ANO = ["Tengo un año."];
  it("a dropped tilde is accepted when the tilde-less form is not a word", () => {
    expect(matchesAcceptableAnswer("hablo espanol", ["Hablo español."])).toBe(true);
    expect(matchesAcceptableAnswer("hasta manana", ["Hasta mañana."])).toBe(true);
    expect(matchesAcceptableAnswer("donde esta el nino", ["¿Dónde está el niño?"])).toBe(true);
  });
  it("año is not ano, uña is not una, in either direction, but is año however it is typed", () => {
    expect(matchesAcceptableAnswer("me duele la una", ["Me duele la uña."])).toBe(false);
    expect(matchesAcceptableAnswer("vamos a la pena", ["Vamos a la peña."])).toBe(false);
    expect(matchesAcceptableAnswer("tengo un ano", ANO)).toBe(false);
    expect(matchesAcceptableAnswer("tengo un año", ANO)).toBe(true);
    expect(matchesAcceptableAnswer("TENGO UN AÑO", ANO)).toBe(true);
    expect(matchesAcceptableAnswer("Tengo un año.", ANO)).toBe(true);
    expect(matchesAcceptableAnswer("Tengo un año.", ["Tengo un ano."])).toBe(false);
  });
  it("other accents and inverted marks still fold", () => {
    expect(matchesAcceptableAnswer("donde esta el niño", ["¿Dónde está el niño?"])).toBe(true);
    expect(matchesAcceptableAnswer("we meet at the cafe", ["We meet at the café."])).toBe(true);
  });
  it("normaliseWritten keeps the enye only on a twin word, and the spoken normaliser always folds it", async () => {
    expect(normaliseWritten("¡El Niño!")).toBe("el nino");
    expect(normaliseWritten("Un AÑO")).toBe("un año");
    const { normaliseSpoken } = await import("./spoken-answer");
    expect(normaliseSpoken("año")).toBe("ano");
  });
});
