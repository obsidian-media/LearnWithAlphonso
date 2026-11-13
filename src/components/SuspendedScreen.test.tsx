// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut } } }));

const { SuspendedScreen } = await import("./SuspendedScreen");
const { useAccountStatus } = await import("../lib/account-suspended");

describe("SuspendedScreen", () => {
  it("says the account is suspended and shows the support address as a mail link", () => {
    render(<SuspendedScreen />);
    expect(screen.getByRole("heading", { name: "This account is suspended." })).toBeTruthy();
    const link = screen.getByRole("link", { name: "support@alphonsoecosystem.app" });
    expect(link.getAttribute("href")).toBe("mailto:support@alphonsoecosystem.app");
    expect(screen.getByText(/If you think this is a mistake, contact support at/)).toBeTruthy();
  });

  it("signing out clears the suspended state so another account can sign in", async () => {
    useAccountStatus.setState({ suspended: true });
    render(<SuspendedScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    expect(useAccountStatus.getState().suspended).toBe(false);
  });
});
