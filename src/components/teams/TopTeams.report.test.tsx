// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const reportTeamName = vi.fn();
vi.mock("../../lib/social-safety.functions", () => ({
  blockUser: vi.fn(),
  reportUser: vi.fn(),
  reportTeamName,
}));

const { TopTeams } = await import("./TeamParts");

const ROWS = [
  { teamId: "33333333-3333-4333-8333-333333333333", name: "Night Owls", weeklyXp: 900 },
  { teamId: "44444444-4444-4444-8444-444444444444", name: "Early Birds", weeklyXp: 700 },
];

beforeEach(() => {
  reportTeamName.mockReset().mockResolvedValue({ ok: true, reason: null });
});

describe("Report a team name", () => {
  it("every team has a menu with the one entry, Report team name (no block: a name has no person)", () => {
    render(<TopTeams loading={false} rows={ROWS} myTeamId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Night Owls" }));
    expect(screen.getByRole("menuitem", { name: "Report team name" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Block user" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "More options for Early Birds" }),
    ).toBeInTheDocument();
  });

  it("the team you own has no menu; a team you only belong to still does", () => {
    render(
      <TopTeams
        loading={false}
        rows={ROWS}
        myTeamId={ROWS[0].teamId}
        ownedTeamId={ROWS[0].teamId}
      />,
    );
    expect(screen.queryByRole("button", { name: "More options for Night Owls" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "More options for Early Birds" }),
    ).toBeInTheDocument();

    render(<TopTeams loading={false} rows={ROWS} myTeamId={ROWS[0].teamId} ownedTeamId={null} />);
    expect(screen.getAllByRole("button", { name: "More options for Night Owls" })).toHaveLength(1);
  });

  it("files the report for that team with the chosen reason and says it was submitted", async () => {
    render(<TopTeams loading={false} rows={ROWS} myTeamId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Early Birds" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report team name" }));
    expect(screen.getByRole("heading", { name: "Report Early Birds" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Why are you reporting this team name?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Harassment or bullying" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() =>
      expect(reportTeamName).toHaveBeenCalledWith({
        data: { teamId: ROWS[1].teamId, reason: "harassment" },
      }),
    );
    expect(await screen.findByText("Report submitted")).toBeInTheDocument();
  });

  it("a team with no creator says there is no one to report, and stays open", async () => {
    reportTeamName.mockResolvedValue({ ok: false, reason: "no-creator" });
    render(<TopTeams loading={false} rows={ROWS} myTeamId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Night Owls" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report team name" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This team's name was generated automatically by Alphonso, so there's no one to report.",
    );
    expect(screen.queryByText("Report submitted")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
  });

  it("a team you created answers that there is nothing to report, even if the menu was reached", async () => {
    reportTeamName.mockResolvedValue({ ok: false, reason: "own-team" });
    render(<TopTeams loading={false} rows={ROWS} myTeamId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Night Owls" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report team name" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This is your own team");
  });

  it("a failed report says so and can be tried again; a thrown one reads the same", async () => {
    reportTeamName.mockResolvedValueOnce({ ok: false, reason: "failed" });
    render(<TopTeams loading={false} rows={ROWS} myTeamId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Night Owls" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report team name" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't submit your report. Try again.",
    );

    reportTeamName.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(reportTeamName).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't submit your report. Try again.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Report submitted")).toBeInTheDocument();
  });

  it("draws nothing while the board is empty and settled", () => {
    const { container } = render(<TopTeams loading={false} rows={[]} myTeamId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
