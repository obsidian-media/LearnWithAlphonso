// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReasonDialog } from "./ReasonDialog";

afterEach(() => cleanup());

const dialog = (onCancel: () => void, busy = false) => (
  <ReasonDialog
    title="Resolve this ticket"
    confirmLabel="Go"
    busy={busy}
    error={null}
    onCancel={onCancel}
    onSubmit={() => {}}
  />
);

describe("ReasonDialog focus", () => {
  it("moves focus into the reason box once, on open", () => {
    render(dialog(() => {}));
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("does not pull focus back when the parent re-renders with a new onCancel (the 30-second tick)", () => {
    const view = render(dialog(() => {}));
    expect(document.activeElement).toBe(screen.getByRole("textbox")); // moved in on open
    screen.getByRole("button", { name: "Cancel" }).focus(); // the person moves on
    view.rerender(dialog(() => {}));
    view.rerender(dialog(() => {}, false));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("Escape calls the LATEST onCancel, and not while busy", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const view = render(dialog(first));
    view.rerender(dialog(second));
    await user.keyboard("{Escape}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    view.rerender(dialog(second, true));
    await user.keyboard("{Escape}");
    expect(second).toHaveBeenCalledTimes(1);
  });
});
