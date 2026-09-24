// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TranslateAnswer } from "./TranslateAnswer";
import type { Question } from "../data/curriculum";

const QUESTION: Extract<Question, { type: "translate" }> = {
  id: "q1",
  type: "translate",
  prompt: "Say you do not understand.",
  acceptableAnswers: ["I do not understand.", "I don't understand."],
  explanation: "One way to say it.",
};

function renderIt(props: Partial<React.ComponentProps<typeof TranslateAnswer>> = {}) {
  return render(
    <TranslateAnswer
      question={QUESTION}
      value={null}
      onChange={() => {}}
      checked={false}
      verdict={null}
      {...props}
    />,
  );
}

describe("TranslateAnswer", () => {
  it("keeps the accepted phrasings hidden until the learner has answered", () => {
    // Showing them up front would make producing English into copying it. The
    // prompt itself is rendered by the player, as the question heading, like
    // every other type -- this component deliberately does not repeat it.
    renderIt();
    expect(screen.getByLabelText("Your answer")).toBeTruthy();
    expect(screen.queryByText("I do not understand.")).toBeNull();
    expect(screen.queryByText("I don't understand.")).toBeNull();
  });

  it("reports what the learner types", () => {
    const onChange = vi.fn();
    renderIt({ onChange });
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "I dont get it" } });
    expect(onChange).toHaveBeenCalledWith("I dont get it");
  });

  it("shows one accepted phrasing after a wrong answer, as an example", () => {
    renderIt({
      value: "I am confused",
      checked: true,
      verdict: { correct: false, reason: null, source: "local" },
    });
    expect(screen.getByText(/I do not understand\./)).toBeTruthy();
  });

  it("passes on the grader's reason when there is one", () => {
    renderIt({
      value: "I am confused",
      checked: true,
      verdict: {
        correct: false,
        reason: "That says you are confused, not that you don't follow.",
        source: "ai",
      },
    });
    expect(screen.getByText(/That says you are confused/)).toBeTruthy();
  });

  it("says nothing about accepted phrasings when the answer was right", () => {
    renderIt({
      value: "I don't understand",
      checked: true,
      verdict: { correct: true, reason: null, source: "local" },
    });
    expect(screen.queryByText(/Also accepted/i)).toBeNull();
  });

  it("locks the field once the answer has been checked", () => {
    renderIt({ value: "I don't understand", checked: true, verdict: null });
    expect(screen.getByLabelText("Your answer").hasAttribute("disabled")).toBe(true);
  });
});
