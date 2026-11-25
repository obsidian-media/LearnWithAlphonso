// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LATCH_MS } from "@/lib/say-it-right";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { SayThePicture } from "./SayThePicture";
import {
  MAX_RECORD_MS,
  comboCount,
  drawRounds,
  missedWords,
  poseFor,
  saveSentence,
  type PictureWord,
} from "@/lib/say-the-picture";

const h = vi.hoisted(() => ({
  words: [] as unknown[],
  capture: {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    failed: false,
    canRecord: true,
    start: vi.fn(),
    stop: vi.fn(),
    onTranscript: null as ((t: string, c: number | null) => void) | null,
    course: undefined as string | undefined,
  },
  model: vi.fn(),
}));

vi.mock("@/lib/say-the-picture", async (orig) => {
  const real = await orig<typeof import("@/lib/say-the-picture")>();
  return { ...real, imageWordPool: () => h.words };
});
vi.mock("@/lib/use-speech-capture", () => ({
  useSpeechCapture: (o: {
    onTranscript: (t: string, c: number | null) => void;
    course?: string;
  }) => {
    h.capture.onTranscript = o.onTranscript;
    h.capture.course = o.course;
    return h.capture;
  },
}));
// jsdom never loads an image (a not-loaded image counts as failed and collapses), so give the slot a stand-in.
vi.mock("../VocabImage", () => ({
  VocabImage: ({ url, alt, className }: { url: string; alt: string; className?: string }) => (
    <div data-testid="vocab-image" className={className}>
      <img src={url} alt={alt} />
    </div>
  ),
}));
vi.mock("./SayItRight", () => ({
  SayItRight: ({ words, onExit }: { words?: { term: string }[]; onExit: () => void }) => (
    <div data-testid="say-it-right" data-words={(words ?? []).map((w) => w.term).join(",")}>
      <button onClick={onExit}>back from drill</button>
    </div>
  ),
}));
vi.mock("@/lib/use-model-speech", () => ({ useModelSpeech: () => h.model }));

const url =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/x.jpg";
const mk = (n: number): PictureWord[] =>
  Array.from({ length: n }, (_, i) => ({
    term: `word${String.fromCharCode(97 + i)}`,
    meaning: "",
    example: "",
    image: { url, alt: "alt", credit: "c", source: "pexels" } as PictureWord["image"],
  }));

const say = (t: string) => act(() => h.capture.onTranscript?.(t, 0.9));
const view = (consent = fakeConsentApi()) =>
  render(withAiConsent(<SayThePicture course="en" onExit={() => {}} />, consent));
const currentTerm = () => screen.queryByText(/^word[a-z]$/)?.textContent;

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  h.words = mk(12);
  Object.assign(h.capture, { state: "idle", error: null, failed: false, canRecord: true });
  h.capture.start.mockClear();
  h.model.mockClear();
});

