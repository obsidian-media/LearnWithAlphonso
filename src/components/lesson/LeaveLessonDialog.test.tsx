// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaveLessonDialog } from "./LeaveLessonDialog";

describe("LeaveLessonDialog", () => {
  it("asks before the lesson is thrown away, with Keep going first", () => {
    render(<LeaveLessonDialog onStay={() => {}} onLeave={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Leave this lesson?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep going" })).toHaveFocus();
  });

  it("only leaves on the explicit button; Escape keeps going", async () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<LeaveLessonDialog onStay={onStay} onLeave={onLeave} />);
    await user.keyboard("{Escape}");
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Leave lesson" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
