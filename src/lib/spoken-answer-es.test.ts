import { describe, expect, it } from "vitest";
import { matchesSpokenAnswerEs, normaliseSpokenEs } from "./spoken-answer-es";

describe("normaliseSpokenEs", () => {
  it("strips punctuation and case", () => {
    expect(normaliseSpokenEs("¡Hola! ¿Cómo estás?")).toBe(normaliseSpokenEs("hola como estas"));
  });

  it("folds accents rather than deleting them", () => {
    // Same reasoning as spoken-answer.ts/spoken-answer-fr.ts's identical
    // vectors: deleting the accent would turn "está" into "st", matching
    // nothing. ñ is included because NFD decomposes it to n + combining
    // tilde, the same mechanism that folds é/á/etc.
    expect(normaliseSpokenEs("está")).toBe(normaliseSpokenEs("esta"));
    expect(normaliseSpokenEs("años")).toBe(normaliseSpokenEs("anos"));
    expect(normaliseSpokenEs("sí")).not.toBe(normaliseSpokenEs("no"));
    expect(normaliseSpokenEs("sí")).toBe(normaliseSpokenEs("si"));
  });

  it("collapses whitespace", () => {
    expect(normaliseSpokenEs("  hola   señora ")).toBe(normaliseSpokenEs("hola senora"));
  });

  it("drops a silent h", () => {
    expect(normaliseSpokenEs("hola")).toBe(normaliseSpokenEs("ola"));
    expect(normaliseSpokenEs("ahora")).toBe(normaliseSpokenEs("aora"));
    expect(normaliseSpokenEs("zanahoria")).toBe(normaliseSpokenEs("zanaoria"));
    expect(normaliseSpokenEs("tengo dos hermanas")).toBe(normaliseSpokenEs("tengo dos ermanas"));
  });

  it("keeps the h in the ch digraph, which is not silent", () => {
    // "chico"/"cico" are different words -- ch is its own consonant sound.
    // A blunt h-strip that didn't special-case this would corrupt every
    // ch-word in the language, which is exactly the failure this guards.
    expect(normaliseSpokenEs("chico")).not.toBe(normaliseSpokenEs("cico"));
    expect(normaliseSpokenEs("coche")).not.toBe(normaliseSpokenEs("coce"));
    expect(normaliseSpokenEs("chico")).toBe(normaliseSpokenEs("chico"));
  });
});

describe("matchesSpokenAnswerEs", () => {
  it("accepts the expected phrase however the silent h was transcribed", () => {
    expect(matchesSpokenAnswerEs("Hola, ¿qué tal?", "hola que tal")).toBe(true);
    expect(matchesSpokenAnswerEs("ola que tal", "Hola, ¿qué tal?")).toBe(true);
  });

  it("forgives a leading filler word", () => {
    expect(matchesSpokenAnswerEs("eh, hola", "Hola.")).toBe(true);
  });

  it("rejects a different sentence", () => {
    expect(matchesSpokenAnswerEs("el esta cansado", "Ella está cansada.")).toBe(false);
  });

  it("rejects a partial attempt", () => {
    expect(matchesSpokenAnswerEs("hola", "Hola, ¿cómo estás?")).toBe(false);
  });

  it("treats an empty transcript as no answer, not a wrong one", () => {
    expect(matchesSpokenAnswerEs("", "Hola.")).toBe(false);
    expect(matchesSpokenAnswerEs("   ", "Hola.")).toBe(false);
  });

  it("matches a number said as a word against the numeral Deepgram returns", () => {
    expect(matchesSpokenAnswerEs("tengo dos hermanos", "Tengo 2 hermanos.")).toBe(true);
    expect(matchesSpokenAnswerEs("son las cinco", "Son las 5.")).toBe(true);
    expect(matchesSpokenAnswerEs("tengo veinte anos", "Tengo veinte años.")).toBe(true);
    expect(matchesSpokenAnswerEs("tengo dieciseis anos", "Tengo dieciséis años.")).toBe(true);
    expect(matchesSpokenAnswerEs("hay veintidos personas", "Hay veintidós personas.")).toBe(true);
  });

  it("still tells two different numbers apart", () => {
    expect(matchesSpokenAnswerEs("tengo tres hermanos", "Tengo dos hermanos.")).toBe(false);
  });

  it("does NOT map un/una to 1 -- it is the article far more often than the number", () => {
    // The exact bare-word hazard spoken-answer-fr.ts's NUMBER_WORDS comment
    // names for un/une. Pinning that this deliberately does NOT happen, the
    // mirror image of spoken-answer.ts's own number-word tests.
    expect(normaliseSpokenEs("un gato")).not.toBe(normaliseSpokenEs("1 gato"));
    expect(normaliseSpokenEs("una casa")).not.toBe(normaliseSpokenEs("1 casa"));
    expect(normaliseSpokenEs("un gato")).toBe(normaliseSpokenEs("un gato"));
  });

  it("matches round hundred/thousand", () => {
    expect(matchesSpokenAnswerEs("hay cien personas", "Hay 100 personas.")).toBe(true);
    expect(matchesSpokenAnswerEs("hay mil personas", "Hay 1000 personas.")).toBe(true);
  });

  it("strips the silent h before the filler check runs, so no real word can hide an eh substring", () => {
    // Unlike spoken-answer-fr.test.ts's "humain"/"humeur" case (French has no
    // silent-h rule, so the \b bound on its filler regex is load-bearing),
    // Spanish's stripSilentH runs BEFORE the filler strip: any real word that
    // would otherwise contain "eh" already lost its h by this point (e.g.
    // "dehesa" -> "deesa"), so there is no equivalent substring hazard here.
    // Pinning the ordering itself, since a future edit that reordered the two
    // steps would reintroduce exactly that hazard silently.
    expect(normaliseSpokenEs("dehesa")).toBe(normaliseSpokenEs("deesa"));
  });
});
