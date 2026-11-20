// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { SayItRight } from "./SayItRight";
import { learnedWordPool } from "@/lib/pronunciation";
import { useProgress } from "@/lib/progress";
import { getCourse } from "@/data/courses";
import {
  BUBBLE,
  LATCH_MS,
  MAX_RECORD_MS,
  MOVE_ON,
  PRAISE,
  nextLineIndex,
  poseFor,
} from "@/lib/say-it-right";

const h = vi.hoisted(() => ({
  capture: {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    canRecord: true,
    start: vi.fn(),
    stop: vi.fn(),
    onTranscript: null as ((t: string, c: number | null) => void) | null,
    course: undefined as string | undefined,
  },
  model: vi.fn(),
}));

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
vi.mock("@/lib/use-model-speech", () => ({ useModelSpeech: () => h.model }));

const lessonIds = () =>
  getCourse("en")
    .curriculum.flatMap((u) => u.lessons)
    .map((l) => l.id);
const learnMany = () => useProgress.setState({ completedLessons: lessonIds().slice(0, 12) });

const say = (t: string, c: number | null) => act(() => h.capture.onTranscript?.(t, c));
const view = (consent = fakeConsentApi(), pick?: () => number) =>
  render(withAiConsent(<SayItRight course="en" onExit={() => {}} pick={pick} />, consent));
const pose = () => document.querySelector("[data-say-it-right]")?.getAttribute("data-pose");
const line = () => screen.getByTestId("sir-line").textContent ?? "";
const shownWord = () => document.querySelector("p[lang]")?.textContent ?? "";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  learnMany();
  Object.assign(h.capture, { state: "idle", error: null, canRecord: true });
  h.capture.start.mockClear();
  h.model.mockClear();
});

