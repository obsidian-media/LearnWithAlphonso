// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SpeakAnswer } from "./SpeakAnswer";

const capture = vi.hoisted(() => ({
  state: "idle" as "idle" | "recording" | "transcribing",
  error: null as string | null,
  canRecord: true,
  start: vi.fn(),
  stop: vi.fn(),
  clearError: vi.fn(),
  onTranscript: null as ((text: string, confidence: number | null) => void) | null,
}));

vi.mock("../lib/use-speech-capture", () => ({
  useSpeechCapture: ({ onTranscript }: { onTranscript: (t: string, c: number | null) => void }) => {
    capture.onTranscript = onTranscript;
    return capture;
  },
}));

vi.mock("../lib/speech", () => ({
  canSpeak: () => true,
  speak: vi.fn(),
}));

beforeEach(() => {
  capture.state = "idle";
  capture.error = null;
  capture.canRecord = true;
  capture.start.mockClear();
  capture.stop.mockClear();
});

describe("SpeakAnswer", () => {
  it("shows the phrase to say and a way to hear it", () => {
    render(
      <SpeakAnswer
        target="She's a doctor."
        locale="en-US"
        value={null}
        onChange={() => {}}
        checked={false}
      />,
    );
    expect(screen.getByText("She's a doctor.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hear it/i })).toBeTruthy();
  });

  it("reports the transcript to the caller rather than grading it itself", () => {
    // Auto-grading on the transcript would take a heart for a mishearing the
    // learner never got a chance to correct. The caller stores it; the learner
    // presses Check.
    const onChange = vi.fn();
    render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value={null}
        onChange={onChange}
        checked={false}
      />,
    );
    capture.onTranscript?.("good morning", 0.9);
    expect(onChange).toHaveBeenCalledWith("good morning");
  });

  it("shows the captured transcript back so a mishearing can be redone", () => {
    render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value="good mourning"
        onChange={() => {}}
        checked={false}
      />,
    );
    expect(screen.getByText("good mourning")).toBeTruthy();
    expect(screen.getByText(/say it again/i)).toBeTruthy();
  });

  it("starts and stops the recorder from the same control", () => {
    const { rerender } = render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value={null}
        onChange={() => {}}
        checked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /record your answer/i }));
    expect(capture.start).toHaveBeenCalled();

    capture.state = "recording";
    rerender(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value={null}
        onChange={() => {}}
        checked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    expect(capture.stop).toHaveBeenCalled();
  });

  it("surfaces a capture error instead of silently failing", () => {
    capture.error = "Microphone access is needed to speak.";
    render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value={null}
        onChange={() => {}}
        checked={false}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/microphone/i);
  });

  it("falls back to typing where the device cannot record", () => {
    // A question that cannot be answered is a lesson that cannot be completed
    // -- the server expects an answer for every question, so the learner would
    // finish and silently receive no XP, streak or unlock.
    capture.canRecord = false;
    const onChange = vi.fn();
    render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value={null}
        onChange={onChange}
        checked={false}
      />,
    );
    const input = screen.getByLabelText("Type the phrase");
    fireEvent.change(input, { target: { value: "good morning" } });
    expect(onChange).toHaveBeenCalledWith("good morning");
  });

  it("locks the control once the answer has been checked", () => {
    render(
      <SpeakAnswer
        target="Good morning."
        locale="en-US"
        value="good morning"
        onChange={() => {}}
        checked
      />,
    );
    expect(
      screen.getByRole("button", { name: /record your answer/i }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
