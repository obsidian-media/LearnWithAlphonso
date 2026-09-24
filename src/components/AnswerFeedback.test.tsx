// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnswerFeedback } from "./AnswerFeedback";
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
