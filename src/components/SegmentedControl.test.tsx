// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./SegmentedControl";

const options: { value: "a" | "b" | "c"; label: string }[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("SegmentedControl", () => {
  it("renders a tab per option and marks the active one selected", () => {
    render(<SegmentedControl options={options} value="b" onChange={() => {}} ariaLabel="Demo" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange when a tab is clicked", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="a" onChange={onChange} ariaLabel="Demo" />);
    await userEvent.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves selection right/left with arrow keys, wrapping around", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="a" onChange={onChange} ariaLabel="Demo" />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("c"); // wraps to the last option

    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("jumps to first/last with Home/End", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="b" onChange={onChange} ariaLabel="Demo" />);
    screen.getByRole("tab", { name: "Beta" }).focus();
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });
});
