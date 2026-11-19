// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { SayItRight } from "./SayItRight";
import { learnedWordPool } from "@/lib/pronunciation";
import { useProgress } from "@/lib/progress";
import { getCourse } from "@/data/courses";

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
const view = (consent = fakeConsentApi()) =>
  render(withAiConsent(<SayItRight course="en" onExit={() => {}} />, consent));
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
    expect(screen.getByText("Great!")).toBeTruthy();
    expect(h.model).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("almost: a middling match says so, replays the model and allows a retry", () => {
    view();
    const w = shownWord();
    say(w, 0.7);
    expect(screen.getByText(/Almost - say it a touch clearer/)).toBeTruthy();
    expect(h.model).toHaveBeenCalledWith(w);
    expect(screen.getByRole("button", { name: "Record your answer" })).toBeTruthy();
    expect(screen.getByText("Word 1 of 8")).toBeTruthy();
  });

  it("try again: no match replays the model and allows a retry", () => {
    view();
    const w = shownWord();
    say("zzzz", 0.99);
    expect(screen.getByText("Let's try again.")).toBeTruthy();
    expect(h.model).toHaveBeenCalledWith(w);
  });

  it("try again: a low-confidence match is also a retry", () => {
    view();
    say(shownWord(), 0.3);
    expect(screen.getByText("Let's try again.")).toBeTruthy();
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
    expect(
      screen.getByText(
        "0 of 8 said clearly first time. Every word you say out loud sticks a little more.",
      ),
    ).toBeTruthy();
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

  it("introduces no new quota kind", async () => {
    const fs = await import("node:fs");
    const quota = fs.readFileSync("src/lib/ai-quota.server.ts", "utf8");
    expect(quota).not.toMatch(/say.?it.?right|pronunciation/i);
    for (const f of ["src/components/practice/SayItRight.tsx", "src/lib/pronunciation.ts"])
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/authorizeAiRequest|AiKind/);
  });
});
