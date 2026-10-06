import { describe, expect, it } from "vitest";
import { validateSavedWordInput } from "./saved-word";
import { isSavableWord, saveRequestFor, segmentText } from "./word-segmenter";

describe("segmentText", () => {
  it("splits words from the text between them and keeps every character", () => {
    const text = "Hello, world! It's fine.";
    const segments = segmentText(text);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.isWord).map((s) => s.text)).toEqual([
      "Hello",
      "world",
      "It's",
      "fine",
    ]);
  });

  it("keeps an apostrophe or hyphen only between letters", () => {
    const words = (t: string) =>
      segmentText(t)
        .filter((s) => s.isWord)
        .map((s) => s.text);
    expect(words("well-known 'quoted' dogs'")).toEqual(["well-known", "quoted", "dogs"]);
    expect(words("don’t")).toEqual(["don’t"]);
  });

  it("treats digits and symbols as non-words", () => {
    expect(
      segmentText("room 42 costs $5")
        .filter((s) => s.isWord)
        .map((s) => s.text),
    ).toEqual(["room", "costs"]);
  });

  it("reports each segment's start offset in the normalised text", () => {
    const segments = segmentText("ab cd");
    expect(segments.map((s) => [s.text, s.start])).toEqual([
      ["ab", 0],
      [" ", 2],
      ["cd", 3],
    ]);
  });

  it("composes a decomposed accent so the word is not split in two", () => {
    const decomposed = "café au lait";
    const words = segmentText(decomposed)
      .filter((s) => s.isWord)
      .map((s) => s.text);
    expect(words).toEqual(["café", "au", "lait"]);
  });

  it("returns nothing for empty text", () => {
    expect(segmentText("")).toEqual([]);
  });
});

describe("isSavableWord", () => {
  it("accepts 1 to 40 UTF-16 units and rejects longer words", () => {
    expect(isSavableWord("a")).toBe(true);
    expect(isSavableWord("a".repeat(40))).toBe(true);
    expect(isSavableWord("a".repeat(41))).toBe(false);
    expect(isSavableWord("")).toBe(false);
  });
});

describe("saveRequestFor", () => {
  const text = "I like tea. She said the answer, and left. He ran home.";

  it("picks the sentence that was tapped, not the first one with the word", () => {
    const segments = segmentText(text);
    const second = segments.filter((s) => s.isWord && s.text === "He")[0];
    const req = saveRequestFor(text, second, "en");
    expect(req.sentence).toBe("He ran home.");
    expect(req.word).toBe("He");
    expect(req.course).toBe("en");
  });

  it("does not match a word inside a longer word", () => {
    // "The" contains "he", the word being saved; a substring picker would
    // choose this first sentence.
    const t = "The other one. he is here.";
    const he = segmentText(t).find((s) => s.isWord && s.text === "he")!;
    expect(saveRequestFor(t, he, "en").sentence).toBe("he is here.");
  });

  it("keeps the same word in two sentences apart", () => {
    // Same casing both times, so a picker that takes the first sentence
    // containing the word's text cannot pass by case luck.
    const t = "Tea is hot. I want Tea.";
    const tea = segmentText(t).filter((s) => s.isWord && s.text === "Tea");
    expect(saveRequestFor(t, tea[0], "en").sentence).toBe("Tea is hot.");
    expect(saveRequestFor(t, tea[1], "en").sentence).toBe("I want Tea.");
  });

  it("windows an over-long sentence around the TAPPED occurrence within 300 units", () => {
    const filler = "word ".repeat(120);
    const t = `${filler}target ${filler}`;
    const target = segmentText(t).find((s) => s.isWord && s.text === "target")!;
    const req = saveRequestFor(t, target, "en");
    expect(req.sentence.length).toBeLessThanOrEqual(300);
    expect(req.sentence).toContain("target");
  });

  it("anchors the window on the tapped occurrence when the word repeats", () => {
    const filler = "word ".repeat(120);
    const t = `target ${filler}target ${filler}`;
    const second = segmentText(t).filter((s) => s.isWord && s.text === "target")[1];
    const req = saveRequestFor(t, second, "en");
    expect(req.sentence.length).toBeLessThanOrEqual(300);
    // The window is centred on the second occurrence, so the first (hundreds of
    // characters earlier) is out of it.
    expect(req.sentence.match(/target/g)).toHaveLength(1);
    // ...and it has real context on BOTH sides of the tapped word. A window
    // anchored on the first occurrence would start with "target" (index 0).
    expect(req.sentence.indexOf("target")).toBeGreaterThan(100);
    expect(req.sentence.length - req.sentence.indexOf("target")).toBeGreaterThan(100);
  });

  it("never cuts a surrogate pair at the edge of the window", () => {
    const filler = "😀 ".repeat(200);
    // The window edge lands on a different spot in the 3-unit emoji+space
    // cycle as the gap before the word grows, so across several gaps a
    // cut-in-half pair is certain to show up on at least one of them.
    for (let lead = 0; lead < 6; lead += 1) {
      const t = `${filler}${"x".repeat(lead)} target ${filler}`;
      const target = segmentText(t).find((s) => s.isWord && s.text === "target")!;
      const req = saveRequestFor(t, target, "en");
      expect(req.sentence.length).toBeLessThanOrEqual(300);
      const loneHigh = /[\ud800-\udbff](?![\udc00-\udfff])/;
      const loneLow = /(?<![\ud800-\udbff])[\udc00-\udfff]/;
      expect(loneHigh.test(req.sentence), `lead ${lead}`).toBe(false);
      expect(loneLow.test(req.sentence), `lead ${lead}`).toBe(false);
    }
  });

  it("builds a request the server's own validator accepts", () => {
    const samples = [
      "It's a well-known fact. Don’t panic!",
      "Café au lait is nice… really.\nNext line here.",
      `${"word ".repeat(120)}target ${"word ".repeat(120)}`,
    ];
    for (const t of samples) {
      for (const seg of segmentText(t).filter((s) => s.isWord && isSavableWord(s.text))) {
        const req = saveRequestFor(t, seg, "en");
        const verdict = validateSavedWordInput(req);
        expect(verdict, `${seg.text} in ${t.slice(0, 30)}`).toMatchObject({ ok: true });
      }
    }
  });
});
