// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionDialog } from "./ActionDialog";

const props = { learnerLabel: "Ada", busy: false, error: null, onCancel: () => {} };

describe("ActionDialog", () => {
  it("a reason of 3 or more characters is required before a block can be submitted", async () => {
    const onSubmit = vi.fn();
    render(<ActionDialog {...props} action="block" onSubmit={onSubmit} />);
    const submit = screen.getByRole("button", { name: "Block" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Reason/), "ab");
    expect(submit.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Reason/), "c");
    expect(submit.disabled).toBe(false);
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ reason: "abc" }));
  });

  it("ban and delete also require the learner's email to be typed", async () => {
    for (const action of ["ban", "delete"] as const) {
      const { unmount } = render(<ActionDialog {...props} action={action} onSubmit={() => {}} />);
      await userEvent.type(screen.getByLabelText(/Reason/), "a good reason");
      const submit = screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("type") === "submit") as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
      expect(submit.disabled).toBe(false);
      unmount();
    }
  });

  it("block does not ask for an email; a gift asks for the number of days", async () => {
    const { unmount } = render(<ActionDialog {...props} action="block" onSubmit={() => {}} />);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    unmount();
    render(<ActionDialog {...props} action="gift" onSubmit={() => {}} />);
    expect(screen.getByLabelText(/Days of Pro/)).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
  });

  it("shows the server's refusal", () => {
    render(
      <ActionDialog
        {...props}
        action="ban"
        error="Type the learner's email to confirm."
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Type the learner's email to confirm.");
  });
});
