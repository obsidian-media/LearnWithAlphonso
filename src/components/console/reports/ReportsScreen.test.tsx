// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsScreen } from "./ReportsScreen";
import type { ReportRow, ReportsApi } from "./reportsApi";
import { reportActions } from "../../../lib/report-actions";

afterEach(() => cleanup());

const U = "50000000-0000-4000-8000-000000000001";
const TEAM = "50000000-0000-4000-8000-0000000000e1";

const report = (over: Partial<ReportRow>): ReportRow => ({
  id: "r-user",
  kind: "user",
  reporterId: "rep-1",
  reporterName: "Ada",
  reportedId: U,
  reportedName: "Bea",
  reason: "Abusive name",
  context: null,
  teamId: null,
  teamName: null,
  createdAt: "2026-11-20T10:00:00Z",
  accountDeletedAt: null,
  repeatCount: 1,
  ...over,
});

const USER = report({ repeatCount: 3 });
const TEAM_REPORT = report({
  id: "r-team",
  kind: "team_name",
  reason: "Rude team name",
  teamId: TEAM,
  teamName: "Swift Falcons",
});
const AI = report({
  id: "r-ai",
  kind: "ai_response",
  reportedId: null,
  reportedName: null,
  reason: "Wrong answer",
  context: { message: "The AI said this exact thing" },
  repeatCount: null,
});
const GONE = report({
  id: "r-gone",
  reportedId: null,
  reportedName: "(deleted account)",
  accountDeletedAt: "2026-11-01T00:00:00Z",
  repeatCount: null,
});
const ROWS = [USER, TEAM_REPORT, AI, GONE];

