// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportUser = vi.fn();
vi.mock("../lib/social-safety.functions", () => ({
  blockUser: vi.fn(),
  reportUser,
  reportTeamName: vi.fn(),
}));

const { SocialSafetyMenu } = await import("./SocialSafetyMenu");

function openReport() {
  fireEvent.click(screen.getByRole("button", { name: "More options for Bo" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Report user" }));
}

beforeEach(() => {
  reportUser.mockReset();
});

describe("SocialSafetyMenu report", () => {
  it("only says 'Report submitted' once the server accepted it", async () => {
    reportUser.mockResolvedValue({ ok: true });
    render(<SocialSafetyMenu userId="22222222-2222-4222-8222-222222222222" displayName="Bo" />);
    openReport();
    fireEvent.click(screen.getByRole("radio", { name: "Fake account" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Report submitted")).toBeInTheDocument();
    expect(reportUser).toHaveBeenCalledWith({
      data: { userId: "22222222-2222-4222-8222-222222222222", reason: "fake_account" },
    });
  });

  it("a refused report is never called submitted: it says so and can be tried again", async () => {
    reportUser.mockResolvedValue({ ok: false });
    render(<SocialSafetyMenu userId="22222222-2222-4222-8222-222222222222" displayName="Bo" />);
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't submit your report. Try again.",
    );
    expect(screen.queryByText("Report submitted")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
  });

  it("a network failure reads the same", async () => {
    reportUser.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SocialSafetyMenu userId="22222222-2222-4222-8222-222222222222" displayName="Bo" />);
    openReport();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(reportUser).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't submit your report. Try again.",
    );
  });

  it("opens the block question with a capital even for a generic name", () => {
    render(
      <SocialSafetyMenu
        userId="22222222-2222-4222-8222-222222222222"
        displayName="this opponent"
        blockTitle="Block this opponent?"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More options for this opponent" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
    expect(
      screen.getByText(/^This opponent won't be able to add you as a friend/),
    ).toBeInTheDocument();
  });
});
