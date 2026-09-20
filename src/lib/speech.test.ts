// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speak } from "./speech";

describe("speak", () => {
  const cancel = vi.fn();
  const speakFn = vi.fn();

  beforeEach(() => {
    cancel.mockClear();
    speakFn.mockClear();
    Object.defineProperty(window, "speechSynthesis", {
      value: { cancel, speak: speakFn },
      configurable: true,
      writable: true,
    });
    // jsdom has no real SpeechSynthesisUtterance -- a minimal stand-in is
    // enough since this test only checks what speak() passes to it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = "";
      constructor(text: string) {
        this.text = text;
      }
    };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).speechSynthesis;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).SpeechSynthesisUtterance;
  });

  it("cancels any in-progress utterance before speaking the new one", () => {
    speak("Hello there", "en-US");
    expect(cancel).toHaveBeenCalled();
  });

  it("speaks an utterance with the given text and language", () => {
    speak("Bonjour", "fr-FR");
    expect(speakFn).toHaveBeenCalledTimes(1);
    const utterance = speakFn.mock.calls[0][0];
    expect(utterance.text).toBe("Bonjour");
    expect(utterance.lang).toBe("fr-FR");
  });

  it("does nothing when speechSynthesis isn't available (no throw)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).speechSynthesis;
    expect(() => speak("Hi", "en-US")).not.toThrow();
  });
});
