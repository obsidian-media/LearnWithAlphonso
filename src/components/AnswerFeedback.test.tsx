// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerFeedback } from "./AnswerFeedback";
import { SaveWordProvider } from "./SaveWord";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

describe("AnswerFeedback", () => {
  it("shows the headline and explanation", () => {
    render(<AnswerFeedback correct headline="Nice!" explanation="That's right." />);
    expect(screen.getByText("Nice!")).toBeInTheDocument();
    expect(screen.getByText("That's right.")).toBeInTheDocument();
  });

  it("uses a moss accent when correct", () => {
    render(<AnswerFeedback correct headline="Nice!" explanation="e" />);
    expect(screen.getByRole("status")).toHaveClass("border-moss/40");
  });

  it("uses a rose accent when incorrect", () => {
    render(<AnswerFeedback correct={false} headline="Not quite" explanation="e" />);
    expect(screen.getByRole("status")).toHaveClass("border-rose-300");
  });

  it("uses a left-bar accent in the Studio Ink theme", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<AnswerFeedback correct headline="Nice!" explanation="e" />);
    expect(screen.getByRole("status")).toHaveClass("border-l-moss");
  });

  it("shows Alphonso when the answer is incorrect", () => {
    render(<AnswerFeedback correct={false} headline="Not quite" explanation="e" />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });

  it("does not show Alphonso when the answer is correct", () => {
    render(<AnswerFeedback correct headline="Nice!" explanation="e" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows Alphonso on wrong answers in the Studio Ink theme too", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<AnswerFeedback correct={false} headline="Not quite" explanation="e" />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });
});

describe("AnswerFeedback saving words", () => {
  const wrapped = (course: string | undefined) =>
    render(
      <SaveWordProvider>
        <AnswerFeedback
          correct={false}
          headline="Not quite."
          explanation="Use the past tense."
          saveCourse={course}
        />
      </SaveWordProvider>,
    );

  it("makes the explanation's words tappable in the English course", () => {
    wrapped("en");
    expect(screen.getByRole("button", { name: "past" })).toBeInTheDocument();
    // The headline is Alphonso's verdict, not text to save from.
    expect(screen.queryByRole("button", { name: "quite" })).not.toBeInTheDocument();
  });

  it("leaves French and Spanish explanations plain, with no hint about tapping", () => {
    window.localStorage.clear();
    wrapped("fr");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Use the past tense.")).toBeInTheDocument();
    // A hint for words that cannot be tapped would be a promise the page breaks.
    expect(screen.queryByText(/tap a word to save it/i)).not.toBeInTheDocument();
  });

  it("stays plain when the page did not say which course it is", () => {
    wrapped(undefined);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("tells the learner the words are tappable", () => {
    window.localStorage.clear();
    wrapped("en");
    expect(screen.getByText(/tap a word to save it/i)).toBeInTheDocument();
  });
});
