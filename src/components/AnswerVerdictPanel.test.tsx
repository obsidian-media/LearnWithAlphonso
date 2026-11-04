// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerVerdictPanel } from "./AnswerVerdictPanel";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

function renderPanel(props: Partial<Parameters<typeof AnswerVerdictPanel>[0]> = {}) {
  const onContinue = vi.fn();
  render(
    <AnswerVerdictPanel
      correct={false}
      correctAnswer="water"
      explanation='"Hold water" = be logically sound.'
      continueLabel="Continue"
      onContinue={onContinue}
      {...props}
    />,
  );
  return onContinue;
}

describe("AnswerVerdictPanel", () => {
  it("a wrong answer: Not quite, the right answer, the explanation, and Alphonso encouraging", () => {
    renderPanel();
    const panel = screen.getByRole("status");
    expect(panel).toHaveAttribute("data-verdict", "wrong");
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Answer: water")).toBeInTheDocument();
    expect(screen.getByText('"Hold water" = be logically sound.')).toBeInTheDocument();
    expect(panel.querySelector("img")?.getAttribute("src")).toBe(
      "/mascots/alphonso-encouraging.png",
    );
    // Decorative: the words carry the verdict.
    expect(panel.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("a right answer: Correct!, no answer line, and Alphonso happy", () => {
    renderPanel({ correct: true });
    const panel = screen.getByRole("status");
    expect(panel).toHaveAttribute("data-verdict", "correct");
    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(screen.queryByText(/^Answer:/)).not.toBeInTheDocument();
    expect(panel.querySelector("img")?.getAttribute("src")).toBe("/mascots/alphonso-happy.png");
  });

  it("its button says what comes next and moves on", async () => {
    const onContinue = renderPanel({ continueLabel: "Finish" });
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("the button is the chunky kind that presses down", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Continue" }).className).toContain(
      "active:translate-y-1",
    );
  });

  it("an empty right answer adds no answer line", () => {
    renderPanel({ correctAnswer: "" });
    expect(screen.queryByText(/^Answer:/)).not.toBeInTheDocument();
  });

  it("Studio Ink keeps its own feedback look", () => {
    useTheme.setState({ theme: "studio-ink" });
    renderPanel();
    expect(screen.getByRole("status")).toHaveClass("border-l-rose-400");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});
