// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const blockUser = vi.fn();
vi.mock("../lib/social-safety.functions", () => ({ blockUser, reportUser: vi.fn() }));

const { SocialSafetyMenu } = await import("./SocialSafetyMenu");

function openBlockDialog() {
  fireEvent.click(screen.getByRole("button", { name: "More options for Bo" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
}

// Braces matter: a function returned from beforeEach runs as teardown, and mockReset returns the mock.
beforeEach(() => {
  blockUser.mockReset();
});

describe("SocialSafetyMenu block", () => {
  it("closes and reports success when the server accepts the block", async () => {
    const onBlocked = vi.fn();
    blockUser.mockResolvedValue({ ok: true, message: "blocked" });
    render(<SocialSafetyMenu userId="u2" displayName="Bo" onBlocked={onBlocked} />);
    openBlockDialog();
    await waitFor(() => expect(onBlocked).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
  });

  it("a refused block keeps the dialog open and says so", async () => {
    const onBlocked = vi.fn();
    blockUser.mockResolvedValue({ ok: false, message: "server-error" });
    render(<SocialSafetyMenu userId="u2" displayName="Bo" onBlocked={onBlocked} />);
    openBlockDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't block Bo. Try again.");
    expect(screen.getByRole("button", { name: "Block" })).not.toBeDisabled();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("a network failure keeps the dialog open with the connection copy", async () => {
    blockUser.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SocialSafetyMenu userId="u2" displayName="Bo" />);
    openBlockDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });
});