describe("Say it right", () => {
  it("shows the word, a Hear it button and a record button; speech goes through the speak capture", () => {
    view();
    expect(screen.getByText("Word 1 of 8")).toBeTruthy();
    expect(shownWord()).not.toBe("");
    expect(screen.getByRole("button", { name: "Hear it" })).toBeTruthy();
    expect(h.capture.course).toBe("en");
    fireEvent.click(screen.getByRole("button", { name: "Record your answer" }));
    expect(h.capture.start).toHaveBeenCalled();
  });

  it("seeded with exactly one word it drills that word, with no 'learn a few words first' gate", () => {
    useProgress.setState({ completedLessons: [] });
    const words = [{ term: "bike", meaning: "", example: "" }];
    render(
      withAiConsent(<SayItRight course="en" words={words} onExit={() => {}} />, fakeConsentApi()),
    );
    expect(screen.getByText("Word 1 of 1")).toBeTruthy();
    expect(shownWord()).toBe("bike");
    expect(screen.queryByText(/Learn a few words first/)).toBeNull();
  });

  it("Hear it plays the model for the shown word", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    expect(h.model).toHaveBeenCalledWith(shownWord());
  });

  it("great: a confident match shows Great and a star-earning Next, no model replay", () => {
    view();
    say(shownWord(), 0.95);
    expect(PRAISE.great).toContain(line());
    expect(h.model).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("almost: a middling match says so, replays the model and allows a retry", () => {
    view();
    const w = shownWord();
    say(w, 0.7);
    expect(screen.getByText(PRAISE.almost[0])).toBeTruthy();
    expect(h.model).toHaveBeenCalledWith(w);
    expect(screen.getByRole("button", { name: "Record your answer" })).toBeTruthy();
    expect(screen.getByText("Word 1 of 8")).toBeTruthy();
  });

  it("try again: no match replays the model and allows a retry", () => {
    view();
    const w = shownWord();
    say("zzzz", 0.99);
    expect(screen.getByText(PRAISE.again[0])).toBeTruthy();
    expect(h.model).toHaveBeenCalledWith(w);
  });

  it("try again: a low-confidence match is also a retry", () => {
    view();
    say(shownWord(), 0.3);
    expect(screen.getByText(PRAISE.again[0])).toBeTruthy();
  });

  it("after the one retry the round moves on whatever the result, with no heart or penalty", () => {
    view();
    say("zzzz", 0.9);
    say("zzzz", 0.9);
    expect(screen.getByText(/Good try/)).toBeTruthy();
    expect(screen.queryByText(/heart/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("a retry that lands says Great but the first-attempt count stays low", () => {
    view();
    for (let i = 0; i < 8; i++) {
      say("zzzz", 0.9);
      say(shownWord(), 0.95);
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next" }));
    }
    expect(screen.getByTestId("sir-clearly").textContent).toBe("0 of 8 clearly");
    expect(screen.getByRole("img", { name: "1 of 3 stars" })).toBeTruthy();
  });

  it("runs 8 rounds then a PracticeStars summary", () => {
    view();
    for (let i = 0; i < 8; i++) {
      say(shownWord(), 0.95);
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next" }));
    }
    expect(screen.getByText("Practised 8 words")).toBeTruthy();
    expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeTruthy();
  });

  it("Hear it stays available when this device cannot record, and the round can still move on", () => {
    h.capture.canRecord = false;
    view();
    expect(screen.getByRole("status").textContent).toMatch(/microphone/i);
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    expect(h.model).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip this word" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("Hear it stays available when AI consent is off", () => {
    view(fakeConsentApi(null));
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hear it" })).toBeTruthy();
  });

  it("shows 'learn a few words first' with too few learned words, without crashing", () => {
    for (const ids of [[], lessonIds().slice(0, 0)]) {
      useProgress.setState({ completedLessons: ids });
      const { unmount } = view();
      expect(screen.getByText(/Learn a few words first/)).toBeTruthy();
      unmount();
    }
  });

  it("the pool is LIVE: a session shows only learned words, and learning more lets the next session start", () => {
    useProgress.setState({ completedLessons: [] });
    const empty = view();
    expect(screen.getByText(/Learn a few words first/)).toBeTruthy();
    empty.unmount();
    const learned = lessonIds().slice(0, 12);
    useProgress.setState({ completedLessons: learned });
    const pool = learnedWordPool("en", learned).map((x) => x.term);
    const unlearned = learnedWordPool("en", lessonIds().slice(12, 40))
      .map((x) => x.term)
      .filter((t) => !pool.includes(t));
    expect(unlearned.length).toBeGreaterThan(0);
    view();
    for (let i = 0; i < 8; i++) {
      const w = shownWord();
      expect(pool).toContain(w);
      expect(unlearned).not.toContain(w);
      say(w, 0.95);
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next" }));
    }
  });

  it("asking: Alphonso explains, the bubble holds the prompt and the word, and Hear it", () => {
    view(fakeConsentApi(), () => 0);
    expect(pose()).toBe("explaining-pointer");
    expect(line()).toBe(BUBBLE.ask);
    expect(screen.getByTestId("sir-tutor").textContent).toContain(shownWord());
    expect(screen.getByTestId("sir-tutor").textContent).toContain("Hear it");
  });

  it("recording: Alphonso listens and the bubble says so", () => {
    h.capture.state = "recording";
    view();
    expect(pose()).toBe("listening-headphones");
    expect(line()).toBe(BUBBLE.listening);
  });

  it("a miss thinks, the retry bubble says so, and a win alternates cheer and impressed", () => {
    view(fakeConsentApi(), () => 0);
    say("zzzz", 0.9);
    expect(pose()).toBe("thinking-temple");
    expect(screen.getByText(BUBBLE.retry)).toBeTruthy();
    say(shownWord(), 0.95);
    expect(pose()).toBe("levelup-cheer");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    say(shownWord(), 0.95);
    expect(pose()).toBe("surprised-impressed");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    say("zzzz", 0.9);
    say("zzzz", 0.9);
    expect(pose()).toBe("thinking-temple");
    expect(line()).toBe(MOVE_ON);
  });

  it("praise varies: the same line is never said twice in a row, whatever the roll", () => {
    view(fakeConsentApi(), () => 0);
    let prev = "";
    for (let i = 0; i < 6; i++) {
      say(shownWord(), 0.95);
      const l = line();
      expect(PRAISE.great).toContain(l);
      expect(l).not.toBe(prev);
      prev = l;
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
  });

  it("never says wrong anywhere in the round", () => {
    view();
    say("zzzz", 0.9);
    expect(document.body.textContent).not.toMatch(/wrong/i);
    say("zzzz", 0.9);
    expect(document.body.textContent).not.toMatch(/wrong/i);
    for (const bank of Object.values(PRAISE)) for (const l of bank) expect(l).not.toMatch(/wrong/i);
  });

  it("the mic is blue at rest and red while recording, and says its state", () => {
    const { unmount } = view();
    const rest = screen.getByTestId("sir-mic");
    expect(rest.getAttribute("data-recording")).toBe("false");
    expect(rest.innerHTML).toContain("bg-ds-choice");
    expect(rest.innerHTML).not.toContain("bg-ds-wrong");
    unmount();
    h.capture.state = "recording";
    view();
    const rec = screen.getByTestId("sir-mic");
    expect(rec.getAttribute("data-recording")).toBe("true");
    expect(rec.getAttribute("aria-pressed")).toBe("true");
    expect(rec.getAttribute("aria-label")).toBe("Stop recording");
    expect(rec.innerHTML).toContain("bg-ds-wrong");
  });

  describe("the mic: hold to talk, or tap to start and tap to stop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const hold = (ms: number, mic: HTMLElement) => {
      fireEvent.pointerDown(mic);
      act(() => {
        vi.advanceTimersByTime(ms);
      });
      fireEvent.pointerUp(mic);
    };

    it("a long hold starts on press and stops on release; the click after it is swallowed", () => {
      view();
      h.capture.stop.mockClear();
      const mic = screen.getByTestId("sir-mic");
      fireEvent.pointerDown(mic);
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(LATCH_MS + 1);
      });
      fireEvent.pointerUp(mic);
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      fireEvent.click(mic); // the click that follows a hold is swallowed
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      fireEvent.click(mic); // a keyboard press toggles on
      expect(h.capture.start).toHaveBeenCalledTimes(2);
    });

    it("a quick tap latches the recording on, and a second tap stops it", () => {
      view();
      h.capture.stop.mockClear();
      const mic = screen.getByTestId("sir-mic");
      hold(50, mic);
      fireEvent.click(mic); // swallowed
      expect(h.capture.start).toHaveBeenCalledTimes(1);
      expect(h.capture.stop).not.toHaveBeenCalled(); // latched: still recording
      // The recording is now on; the second tap stops it.
      h.capture.state = "recording";
      cleanup();
      view();
      h.capture.start.mockClear();
      fireEvent.pointerDown(screen.getByTestId("sir-mic"));
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      expect(h.capture.start).not.toHaveBeenCalled();
      fireEvent.pointerUp(screen.getByTestId("sir-mic"));
      fireEvent.click(screen.getByTestId("sir-mic")); // swallowed, not a second toggle
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
      expect(h.capture.start).not.toHaveBeenCalled();
    });

    it("a latched recording still auto-stops at the cap", () => {
      view();
      h.capture.stop.mockClear();
      hold(50, screen.getByTestId("sir-mic"));
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
        h.capture.stop.mockClear();
        const mic = screen.getByTestId("sir-mic");
        fireEvent.pointerDown(mic);
        act(() => {
          vi.advanceTimersByTime(20); // a quick press that is abandoned is not a latching tap
        });
        fireEvent[ev](mic);
        expect(h.capture.stop).toHaveBeenCalledTimes(1);
        fireEvent.click(mic); // a keyboard activation, not the click of the abandoned hold
        expect(h.capture.start).toHaveBeenCalledTimes(2);
        // and the abandoned press's late pointerup does nothing
        fireEvent.pointerUp(mic);
        expect(h.capture.stop).toHaveBeenCalledTimes(1);
      },
    );

    it("the pointerleave that follows a latched quick tap does not stop it", () => {
      view();
      h.capture.stop.mockClear();
      const mic = screen.getByTestId("sir-mic");
      hold(50, mic);
      fireEvent.pointerLeave(mic);
      expect(h.capture.stop).not.toHaveBeenCalled();
    });
  });

  it("the pose hides at large text and narrow widths (rem-based, like iOS and Android), and only one live region speaks", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/practice/SayItRight.tsx", "utf8");
    expect(src).toMatch(/hidden shrink-0 min-\[20rem\]:block/);
    expect(src.match(/aria-live=/g)?.length).toBe(1);
    view();
    expect(screen.getByTestId("sir-line").getAttribute("aria-live")).toBe("polite");
    expect(document.getElementById("sir-hint")?.getAttribute("aria-live")).toBeNull();
  });

  it("auto-stops a recording at the cap", () => {
    vi.useFakeTimers();
    try {
      h.capture.state = "recording";
      h.capture.stop.mockClear();
      view();
      expect(h.capture.stop).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(MAX_RECORD_MS - 1);
      });
      expect(h.capture.stop).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(h.capture.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("one retry on a miss, then it moves on, and the wrap counts the clear ones", () => {
    view();
    for (let i = 0; i < 8; i++) {
      if (i < 3) say(shownWord(), 0.95);
      else {
        say("zzzz", 0.9);
        expect(screen.queryByRole("button", { name: "Next" })).toBeNull(); // still on the retry
        say("zzzz", 0.9);
      }
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next" }));
    }
    expect(screen.getByTestId("sir-clearly").textContent).toBe("3 of 8 clearly");
    expect(pose()).toBe("levelup-cheer");
    expect(screen.getByRole("button", { name: "Practise more" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("a 1-word seed runs a full round and Back returns to the caller", () => {
    useProgress.setState({ completedLessons: [] });
    const onExit = vi.fn();
    render(
      withAiConsent(
        <SayItRight
          course="en"
          words={[{ term: "bike", meaning: "", example: "" }]}
          onExit={onExit}
        />,
        fakeConsentApi(),
      ),
    );
    say("bike", 0.95);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByTestId("sir-clearly").textContent).toBe("1 of 1 clearly");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onExit).toHaveBeenCalled();
  });

  it("introduces no new quota kind", async () => {
    const fs = await import("node:fs");
    const quota = fs.readFileSync("src/lib/ai-quota.server.ts", "utf8");
    expect(quota).not.toMatch(/say.?it.?right|pronunciation/i);
    for (const f of ["src/components/practice/SayItRight.tsx", "src/lib/pronunciation.ts"])
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/authorizeAiRequest|AiKind/);
  });
});

describe("say-it-right derived state", () => {
  it("nextLineIndex never returns the last index and stays in range for every roll", () => {
    for (const size of [2, 3, 5]) {
      for (let last = 0; last < size; last++) {
        for (const roll of [0, 0.2, 0.5, 0.99, 1]) {
          const i = nextLineIndex(size, last, roll);
          expect(i).not.toBe(last);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(size);
        }
      }
    }
    expect(nextLineIndex(1, 0, 0.5)).toBe(0);
    expect(nextLineIndex(3, null, 0)).toBe(0);
  });

  it("poseFor maps each state", () => {
    expect(poseFor("ask", false, null, 0)).toBe("explaining-pointer");
    expect(poseFor("ask", true, null, 0)).toBe("listening-headphones");
    expect(poseFor("retry", false, "almost", 0)).toBe("thinking-temple");
    expect(poseFor("result", false, "great", 1)).toBe("levelup-cheer");
    expect(poseFor("result", false, "great", 2)).toBe("surprised-impressed");
    expect(poseFor("result", false, "again", 2)).toBe("thinking-temple");
  });
});
