import { describe, expect, it } from "vitest";
import { splitReplyForSpeech } from "./speech-chunks";

describe("splitReplyForSpeech", () => {
  it("splits off the first sentence", () => {
    expect(
      splitReplyForSpeech("Very good, you did it! Now tell me what you ate. And why?"),
    ).toEqual(["Very good, you did it!", "Now tell me what you ate. And why?"]);
  });

  it("keeps a one-sentence reply whole", () => {
    expect(splitReplyForSpeech("Tell me about your day.")).toEqual(["Tell me about your day."]);
  });

  it("joins a very short opener to the next sentence", () => {
    expect(splitReplyForSpeech("Oui. Très bien, continue comme ça. Et toi ?")).toEqual([
      "Oui. Très bien, continue comme ça.",
      "Et toi ?",
    ]);
  });

  it("does not split after a long first sentence, or inside a decimal or abbreviation-free run", () => {
    const long = `${"word ".repeat(60)}end. More.`;
    expect(splitReplyForSpeech(long)).toEqual([long.trim()]);
    expect(splitReplyForSpeech("It costs 3.50 euros today")).toEqual(["It costs 3.50 euros today"]);
  });

  it("is deterministic and always rejoins to the same words", () => {
    const text = "¿Cómo estás? Yo estoy muy bien, gracias. ¿Y tú?";
    const parts = splitReplyForSpeech(text);
    expect(splitReplyForSpeech(text)).toEqual(parts);
    expect(parts.join(" ")).toBe(text);
  });
});
