// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SCOPES, SCOPES } from "../../lib/staff-scopes";
import { UserActionButtons } from "./UserActionButtons";

const facts = {
  pro: { active: false, source: "none" as const, until: null, unavailable: false },
  restrictions: [],
};

describe("UserActionButtons", () => {
  it("shows only the buttons the scopes allow (support sees Block, not Delete, Ban or Give Pro)", () => {
    render(<UserActionButtons scopes={DEFAULT_SCOPES.support} facts={facts} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "Block" })).toBeTruthy();
    for (const hidden of ["Delete account", "Ban", "Give Pro"]) {
      expect(screen.queryByRole("button", { name: hidden })).toBeNull();
    }
  });

  it("the owner sees all of them", () => {
    render(<UserActionButtons scopes={[...SCOPES]} facts={facts} onAction={() => {}} />);
    for (const shown of ["Give Pro", "Block", "Ban", "Delete account"]) {
      expect(screen.getByRole("button", { name: shown })).toBeTruthy();
    }
  });

  it("clicking a button reports which action was chosen", async () => {
    const onAction = vi.fn();
    render(<UserActionButtons scopes={[...SCOPES]} facts={facts} onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Ban" }));
    expect(onAction).toHaveBeenCalledWith("ban");
  });

  it("with no allowed action it says so instead of showing an empty row", () => {
    render(<UserActionButtons scopes={["users.read"]} facts={facts} onAction={() => {}} />);
    expect(screen.getByText("No actions are available to you.")).toBeTruthy();
  });
});
