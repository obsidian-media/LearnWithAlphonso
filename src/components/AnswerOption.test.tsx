// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerOption } from "./AnswerOption";

describe("AnswerOption", () => {
  it("calls onClick when not disabled", async () => {
    const onClick = vi.fn();
    render(
      <AnswerOption
        label="Paris"
        checked={false}
        isPicked={false}
        isRight={false}
        disabled={false}
        onClick={onClick}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled and inert when disabled is true", () => {
    render(
      <AnswerOption
        label="Paris"
        checked={false}
        isPicked={false}
        isRight={false}
        disabled={true}
        onClick={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Paris" })).toBeDisabled();
  });

  it("shows the correct styling once checked and this is the right answer", () => {
    render(
      <AnswerOption
        label="Paris"
        checked={true}
        isPicked={true}
        isRight={true}
        disabled={true}
        onClick={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveClass("border-ds-brand");
  });

  it("shows the incorrect styling once checked and this was the (wrong) pick", () => {
    render(
      <AnswerOption
        label="Berlin"
        checked={true}
        isPicked={true}
        isRight={false}
        disabled={true}
        onClick={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveClass("border-rose-400");
  });
  it("is a chunky tile that presses down, at least 56 px tall", () => {
    render(
      <AnswerOption
        label="ascertain"
        checked={false}
        isPicked={false}
        isRight={false}
        disabled={false}
        onClick={() => {}}
      />,
    );
    const tile = screen.getByRole("button");
    expect(tile).toHaveClass(
      "min-h-14",
      "active:translate-y-1",
      "active:shadow-none",
      "motion-reduce:transition-none",
    );
    expect(tile.className).toContain("shadow-[0_4px_0_0_");
  });

  it("a picked tile says so, to assistive tech too", () => {
    render(
      <AnswerOption
        label="ascertain"
        checked={false}
        isPicked
        isRight={false}
        disabled={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveClass("border-ds-brand");
  });
});