describe("Say the picture", () => {
  it("shows the picture only, with no written word, and a labelled record button", () => {
    view();
    expect(screen.getByText("Word 1 of 8")).toBeTruthy();
    expect(screen.queryByText(/^word[a-z]$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Record your answer" }));
    expect(h.capture.start).toHaveBeenCalled();
  });

  it("sends speech through the existing speak capture (the /api/stt speaking quota) in the course language", () => {
    view();
    expect(h.capture.course).toBe("en");
  });

  it("a correct say shows a star with the word and advances", () => {
    view();
    const hit = (drawRounds(h.words as PictureWord[], 8, () => 0)[0] as PictureWord).term;
    say(`the ${hit}`);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(currentTerm()).toBe(hit);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
    expect(h.model).not.toHaveBeenCalled();
  });

  it("a miss reveals the word, plays the model, lets the learner repeat once, with no penalty", () => {
    view();
    say("zzzz");
    expect(h.model).toHaveBeenCalledTimes(1);
    const term = currentTerm()!;
    expect(term).toMatch(/^word[a-z]$/);
    expect(h.model).toHaveBeenCalledWith(term);
    expect(screen.getByText("Now say it once yourself.")).toBeTruthy();
    say("whatever");
    expect(screen.getByText(/Nice/)).toBeTruthy();
    expect(screen.queryByText(/heart/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("runs 8 rounds then shows a stars summary with 'Practised 8 words'", () => {
    view();
    for (let i = 0; i < 8; i++) {
      say("zzzz");
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next word" }));
    }
    expect(screen.getByText("Practised 8 words")).toBeTruthy();
    expect(screen.getByRole("img", { name: /of 3 stars/ })).toBeTruthy();
  });

  it("'Show me the word' teaches without a recording", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Show me the word" }));
    expect(h.model).toHaveBeenCalled();
    expect(currentTerm()).toMatch(/^word[a-z]$/);
  });

  it("says so, with no dead mic button, when this device cannot record", () => {
    h.capture.canRecord = false;
    view();
    expect(screen.getByRole("status").textContent).toMatch(/microphone/i);
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
  });

  it("says so when AI consent is off", () => {
    view(fakeConsentApi(null));
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows 'not enough words with pictures yet' for an empty or tiny pool, without crashing", () => {
    for (const n of [0, 3]) {
      h.words = mk(n);
      const { unmount } = view();
      expect(screen.getByText(/not enough words with pictures yet/i)).toBeTruthy();
      unmount();
    }
  });

  it("introduces no new quota kind", async () => {
    const fs = await import("node:fs");
    const quota = fs.readFileSync("src/lib/ai-quota.server.ts", "utf8");
    expect(quota).not.toMatch(/say|picture/i);
    for (const f of [
      "src/components/practice/SayThePicture.tsx",
      "src/lib/say-the-picture.ts",
      "src/lib/use-model-speech.ts",
    ])
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/authorizeAiRequest|AiKind/);
  });

  it("puts the photo full-bleed behind the controls, with a generic description until the word is revealed", () => {
    view();
    const photo = screen.getByTestId("vocab-image");
    expect(photo.className).toContain("absolute inset-0");
    expect(screen.getByRole("img", { name: "A picture of a word to say" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "alt" })).toBeNull();
    say("zzzz");
    expect(screen.getByRole("img", { name: "alt" })).toBeTruthy();
  });

  it("never clips the result on a short phone: only the photo is clipped, the screen grows with its content", () => {
    view();
    const root = document.querySelector("[data-say-the-picture]") as HTMLElement;
    expect(root.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/);
    expect(screen.getByTestId("vocab-image").closest("[data-stp-backdrop]")?.className).toContain(
      "overflow-hidden",
    );
    // Alphonso and his bubble shrink on a short, narrow screen so the word and the controls stay in view.
    expect(screen.getByTestId("stp-tutor").querySelector("img")!.className).toContain(
      "max-height:640px",
    );
  });

  it("covers the app's top bar and tab bar on a phone, so a tap near the bottom cannot scroll the word under them", () => {
    view();
    const root = document.querySelector("[data-say-the-picture]") as HTMLElement;
    for (const cls of ["max-md:fixed", "max-md:inset-0", "max-md:z-40", "max-md:overflow-y-auto"])
      expect(root.className).toContain(cls);
  });

  it("Alphonso is explaining while asking, listening while recording, thinking after a miss and cheering on a win", () => {
    const { rerender } = view();
    const root = () => document.querySelector("[data-say-the-picture]") as HTMLElement;
    const src = () =>
      (screen.getByTestId("stp-tutor").querySelector("img") as HTMLImageElement).src;
    const again = () =>
      rerender(withAiConsent(<SayThePicture course="en" onExit={() => {}} />, fakeConsentApi()));
    expect(root().dataset.pose).toBe("explaining-pointer");
    expect(src()).toContain("/figures/alphonso-explaining-pointer.webp");
    h.capture.state = "recording";
    again();
    expect(root().dataset.pose).toBe("listening-headphones");
    const stop = screen.getByRole("button", { name: "Stop recording" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("stp-mic").dataset.recording).toBe("true");
    h.capture.state = "idle";
    again();
    say("zzzz");
    expect(root().dataset.pose).toBe("thinking-temple");
    expect(src()).toContain("alphonso-thinking-temple.webp");
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    const hit = (drawRounds(h.words as PictureWord[], 8, () => 0)[1] as PictureWord).term;
    say(hit);
    expect(root().dataset.pose).toBe("levelup-cheer");
  });

  describe("the mic: hold to talk, or tap to start and tap to stop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      h.capture.stop.mockClear();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const mic = () => screen.getByTestId("stp-mic");
    const hold = (ms: number) => {
      fireEvent.pointerDown(mic());
      act(() => {
        vi.advanceTimersByTime(ms);
      });
      fireEvent.pointerUp(mic());
    };

    it("says how it works, and the hint is the ring's description", () => {
      view();
      expect(mic().getAttribute("aria-describedby")).toBe("stp-hint");
      expect(document.getElementById("stp-hint")?.textContent).toBe(
        "What is this? Hold to talk, or tap to start and tap to stop.",
      );
      h.capture.state = "recording";
      cleanup();
      view();
      expect(document.getElementById("stp-hint")?.textContent).toBe(
        "Listening. Let go or tap to send.",
      );
    });

    it("a long hold starts on press and stops on release; the click after it is swallowed", () => {
      view();
      fireEvent.pointerDown(mic());
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(LATCH_MS + 1);
      });
      fireEvent.pointerUp(mic());
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      fireEvent.click(mic()); // the click that follows a hold is swallowed
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      fireEvent.click(mic()); // a keyboard press toggles on
      expect(h.capture.start).toHaveBeenCalledTimes(2);
    });

    it("a quick tap latches the recording on, and a second tap stops it", () => {
      view();
      hold(50);
      fireEvent.click(mic()); // swallowed
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      expect(h.capture.stop).not.toHaveBeenCalled(); // latched: still recording
      // The recording is now on; the second tap stops it.
      h.capture.state = "recording";
      cleanup();
      view();
      h.capture.start.mockClear();
      fireEvent.pointerDown(mic());
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      expect(h.capture.start).not.toHaveBeenCalled();
      fireEvent.pointerUp(mic());
      fireEvent.click(mic()); // swallowed, not a second toggle
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      expect(h.capture.start).not.toHaveBeenCalled();
    });

    it("a latched recording still auto-stops at the cap", () => {
      view();
      hold(50);
      expect(h.capture.stop).not.toHaveBeenCalled();
      h.capture.state = "recording";
      cleanup();
      view();
      act(() => {
        vi.advanceTimersByTime(MAX_RECORD_MS + 1);
      });
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
    });

    it.each(["pointerLeave", "pointerCancel"] as const)(
      "%s while held stops the recording, and the next click toggles (no stale swallow)",
      (ev) => {
        view();
        fireEvent.pointerDown(mic());
        act(() => {
          vi.advanceTimersByTime(20); // a quick press that is abandoned is not a latching tap
        });
        fireEvent[ev](mic());
        expect(h.capture.stop).toHaveBeenCalledTimes(1);
        fireEvent.click(mic()); // a keyboard activation, not the click of the abandoned hold
        expect(h.capture.start).toHaveBeenCalledTimes(2);
        // and the abandoned press's late pointerup does nothing
        fireEvent.pointerUp(mic());
        expect(h.capture.stop).toHaveBeenCalledTimes(1);
      },
    );

    it("the pointerleave that follows a latched quick tap does not stop it", () => {
      view();
      hold(50);
      fireEvent.pointerLeave(mic());
      expect(h.capture.stop).not.toHaveBeenCalled();
    });
  });

  it("a miss reveals the word on the photo (overline, big term, Hear it) and not in a separate card", () => {
    view();
    say("zzzz");
    const panel = screen.getByTestId("stp-reveal");
    expect(panel.textContent).toContain("It is");
    expect(panel.textContent).toMatch(/word[a-z]/);
    expect(panel.querySelector("button")?.textContent).toBe("Hear it");
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    expect(h.model).toHaveBeenCalledTimes(2);
  });

  it("a win shows the combo chip counting the run of first-time wins", () => {
    view();
    const hits = drawRounds(h.words as PictureWord[], 8, () => 0).map((w) => w.term);
    say(hits[0]);
    expect(screen.getByTestId("stp-combo").textContent).toBe("First try");
    expect(screen.getByTestId("stp-tutor").textContent).toBe("First try. Brilliant!");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    say(hits[1]);
    expect(screen.getByTestId("stp-combo").textContent).toBe("2 in a row");
    // The bubble agrees with the chip, and the win is said once (the stage repeats nothing).
    expect(screen.getByTestId("stp-tutor").textContent).toBe("2 in a row!");
    expect(screen.queryAllByText(/Brilliant/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    say("zzzz"); // a miss breaks the run
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    say(hits[3]);
    expect(screen.getByTestId("stp-combo").textContent).toBe("First try");
  });

  it("a pointer released outside the ring does not swallow the next keyboard press", () => {
    view();
    const mic = screen.getByRole("button", { name: "Record your answer" });
    fireEvent.pointerDown(mic);
    fireEvent.pointerLeave(mic); // released elsewhere: no click follows
    expect(h.capture.stop).toHaveBeenCalledTimes(1);
    h.capture.start.mockClear();
    fireEvent.click(mic); // a keyboard Enter or Space
    expect(h.capture.start).toHaveBeenCalledTimes(1);
  });

  it("stops and sends the recording when the ring is full", () => {
    vi.useFakeTimers();
    try {
      h.capture.state = "recording";
      h.capture.stop.mockClear();
      view();
      act(() => {
        vi.advanceTimersByTime(MAX_RECORD_MS - 1);
      });
      expect(h.capture.stop).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      expect(MAX_RECORD_MS).toBe(6000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the review-deck save sends the model sentence when it holds the word", async () => {
    const save = vi.fn(async (i: { word: string; sentence: string }) => ({
      alreadySaved: false,
      word: i.word,
      sentence: i.sentence,
      explanation: "",
    }));
    h.words = (h.words as PictureWord[]).map((w) => ({
      ...w,
      example: `I like the ${w.term} a lot.`,
    }));
    render(
      withAiConsent(<SayThePicture course="en" onExit={() => {}} save={save} />, fakeConsentApi()),
    );
    for (let i = 0; i < 8; i++) {
      say("zzzz");
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next word" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Add them to your review deck" }));
    await screen.findByText(/words added/);
    expect(save.mock.calls[0][0].sentence).toBe(`I like the ${save.mock.calls[0][0].word} a lot.`);
  });

  describe("summary", () => {
    /** Plays 8 rounds: the words at `missAt` are missed, the rest said first time. */
    const play = (missAt: number[]) => {
      const hits = drawRounds(h.words as PictureWord[], 8, () => 0).map((w) => w.term);
      for (let i = 0; i < 8; i++) {
        if (missAt.includes(i)) {
          say("zzzz");
          fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next word" }));
        } else {
          say(hits[i]);
          fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next" }));
        }
      }
      return hits;
    };

    it("recaps the session's photos: first try carries the gold ring, a miss the retry mark", () => {
      view();
      const hits = play([1, 4]);
      const items = Array.from(screen.getByTestId("stp-recap").querySelectorAll("li"));
      expect(items).toHaveLength(8);
      expect(items.map((li) => li.getAttribute("data-result"))).toEqual([
        "first",
        "missed",
        "first",
        "first",
        "missed",
        "first",
        "first",
        "first",
      ]);
      expect(items[0].querySelector("span")?.className).toContain("ring-ds-action");
      expect(items[1].textContent).toContain("↺");
      expect(items[0].textContent).not.toContain("↺");
      expect(items[1].getAttribute("aria-label")).toBe(`${hits[1]}, missed`);
      expect(items[0].getAttribute("aria-label")).toBe(`${hits[0]}, said first time`);
    });

    it("'Say it right the ones you missed' opens Say it right with exactly the missed words", () => {
      view();
      const hits = play([1, 4]);
      fireEvent.click(screen.getByRole("button", { name: "Say it right the ones you missed" }));
      expect(screen.getByTestId("say-it-right").dataset.words).toBe(`${hits[1]},${hits[4]}`);
      fireEvent.click(screen.getByRole("button", { name: "back from drill" }));
      expect(screen.getByText("Practised 8 words")).toBeTruthy();
    });

    it("'Add them to your review deck' saves each missed word through the save-word call", async () => {
      const save = vi.fn(async (i: { word: string; sentence: string }) => ({
        alreadySaved: false,
        word: i.word,
        sentence: i.sentence,
        explanation: "",
      }));
      render(
        withAiConsent(
          <SayThePicture course="en" onExit={() => {}} save={save} />,
          fakeConsentApi(),
        ),
      );
      const hits = play([2, 5]);
      fireEvent.click(screen.getByRole("button", { name: "Add them to your review deck" }));
      await screen.findByText(/2 words added to your review deck/);
      expect(save.mock.calls.map((c) => c[0].word)).toEqual([hits[2], hits[5]]);
      expect(save.mock.calls[0][0]).toMatchObject({ course: "en", sentence: hits[2] });
      expect(screen.getByRole("button", { name: "Added to your review deck" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("says so when saving fails, and keeps the button usable", async () => {
      const { SavedWordError } = await import("@/lib/saved-word-client");
      const save = vi.fn(async () => {
        throw new SavedWordError("offline");
      });
      render(
        withAiConsent(
          <SayThePicture course="en" onExit={() => {}} save={save} />,
          fakeConsentApi(),
        ),
      );
      play([0]);
      fireEvent.click(screen.getByRole("button", { name: "Add them to your review deck" }));
      await screen.findByText("Saving a word needs a connection.");
      expect(screen.getByRole("button", { name: "Add them to your review deck" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("offers no cross-links when every word was said first time", () => {
      view();
      play([]);
      expect(screen.queryByRole("button", { name: /Say it right/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /review deck/ })).toBeNull();
    });
  });
});

describe("say-the-picture derived state", () => {
  it("maps state to pose", () => {
    expect(poseFor("ask", false)).toBe("explaining-pointer");
    expect(poseFor("ask", true)).toBe("listening-headphones");
    expect(poseFor("reveal", false)).toBe("thinking-temple");
    expect(poseFor("reveal", true)).toBe("listening-headphones");
    expect(poseFor("right", false)).toBe("levelup-cheer");
  });
  it("counts the trailing run of first-time wins", () => {
    expect(comboCount([])).toBe(0);
    expect(comboCount(["first", "missed", "first", "first"])).toBe(2);
    expect(comboCount(["first", "first", "missed"])).toBe(0);
  });
  it("lists the missed words in session order", () => {
    expect(missedWords(["a", "b", "c", "d"], ["first", "missed", "first", "missed"])).toEqual([
      "b",
      "d",
    ]);
  });
  it("saves the model sentence only when it holds the word", () => {
    expect(saveSentence({ term: "dog", example: "The dog runs." })).toBe("The dog runs.");
    expect(saveSentence({ term: "he", example: "The dog runs." })).toBe("he");
    expect(saveSentence({ term: "dog", example: "" })).toBe("dog");
  });
});
