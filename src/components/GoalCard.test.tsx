// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "../lib/learning-goal.fixtures.json";
import type { GoalPlan } from "../lib/learning-goal";

const client = vi.hoisted(() => ({
  fetchGoal: vi.fn(),
  previewGoal: vi.fn(),
  saveGoal: vi.fn(),
  removeGoal: vi.fn(),
  readCachedGoal: vi.fn(),
}));
vi.mock("../lib/learning-goal-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/learning-goal-client")>(
    "../lib/learning-goal-client",
  );
  return { ...actual, ...client };
});

import { GoalError } from "../lib/learning-goal-client";
import { GoalCard } from "./GoalCard";

const plans = fixtures.plans as unknown as Record<string, GoalPlan>;
const goal = {
  course: "en" as const,
  targetLevel: "B1",
  targetDate: "2026-10-20",
  createdAt: "2026-09-01T00:00:00.000Z",
};
const stored = (plan: GoalPlan | null) => ({ goal, plan });

beforeEach(() => {
  vi.clearAllMocks();
  client.readCachedGoal.mockResolvedValue(null);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderCard = () => render(<GoalCard course="en" />);
const region = () => screen.getByRole("region", { name: "Learning goal" });

describe("empty and loading", () => {
  it("shows a loading state, then an invitation when there is no goal", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    renderCard();
    expect(region()).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
  });
});

describe("setup", () => {
  beforeEach(() => client.fetchGoal.mockResolvedValue({ goal: null, plan: null }));

  async function openSetup() {
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    return user;
  }

  it("offers every level, 3/6/12-month presets, and the estimate wording", async () => {
    await openSetup();
    const select = screen.getByLabelText(/finish level/i);
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    for (const label of ["3 months", "6 months", "12 months"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(region()).toHaveTextContent(/estimate of lessons, not of fluency/i);
  });

  it("does not allow saving before a preview has succeeded", async () => {
    await openSetup();
    expect(screen.getByRole("button", { name: /save goal/i })).toBeDisabled();
  });

  it("a preset fills the date, previews it, and shows the weekly number", async () => {
    client.previewGoal.mockResolvedValue({ ...plans.on_track, requiredPerWeek: 12, realism: "ok" });
    const user = await openSetup();
    await user.selectOptions(screen.getByLabelText(/finish level/i), "B1");
    await user.click(screen.getByRole("button", { name: "6 months" }));
    expect(screen.getByLabelText(/target date/i)).toHaveValue("2027-04-06");
    await waitFor(() => expect(client.previewGoal).toHaveBeenCalledWith("en", "B1", "2027-04-06"));
    expect(await screen.findByText(/12 lessons a week/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save goal/i })).toBeEnabled();
  });

  it("shows a warning for an ambitious or unrealistic pace", async () => {
    client.previewGoal.mockResolvedValue({ ...plans.unrealistic });
    const user = await openSetup();
    await user.click(screen.getByRole("button", { name: "3 months" }));
    expect(await screen.findByText(/unrealistic/i)).toBeInTheDocument();
    client.previewGoal.mockResolvedValue({ ...plans.just_started });
    await user.click(screen.getByRole("button", { name: "6 months" }));
    expect(await screen.findByText(/ambitious/i)).toBeInTheDocument();
  });

  it("shows the error and keeps Save disabled when the preview fails", async () => {
    client.previewGoal.mockRejectedValue(new GoalError("invalid"));
    const user = await openSetup();
    await user.click(screen.getByRole("button", { name: "3 months" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't be saved/i);
    expect(screen.getByRole("button", { name: /save goal/i })).toBeDisabled();
  });

  it("ignores a stale preview that arrives after a newer one", async () => {
    let releaseFirst: (p: GoalPlan) => void = () => {};
    client.previewGoal
      .mockImplementationOnce(() => new Promise<GoalPlan>((r) => (releaseFirst = r)))
      .mockResolvedValueOnce({ ...plans.on_track, requiredPerWeek: 7 });
    const user = await openSetup();
    await user.click(screen.getByRole("button", { name: "3 months" }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    expect(await screen.findByText(/7 lessons a week/i)).toBeInTheDocument();
    await act(async () => {
      releaseFirst({ ...plans.on_track, requiredPerWeek: 99 });
    });
    expect(screen.queryByText(/99 lessons a week/i)).not.toBeInTheDocument();
    expect(screen.getByText(/7 lessons a week/i)).toBeInTheDocument();
  });

  it("saves once with the chosen level and date, then shows the goal", async () => {
    client.previewGoal.mockResolvedValue(plans.just_started);
    client.saveGoal.mockResolvedValue(stored(plans.just_started));
    const user = await openSetup();
    await user.selectOptions(screen.getByLabelText(/finish level/i), "B1");
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    await user.click(screen.getByRole("button", { name: /save goal/i }));
    expect(client.saveGoal).toHaveBeenCalledTimes(1);
    expect(client.saveGoal).toHaveBeenCalledWith("en", "B1", "2027-04-06");
    expect(await screen.findByText(/finish B1/i)).toBeInTheDocument();
  });

  it("shows a save failure without leaving setup", async () => {
    client.previewGoal.mockResolvedValue(plans.just_started);
    client.saveGoal.mockRejectedValue(new GoalError("unavailable"));
    const user = await openSetup();
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    await user.click(screen.getByRole("button", { name: /save goal/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your goal/i);
    expect(screen.getByRole("button", { name: /save goal/i })).toBeEnabled();
  });
});

describe("the goal card, by status", () => {
  const show = async (plan: GoalPlan | null) => {
    client.fetchGoal.mockResolvedValue(stored(plan));
    renderCard();
    await screen.findByText(/finish B1/i);
  };

  it.each([
    ["done", /goal reached/i],
    ["just_started", /just started/i],
    ["ahead", /ahead of plan/i],
    ["on_track", /on track/i],
    ["behind_with_suggestion", /behind plan/i],
    ["expired", /date has passed/i],
  ])("%s", async (key, text) => {
    await show(plans[key]);
    expect(region()).toHaveTextContent(text);
  });

  it("shows progress and the weekly requirement", async () => {
    await show(plans.on_track);
    const p = plans.on_track;
    expect(region()).toHaveTextContent(
      `${p.lessonsInScope - p.lessonsRemaining} of ${p.lessonsInScope} lessons`,
    );
    expect(region()).toHaveTextContent(`${p.requiredPerWeek} lessons a week`);
  });

  it("when behind, shows the suggested date and a way to move the date", async () => {
    await show(plans.behind_with_suggestion);
    expect(region()).toHaveTextContent(/10 Nov 2026/);
    expect(screen.getByRole("button", { name: /change goal/i })).toBeInTheDocument();
  });

  it("says the number is an estimate of lessons, not of fluency", async () => {
    await show(plans.on_track);
    expect(region()).toHaveTextContent(/estimate of lessons, not of fluency/i);
  });

  it("asks for a new target when the learner's level has passed it (null plan)", async () => {
    await show(null);
    expect(region()).toHaveTextContent(/pick a new target/i);
  });

  it("removes the goal and returns to the invitation", async () => {
    client.removeGoal.mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: () => {} });
    await show(plans.on_track);
    await user.click(screen.getByRole("button", { name: /remove goal/i }));
    expect(client.removeGoal).toHaveBeenCalledWith("en");
    expect(await screen.findByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
  });
});

describe("offline and errors", () => {
  it("shows the cached plan, marked as such, with editing disabled, when offline", async () => {
    client.fetchGoal.mockRejectedValue(new GoalError("offline"));
    client.readCachedGoal.mockResolvedValue(stored(plans.on_track));
    renderCard();
    await screen.findByText(/finish B1/i);
    expect(region()).toHaveTextContent(/as of/i);
    expect(region()).toHaveTextContent(/offline/i);
    expect(screen.getByRole("button", { name: /change goal/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove goal/i })).toBeDisabled();
  });

  it("with nothing cached, shows the error and a working retry", async () => {
    client.fetchGoal.mockRejectedValueOnce(new GoalError("offline")).mockResolvedValueOnce({
      goal: null,
      plan: null,
    });
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent(/offline/i);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
  });

  it("a sign-in problem is shown as such, not as offline", async () => {
    client.fetchGoal.mockRejectedValue(new GoalError("notSignedIn"));
    renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in again/i);
  });
});

describe("review fixes", () => {
  it("an expired goal shows no weekly number, offers the suggested date and a way to change it", async () => {
    client.fetchGoal.mockResolvedValue(stored(plans.expired));
    renderCard();
    await screen.findByText(/finish B1/i);
    expect(region()).not.toHaveTextContent(/lessons a week/i);
    expect(region()).toHaveTextContent(/12 Jan 2027/);
    expect(screen.getByRole("button", { name: /change goal/i })).toBeEnabled();
  });

  it.each(["notSignedIn", "unavailable"] as const)(
    "does NOT fall back to the cached plan for a %s failure (only for offline)",
    async (kind) => {
      client.fetchGoal.mockRejectedValue(new GoalError(kind));
      client.readCachedGoal.mockResolvedValue(stored(plans.on_track));
      renderCard();
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText(/finish B1/i)).not.toBeInTheDocument();
    },
  );

  it("a failed remove shows an error but leaves the goal editable (not 'offline')", async () => {
    client.fetchGoal.mockResolvedValue(stored(plans.on_track));
    client.removeGoal.mockRejectedValue(new GoalError("unavailable"));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await screen.findByText(/finish B1/i);
    await user.click(screen.getByRole("button", { name: /remove goal/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your goal/i);
    expect(screen.getByText(/finish B1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove goal/i })).toBeEnabled();
    expect(region()).not.toHaveTextContent(/as of/i);
  });

  it("shows the server's reason when a preview is rejected", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockRejectedValue(new GoalError("invalid", "That level is below yours"));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "3 months" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That level is below yours");
  });

  it("will not let the date picker choose today or earlier", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    expect(screen.getByLabelText(/target date/i)).toHaveAttribute("min", "2026-10-07");
  });

  it("clamps a month preset to the end of a shorter month (31 Aug + 6 months = 28 Feb)", async () => {
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockResolvedValue(plans.on_track);
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    expect(screen.getByLabelText(/target date/i)).toHaveValue("2027-02-28");
  });

  it("moves focus to the card after saving, so keyboard users are not dropped on the page", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockResolvedValue(plans.just_started);
    client.saveGoal.mockResolvedValue(stored(plans.just_started));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    await user.click(screen.getByRole("button", { name: /save goal/i }));
    await screen.findByText(/finish B1/i);
    expect(region()).toHaveFocus();
  });

  it("ignores a slow answer for the previous course after switching courses", async () => {
    let releaseEn: (v: unknown) => void = () => {};
    client.fetchGoal
      .mockImplementationOnce(() => new Promise((r) => (releaseEn = r)))
      .mockResolvedValueOnce({ goal: null, plan: null });
    const view = render(<GoalCard course="en" />);
    view.rerender(<GoalCard course="fr" />);
    expect(await screen.findByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
    await act(async () => {
      releaseEn(stored(plans.on_track));
    });
    expect(screen.queryByText(/finish B1/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
  });

  it("disables Save the moment an input changes, until the new preview arrives", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockResolvedValueOnce(plans.just_started);
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    expect(screen.getByRole("button", { name: /save goal/i })).toBeEnabled();
    // The next preview never arrives: the old plan must not stay saveable for the new level.
    client.previewGoal.mockImplementation(() => new Promise(() => {}));
    await user.selectOptions(screen.getByLabelText(/finish level/i), "C1");
    expect(screen.getByRole("button", { name: /save goal/i })).toBeDisabled();
    expect(screen.queryByText(/lessons a week/i)).not.toBeInTheDocument();
  });

  it("formats dates with a fixed English month table (so web and iOS print the same text)", async () => {
    client.fetchGoal.mockResolvedValue({
      goal: { ...goal, targetDate: "2026-09-05" },
      plan: plans.on_track,
    });
    renderCard();
    expect(await screen.findByText(/finish B1 by 5 Sep 2026/i)).toBeInTheDocument();
  });

  it("shows the suggested date once, even when the plan is also unrealistic", async () => {
    client.fetchGoal.mockResolvedValue(
      stored({ ...plans.behind_with_suggestion, realism: "unrealistic" }),
    );
    renderCard();
    await screen.findByText(/finish B1/i);
    expect(region().textContent?.match(/10 Nov 2026/g)).toHaveLength(1);
    expect(region()).toHaveTextContent(/unrealistic/i);
  });

  it("leaves an impossible date as written instead of rolling it into the next month", async () => {
    client.fetchGoal.mockResolvedValue({
      goal: { ...goal, targetDate: "2026-02-30" },
      plan: plans.on_track,
    });
    renderCard();
    expect(await screen.findByText(/finish B1 by 2026-02-30/i)).toBeInTheDocument();
  });

  it("shows the suggested date once in the setup preview too", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockResolvedValue({
      ...plans.unrealistic,
      suggestedDate: "2026-11-10",
    });
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "3 months" }));
    await screen.findByText(/lessons a week/i);
    expect(region().textContent?.match(/10 Nov 2026/g)).toHaveLength(1);
  });

  it("offline with nothing cached does not promise a saved plan", async () => {
    client.fetchGoal.mockRejectedValue(new GoalError("offline"));
    client.readCachedGoal.mockResolvedValue(null);
    renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're offline. Connect to load your goal.",
    );
    expect(screen.queryByText(/last saved plan/i)).not.toBeInTheDocument();
  });

  it("a failed remove while offline says to try again, not that it is showing a saved plan", async () => {
    client.fetchGoal.mockResolvedValue(stored(plans.on_track));
    client.removeGoal.mockRejectedValue(new GoalError("offline"));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await screen.findByText(/finish B1/i);
    await user.click(screen.getByRole("button", { name: /remove goal/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're offline. Try again when you're connected.",
    );
    expect(screen.queryByText(/last saved plan/i)).not.toBeInTheDocument();
  });

  it("a failed save while offline says the same", async () => {
    client.fetchGoal.mockResolvedValue({ goal: null, plan: null });
    client.previewGoal.mockResolvedValue(plans.just_started);
    client.saveGoal.mockRejectedValue(new GoalError("offline"));
    const user = userEvent.setup({ advanceTimers: () => {} });
    renderCard();
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    await user.click(screen.getByRole("button", { name: /save goal/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You're offline. Try again when you're connected.",
    );
  });

  it("drops a save that finishes after the learner switched course", async () => {
    let releaseSave: (v: unknown) => void = () => {};
    client.fetchGoal
      .mockResolvedValueOnce({ goal: null, plan: null })
      .mockResolvedValueOnce({ goal: null, plan: null });
    client.previewGoal.mockResolvedValue(plans.just_started);
    client.saveGoal.mockImplementation(() => new Promise((r) => (releaseSave = r)));
    const user = userEvent.setup({ advanceTimers: () => {} });
    const view = render(<GoalCard course="en" />);
    await user.click(await screen.findByRole("button", { name: /set a learning goal/i }));
    await user.click(screen.getByRole("button", { name: "6 months" }));
    await screen.findByText(/lessons a week/i);
    await user.click(screen.getByRole("button", { name: /save goal/i }));
    view.rerender(<GoalCard course="fr" />);
    await screen.findByRole("button", { name: /set a learning goal/i });
    await act(async () => {
      releaseSave(stored(plans.on_track));
    });
    // The French card must not show the English goal that just finished saving.
    expect(screen.queryByText(/finish B1/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set a learning goal/i })).toBeInTheDocument();
  });

  it("drops a remove that finishes after the learner switched course", async () => {
    let releaseRemove: (v?: unknown) => void = () => {};
    client.fetchGoal
      .mockResolvedValueOnce(stored(plans.on_track))
      .mockResolvedValueOnce(stored(plans.ahead));
    client.removeGoal.mockImplementation(() => new Promise((r) => (releaseRemove = r)));
    const user = userEvent.setup({ advanceTimers: () => {} });
    const view = render(<GoalCard course="en" />);
    await user.click(await screen.findByRole("button", { name: /remove goal/i }));
    view.rerender(<GoalCard course="fr" />);
    await screen.findByText(/ahead of plan/i);
    await act(async () => {
      releaseRemove();
    });
    // The French goal must still be on screen: the English removal finished late.
    expect(screen.getByText(/ahead of plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set a learning goal/i })).not.toBeInTheDocument();
  });
});