const ok = () => vi.fn(async () => ({ ok: true }));
function makeApi(over: Partial<ReportsApi> = {}): ReportsApi {
  return {
    list: vi.fn(async () => ROWS),
    dismiss: ok(),
    resetName: ok(),
    renameTeam: ok(),
    disbandTeam: ok(),
    ban: ok(),
    deleteUser: vi.fn(async () => ({ failedSteps: [] })),
    ...over,
  };
}
const OWNER = ["reports.manage", "user.ban", "user.delete"];
async function show(api: ReportsApi = makeApi(), scopes: readonly string[] = OWNER) {
  const user = userEvent.setup();
  render(<ReportsScreen api={api} scopes={scopes} />);
  await screen.findByRole("list", { name: "Open reports" });
  return user;
}
const openReport = async (user: ReturnType<typeof userEvent.setup>, name: RegExp | string) => {
  await user.click(screen.getByRole("button", { name: new RegExp(`report about ${name}`) }));
  return screen.getByRole("dialog", { name: "Report" });
};
const reasonBox = () => screen.getByLabelText(/Reason \(3 to 500/);
const buttonNames = (root: HTMLElement) =>
  within(root)
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("what the Reports screen shows", () => {
  it("open reports only: no Resolved tab, no tabs at all", async () => {
    await show();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/resolved/i)).toBeNull();
    expect(screen.getByRole("list", { name: "Open reports" })).toBeTruthy();
  });

  it("the open count and each repeat count are Figures read from the list", async () => {
    await show();
    expect(screen.getByText("4").getAttribute("data-figure")).not.toBeNull();
    const repeat = within(screen.getByRole("list", { name: "Open reports" })).getByText("3");
    expect(repeat.getAttribute("data-figure")).not.toBeNull();
    // a report with one open report about its target shows no repeat chip
    expect(document.querySelectorAll("[data-repeat]").length).toBe(1);
  });

  it("an unread list says so instead of a count, and shows no rows", async () => {
    render(
      <ReportsScreen
        scopes={OWNER}
        api={makeApi({ list: vi.fn(async () => Promise.reject(new Error("db down"))) })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "db down");
    const absent = screen.getByText("Could not read");
    expect(absent.getAttribute("data-figure-absent")).not.toBeNull();
    expect(document.querySelectorAll("[data-figure]").length).toBe(0);
    expect(screen.queryByRole("list", { name: "Open reports" })).toBeNull();
  });

  it("an empty list says No open reports, with a real zero count", async () => {
    render(<ReportsScreen scopes={OWNER} api={makeApi({ list: vi.fn(async () => []) })} />);
    expect(await screen.findByText("No open reports.")).toBeTruthy();
  });

  it("a deleted account is shown as (deleted account), an AI report as AI response", async () => {
    await show();
    expect(screen.getByRole("button", { name: /report about \(deleted account\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /report about AI response/ })).toBeTruthy();
  });

  it("the AI answer block and the team name are shown; there is no profile bio", async () => {
    const user = await show();
    let drawer = await openReport(user, "AI response");
    expect(within(drawer).getByText("The AI said this exact thing")).toBeTruthy();
    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    drawer = await openReport(user, "Swift Falcons");
    expect(within(drawer).getAllByText("Swift Falcons").length).toBeGreaterThan(0);
    expect(screen.queryByText(/bio/i)).toBeNull();
  });
});

describe("the action set is per kind (and each action needs a reason)", () => {
  it("a learner report: reset name, ban, delete, dismiss", async () => {
    const user = await show();
    const drawer = await openReport(user, "Bea");
    expect(buttonNames(drawer)).toEqual([
      "Close",
      "Reset display name",
      "Ban author",
      "Delete account",
      "Dismiss",
    ]);
  });

  it("a team report: rename, disband, dismiss, and no account action", async () => {
    const user = await show();
    await openReport(user, "Swift Falcons");
    const drawer = screen.getByRole("dialog", { name: "Report" });
    const names = buttonNames(drawer);
    expect(names).toContain("Rename team");
    expect(names).toContain("Disband team");
    expect(names).toContain("Dismiss");
    for (const no of ["Reset display name", "Ban author", "Delete account"])
      expect(names).not.toContain(no);
  });

  it("an AI response report: dismiss only", async () => {
    const user = await show();
    const drawer = await openReport(user, "AI response");
    expect(buttonNames(drawer)).toEqual(["Close", "Dismiss"]);
  });

  it("a deleted-account report: dismiss only", async () => {
    const user = await show();
    const drawer = await openReport(user, "\\(deleted account\\)");
    expect(buttonNames(drawer)).toEqual(["Close", "Dismiss"]);
  });

  it("ban and delete follow their own scopes", async () => {
    const user = await show(makeApi(), ["reports.manage"]);
    const drawer = await openReport(user, "Bea");
    expect(buttonNames(drawer)).toEqual(["Close", "Reset display name", "Dismiss"]);
    cleanup();
    const user2 = await show(makeApi(), ["reports.manage", "user.ban"]);
    const drawer2 = await openReport(user2, "Bea");
    expect(buttonNames(drawer2)).toContain("Ban author");
    expect(buttonNames(drawer2)).not.toContain("Delete account");
  });

  it("the pure action set matches what the drawer shows", () => {
    expect(reportActions(USER, OWNER)).toEqual(["dismiss", "reset_name", "ban", "delete"]);
    expect(reportActions(TEAM_REPORT, OWNER)).toEqual(["dismiss", "rename_team", "disband_team"]);
    expect(reportActions(AI, OWNER)).toEqual(["dismiss"]);
    expect(reportActions(GONE, OWNER)).toEqual(["dismiss"]);
  });
});

describe("every action asks for a reason first and sends it", () => {
  it("dismiss: the confirm button stays off until 3 characters, nothing is sent before, then the reason goes out", async () => {
    const api = makeApi();
    const user = await show(api);
    await openReport(user, "Bea");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(api.dismiss).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Dismiss report" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(reasonBox(), "ab");
    expect(confirm.disabled).toBe(true);
    await user.type(reasonBox(), "c");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(api.dismiss).toHaveBeenCalledWith("r-user", "abc"));
    expect(await screen.findByText("Dismissed.")).toBeTruthy();
    expect(vi.mocked(api.list).mock.calls.length).toBe(2); // read again after the change
  });

  it("reset name sends the reason", async () => {
    const api = makeApi();
    const user = await show(api);
    await openReport(user, "Bea");
    await user.click(screen.getByRole("button", { name: "Reset display name" }));
    expect(api.resetName).not.toHaveBeenCalled();
    await user.type(reasonBox(), "Not a real name");
    await user.click(screen.getByRole("button", { name: "Reset name" }));
    await waitFor(() => expect(api.resetName).toHaveBeenCalledWith("r-user", "Not a real name"));
  });

  it("rename team sends the new name and the reason", async () => {
    const api = makeApi();
    const user = await show(api);
    await openReport(user, "Swift Falcons");
    await user.type(screen.getByLabelText("New team name"), "Kind Foxes");
    await user.click(screen.getByRole("button", { name: "Rename team" }));
    expect(api.renameTeam).not.toHaveBeenCalled();
    await user.type(reasonBox(), "Offensive name");
    await user.click(screen.getAllByRole("button", { name: "Rename team" }).at(-1)!);
    await waitFor(() =>
      expect(api.renameTeam).toHaveBeenCalledWith("r-team", "Kind Foxes", "Offensive name"),
    );
  });

  it("disband needs DISBAND typed, then the reason", async () => {
    const api = makeApi();
    const user = await show(api);
    await openReport(user, "Swift Falcons");
    await user.click(screen.getByRole("button", { name: "Disband team" }));
    const go = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await user.type(screen.getByLabelText("Type DISBAND"), "disband");
    expect(go.disabled).toBe(false);
    await user.click(go);
    expect(api.disbandTeam).not.toHaveBeenCalled();
    await user.type(reasonBox(), "Hate speech");
    await user.click(screen.getByRole("button", { name: "Disband forever" }));
    await waitFor(() => expect(api.disbandTeam).toHaveBeenCalledWith("r-team", "Hate speech"));
  });

  it("a wrong word does not enable the disband step", async () => {
    const user = await show();
    await openReport(user, "Swift Falcons");
    await user.click(screen.getByRole("button", { name: "Disband team" }));
    await user.type(screen.getByLabelText("Type DISBAND"), "DISBANDX");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("ban sends reason and the typed email, and leaves the report open", async () => {
    const api = makeApi();
    const user = await show(api);
    await openReport(user, "Bea");
    await user.click(screen.getByRole("button", { name: "Ban author" }));
    const submit = screen.getAllByRole("button", { name: /^Ban/ }).at(-1) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(reasonBox(), "Harassment");
    expect(submit.disabled).toBe(true); // the typed email is still missing
    await user.type(screen.getByLabelText(/Type the learner/), "bea@example.com");
    await user.click(submit);
    await waitFor(() => expect(api.ban).toHaveBeenCalledWith(U, "Harassment", "bea@example.com"));
    expect(api.dismiss).not.toHaveBeenCalled();
    expect(await screen.findByText(/still open/)).toBeTruthy();
  });

  it("a server refusal is shown in the dialog and the list is not re-read as if it worked", async () => {
    const api = makeApi({
      dismiss: vi.fn(async () =>
        Promise.reject(new Error("A reason (3-500 characters) is required.")),
      ),
    });
    const user = await show(api);
    await openReport(user, "Bea");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await user.type(reasonBox(), "abc");
    await user.click(screen.getByRole("button", { name: "Dismiss report" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/reason/);
    expect(vi.mocked(api.list).mock.calls.length).toBe(1);
  });
});

describe("the delete path still dismisses the report", () => {
  async function runDelete(api: ReportsApi) {
    const user = await show(api);
    await openReport(user, "Bea");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.type(reasonBox(), "Confirmed abuse");
    await user.type(screen.getByLabelText(/Type the learner/), "bea@example.com");
    await user.click(screen.getAllByRole("button", { name: /^Delete account/ }).at(-1)!);
  }

  it("deletes the account, then dismisses the report with the same reason", async () => {
    const order: string[] = [];
    const api = makeApi({
      deleteUser: vi.fn(async () => {
        order.push("delete");
        return { failedSteps: [] };
      }),
      dismiss: vi.fn(async () => {
        order.push("dismiss");
      }),
    });
    await runDelete(api);
    await waitFor(() => expect(api.dismiss).toHaveBeenCalledWith("r-user", "Confirmed abuse"));
    expect(api.deleteUser).toHaveBeenCalledWith(U, "Confirmed abuse", "bea@example.com");
    expect(order).toEqual(["delete", "dismiss"]);
    expect(await screen.findByText("Account deleted.")).toBeTruthy();
  });

  it("a failed report close does not read as a failed deletion", async () => {
    const api = makeApi({ dismiss: vi.fn(async () => Promise.reject(new Error("nope"))) });
    await runDelete(api);
    expect(
      await screen.findByText(/Account deleted\. The report could not be closed/),
    ).toBeTruthy();
  });

  it("a refused deletion dismisses nothing", async () => {
    const api = makeApi({
      deleteUser: vi.fn(async () => Promise.reject(new Error("Email does not match."))),
    });
    await runDelete(api);
    expect((await screen.findByRole("alert")).textContent).toBe("Email does not match.");
    expect(api.dismiss).not.toHaveBeenCalled();
  });
});
