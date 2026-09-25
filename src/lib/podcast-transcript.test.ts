import { describe, expect, it } from "vitest";
import { normalizeTranscript, transcriptParagraphs } from "./podcast-transcript";

describe("normalizeTranscript", () => {
  it("keeps paragraph structure while trimming each line", () => {
    const raw = "  Hello there.  \n\n  How are you?  ";
    expect(normalizeTranscript(raw)).toBe("Hello there.\n\nHow are you?");
  });

  it("collapses a run of blank lines to one paragraph break", () => {
    expect(normalizeTranscript("One.\n\n\n\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("normalizes Windows and classic Mac line endings", () => {
    // The transcript arrives as a file the account owner wrote, so it can
    // carry any platform's line endings.
    expect(normalizeTranscript("One.\r\n\r\nTwo.")).toBe("One.\n\nTwo.");
    expect(normalizeTranscript("One.\r\rTwo.")).toBe("One.\n\nTwo.");
  });

  it("returns null for an empty or whitespace-only transcript", () => {
    expect(normalizeTranscript("")).toBeNull();
    expect(normalizeTranscript("   \n\n  \t ")).toBeNull();
  });

  it("strips a UTF-8 byte-order mark rather than showing it as a character", () => {
    // A BOM survives most editors invisibly and would render as a stray
    // glyph at the very start of the transcript.
    expect(normalizeTranscript("﻿Hello.")).toBe("Hello.");
  });

  it("rejects a transcript longer than the cap rather than truncating it", () => {
    // Truncating would silently publish a partial transcript, which for an
    // accessibility artefact is worse than refusing: a deaf learner would
    // have no way to know the text stops early.
    const huge = "word ".repeat(60_000);
    expect(() => normalizeTranscript(huge)).toThrow(/too long/i);
  });

  it("accepts a realistic episode transcript", () => {
    // ~3 minutes of speech is roughly 450 words.
    const realistic = "word ".repeat(450).trim();
    expect(normalizeTranscript(realistic)).toBe(realistic);
  });
});

describe("transcriptParagraphs", () => {
  it("splits on blank lines for rendering", () => {
    expect(transcriptParagraphs("One.\n\nTwo.\n\nThree.")).toEqual(["One.", "Two.", "Three."]);
  });

  it("keeps a single-line transcript as one paragraph", () => {
    expect(transcriptParagraphs("Just one line.")).toEqual(["Just one line."]);
  });

  it("returns no paragraphs for empty text", () => {
    expect(transcriptParagraphs("")).toEqual([]);
  });

  it("keeps a single newline inside a paragraph as a space, not a break", () => {
    // A hard-wrapped source file should not render as one paragraph per line.
    expect(transcriptParagraphs("A line\nwrapped here.\n\nNext.")).toEqual([
      "A line wrapped here.",
      "Next.",
    ]);
  });
});

describe("markup rejection", () => {
  // The failure this exists for: episode 1's TTS script carries SSML, and
  // the audio was generated from it, so it reads like the obvious
  // transcript. Attached raw it would render `<break time="1.0s" />` on
  // screen -- to exactly the learners a transcript exists for.
  it("rejects SSML rather than rendering it to a reader", () => {
    expect(() => normalizeTranscript('Hello. <break time="1.0s" /> How are you?')).toThrow(
      /markup/i,
    );
  });

  it("names the tag it found, so the fix is obvious", () => {
    expect(() => normalizeTranscript("<speak>Hello.</speak>")).toThrow(/speak/);
  });

  it("rejects HTML too, not only SSML", () => {
    expect(() => normalizeTranscript("<p>Hello.</p>")).toThrow(/markup/i);
  });

  // Rejecting rather than stripping: silently removing tags from a
  // hand-written transcript would be surprising, and would hide the real
  // mistake, which is that the wrong file was passed.
  it("allows a less-than sign that is not a tag", () => {
    expect(normalizeTranscript("Five is less than ten: 5 < 10.")).toBe(
      "Five is less than ten: 5 < 10.",
    );
  });

  it("allows an emoticon-like sequence", () => {
    expect(normalizeTranscript("I <3 coffee.")).toBe("I <3 coffee.");
  });
});
