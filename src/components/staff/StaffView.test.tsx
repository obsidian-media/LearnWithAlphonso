// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffView, type StaffRow } from "./StaffView";
import { SCOPES } from "../../lib/staff-scopes";

const ME = "00000000-0000-4000-8000-0000000000a1";
const ALEX = "00000000-0000-4000-8000-0000000000b1";
const rows: StaffRow[] = [
  {
    userId: ME,
    displayName: "Sam",
    role: "owner",
    scopes: [],
    disabled: false,
    addedAt: "2026-10-02",
  },
  {
    userId: ALEX,
    displayName: "Alex",
    role: "support",
    scopes: ["users.read"],
    disabled: false,
    addedAt: "2026-10-09",
  },
];

function setup() {
  const onUpdate = vi.fn();
  const onAdd = vi.fn();
  const prompt = vi.spyOn(window, "prompt");
  render(
    <StaffView rows={rows} myId={ME} error={null} busy={false} onAdd={onAdd} onUpdate={onUpdate} />,
  );
  return { onUpdate, onAdd, prompt };
}

describe("StaffView reason dialog", () => {
  it("Disable opens the reason dialog (not the browser prompt) and refuses under 3 characters", async () => {
    const { onUpdate, prompt } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = screen.getByRole("dialog", { name: "Reason for disabling" });
    const confirm = within(dialog).getByRole("button", { name: "Disable" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "ab");
    expect(confirm.disabled).toBe(true);
    await userEvent.click(confirm);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("sends the typed reason with the change", async () => {
    const { onUpdate } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Left the team");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disable" }));
    expect(onUpdate).toHaveBeenCalledWith({
      userId: ALEX,
      disabled: true,
      reason: "Left the team",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel changes nothing", async () => {
    const { onUpdate } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ticking a scope asks for a reason first and sends the new scope list with it", async () => {
    const { onUpdate } = setup();
    await userEvent.click(screen.getByLabelText("users.notes"));
    expect(onUpdate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Reason for this change" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "needs notes");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    expect(onUpdate).toHaveBeenCalledWith({
      userId: ALEX,
      scopes: ["users.read", "users.notes"],
      reason: "needs notes",
    });
  });

  it("a disabled person offers Enable with its own title", async () => {
    const onUpdate = vi.fn();
    render(
      <StaffView
        rows={[rows[0]!, { ...rows[1]!, disabled: true }]}
        myId={ME}
        error={null}
        busy={false}
        onAdd={() => {}}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(screen.getByRole("dialog", { name: "Reason for enabling" })).toBeTruthy();
  });
});

describe("StaffView scopes", () => {
  it("offers every scope from SCOPES except staff.manage, and the owner row has no boxes", () => {
    setup();
    const boxes = screen.getAllByRole("checkbox").map((b) => b.getAttribute("id") ?? "");
    expect(boxes.length).toBe(SCOPES.length - 1);
    for (const scope of SCOPES) {
      if (scope === "staff.manage") expect(screen.queryByLabelText(scope)).toBeNull();
      else expect(screen.getByLabelText(scope)).toBeTruthy();
    }
  });
});
