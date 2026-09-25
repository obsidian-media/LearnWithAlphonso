import { describe, expect, it } from "vitest";
import { matchesSpokenAnswerFr, normaliseSpokenFr } from "./spoken-answer-fr";

describe("normaliseSpokenFr", () => {
  it("strips punctuation and case", () => {
    expect(normaliseSpokenFr("Bonjour, Comment allez-vous ?!")).toBe(
      normaliseSpokenFr("bonjour comment allez vous"),
    );
  });

  it("folds accents rather than deleting them", () => {
    // Same reasoning as spoken-answer.ts's identical vector: deleting é
    // would turn "élève" into "l ve", matching nothing.
    expect(normaliseSpokenFr("l'élève")).toBe(normaliseSpokenFr("l'eleve"));
    expect(normaliseSpokenFr("à bientôt")).toBe(normaliseSpokenFr("a bientot"));
  });

  it("collapses whitespace", () => {
    expect(normaliseSpokenFr("  bonjour   madame ")).toBe(normaliseSpokenFr("bonjour madame"));
  });

  it("treats an elided form and its space-separated spelling as the same", () => {
    // The apostrophe form and the fused no-apostrophe form already agree via
    // the generic apostrophe strip (same mechanism as English's contractions).
    // The form that needs its own rule is Deepgram rendering the elision as
    // two separate words instead of joining them.
    expect(normaliseSpokenFr("j'ai faim")).toBe(normaliseSpokenFr("jai faim"));
    expect(normaliseSpokenFr("j'ai faim")).toBe(normaliseSpokenFr("j ai faim"));
    expect(normaliseSpokenFr("l'école")).toBe(normaliseSpokenFr("l ecole"));
    expect(normaliseSpokenFr("c'est")).toBe(normaliseSpokenFr("c est"));
    expect(normaliseSpokenFr("qu'est-ce que c'est")).toBe(normaliseSpokenFr("qu est ce que c est"));
  });

  it("elides si only before il/ils, not before other vowel-initial words", () => {
    expect(normaliseSpokenFr("s'il vous plaît")).toBe(normaliseSpokenFr("s il vous plait"));
    expect(normaliseSpokenFr("s'ils viennent")).toBe(normaliseSpokenFr("s ils viennent"));
    // "si elle" must NOT be joined into "s'elle" -- that is not real French,
    // and the general vowel-initial rule would wrongly fire here if "si" were
    // in ELIDABLE instead of handled as its own narrow rule.
    expect(normaliseSpokenFr("si elle vient")).not.toBe(normaliseSpokenFr("s elle vient"));
    expect(normaliseSpokenFr("si elle vient")).toBe(normaliseSpokenFr("si elle vient"));
  });
});

describe("matchesSpokenAnswerFr", () => {
  it("accepts the expected phrase however the elision was transcribed", () => {
    expect(matchesSpokenAnswerFr("J'ai faim.", "j'ai faim")).toBe(true);
    expect(matchesSpokenAnswerFr("j ai faim", "J'ai faim.")).toBe(true);
    expect(matchesSpokenAnswerFr("jai faim", "J'ai faim.")).toBe(true);
  });

  it("forgives a leading filler word", () => {
    expect(matchesSpokenAnswerFr("euh, bonjour", "Bonjour.")).toBe(true);
    expect(matchesSpokenAnswerFr("hum bonjour", "Bonjour.")).toBe(true);
  });

  it("rejects a different sentence", () => {
    expect(matchesSpokenAnswerFr("il est fatigué", "Elle est fatiguée.")).toBe(false);
  });

  it("rejects a partial attempt", () => {
    expect(matchesSpokenAnswerFr("bonjour", "Bonjour, comment allez-vous ?")).toBe(false);
  });

  it("treats an empty transcript as no answer, not a wrong one", () => {
    expect(matchesSpokenAnswerFr("", "Bonjour.")).toBe(false);
    expect(matchesSpokenAnswerFr("   ", "Bonjour.")).toBe(false);
  });

  it("matches a number said as a word against the numeral Deepgram returns", () => {
    expect(matchesSpokenAnswerFr("j'ai deux frères", "J'ai 2 frères.")).toBe(true);
    expect(matchesSpokenAnswerFr("il est cinq heures", "Il est 5 heures.")).toBe(true);
  });

  it("still tells two different numbers apart", () => {
    expect(matchesSpokenAnswerFr("j'ai trois frères", "J'ai deux frères.")).toBe(false);
  });

  it("does NOT map un/une to 1 -- it is the article far more often than the number", () => {
    // The bare-word hazard spec section 4.1 names explicitly: mapping this
    // unconditionally would turn "un chat" (a cat) into "1 chat". Pinning
    // that this deliberately does NOT happen, the mirror image of
    // spoken-answer.ts's own number-word tests.
    expect(normaliseSpokenFr("un chat")).not.toBe(normaliseSpokenFr("1 chat"));
    expect(normaliseSpokenFr("un chat")).toBe(normaliseSpokenFr("un chat"));
  });

  it("does not corrupt real words that contain a filler as a substring", () => {
    // "humain"/"humeur" contain "hum" as their first three letters -- an
    // unbounded filler strip would mangle them into "ain"/"eur". \b prevents
    // that; this pins it rather than assuming the regex is bounded correctly.
    expect(matchesSpokenAnswerFr("un être humain", "Un être humain.")).toBe(true);
    expect(matchesSpokenAnswerFr("il est de bonne humeur", "Il est de bonne humeur.")).toBe(true);
  });
});
