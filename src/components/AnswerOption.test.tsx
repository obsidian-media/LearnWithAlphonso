// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerOption } from "./AnswerOption";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

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
    expect(screen.getByRole("button")).toHaveClass("border-moss");
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

  it("renders the Studio Ink variant with a left border indicator", () => {
    useTheme.setState({ theme: "studio-ink" });
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
    expect(screen.getByRole("button")).toHaveClass("border-l-moss");
  });
});
