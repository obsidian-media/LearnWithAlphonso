// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fixtures from "../../lib/learning-path.fixtures.json";
import { GOAL_CARD_UNSET_DETAIL, pathGoalCard } from "../../lib/path-goal-card";
import type { LearningPath } from "../../lib/path-plan";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={to}
      className={className}
      aria-label={(rest as { "aria-label"?: string })["aria-label"]}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/AppShell", () => ({
  MobileFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/GoalCard", () => ({ GoalCard: () => <div data-testid="goal-card" /> }));
vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("../../lib/auth-headers", () => ({ authHeaders: async () => ({}) }));

const { PathCard } = await import("./PathCard");
const { PathProfileCard } = await import("./PathProfileCard");
const { RoadScreen, WeekScreen, WhyScreen, BuildScreen } = await import("./PathScreens");

type Fx = keyof typeof fixtures;
const calls: { url: string; init?: RequestInit }[] = [];
function serve(key: Fx | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ path: key ? fixtures[key] : null }), { status: 200 });
    }),
  );
}
beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Learn path card", () => {
  it("shows the goal in words, the progress and today's list from the server", async () => {
    serve("behind");
    render(<PathCard course="en" />);
    expect(await screen.findByText("A bit behind")).toBeTruthy();
    expect(screen.getByText(/Finish A2 by 1 June/)).toBeTruthy();
    const today = fixtures.behind.today.items;
    for (const item of today) expect(screen.getAllByText(item.title).length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar", { name: "Lessons toward your goal" })).toBeTruthy();
  });
  it("invites the learner to set a goal when there is none, and opens the planner", async () => {
    serve(null);
    render(<PathCard course="en" />);
    const link = await screen.findByRole("link", { name: /Set a goal/ });
    expect(link.getAttribute("href")).toBe("/path/build");
    expect(link.textContent).toContain(GOAL_CARD_UNSET_DETAIL);
  });
  it("shows the goal on the path: level, date, lessons a week and the status, from the server's numbers", async () => {
    serve("behind");
    render(<PathCard course="en" />);
    const card = await screen.findByRole("link", { name: /^My goal: A2 by 1 Jun 2027/ });
    expect(card.getAttribute("href")).toBe("/path/build");
    const lines = pathGoalCard(fixtures.behind as unknown as LearningPath);
    expect(lines.headline).toBe("A2 by 1 Jun 2027");
    expect(card.textContent).toContain(lines.headline);
    expect(card.textContent).toContain(
      `${fixtures.behind.progress.requiredPerWeek} lessons a week`,
    );
    expect(card.textContent).toContain(fixtures.behind.statusLine);
  });
  it("says so when the path cannot load, with a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    render(<PathCard course="en" />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't load your path.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("the road", () => {
  it("lists every stop, the goal flag last, and the three ways to catch up when behind", async () => {
    serve("behind");
    render(<RoadScreen />);
    await screen.findByLabelText("Your road");
    const stops = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(stops).toHaveLength(fixtures.behind.road.length);
    expect(stops[stops.length - 1].textContent).toContain("Your goal: finish A2");
    expect(screen.getAllByRole("radio")).toHaveLength(fixtures.behind.recovery.length);
    expect(screen.getByRole("button", { name: "Update my path" })).toBeTruthy();
  });
  it("Update my path sends the chosen recovery (lessons first) to the server", async () => {
    serve("behind");
    render(<RoadScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Update my path" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(JSON.parse(String(put.init?.body))).toEqual({ course: "en", action: "lessons_first" });
  });
  it("shows no recovery card when on track", async () => {
    serve("onTrack");
    render(<RoadScreen />);
    await screen.findByLabelText("Your road");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
  it("a trimmed path says so and offers to resume", async () => {
    serve("behindTrimmed");
    render(<RoadScreen />);
    expect(await screen.findByText(/Lessons first until/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume my mix" })).toBeTruthy();
  });
});

describe("the week and why", () => {
  it("shows seven days with one rest day", async () => {
    serve("onTrack");
    render(<WeekScreen />);
    await screen.findByText("My week");
    expect(screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)).toHaveLength(7);
    expect(screen.getAllByText("Rest day")).toHaveLength(1);
  });
  it("lists every reason the server gave", async () => {
    serve("onTrack");
    render(<WhyScreen />);
    for (const w of fixtures.onTrack.why)
      expect((await screen.findAllByText(w.headline)).length).toBeGreaterThan(0);
  });
});

describe("build my path", () => {
  it("turning a type off sends the switches", async () => {
    serve("onTrack");
    render(<BuildScreen />);
    fireEvent.click(await screen.findByRole("switch", { name: "Podcasts in my path" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(JSON.parse(String(put.init?.body))).toEqual({
      course: "en",
      action: "set_off",
      off: ["podcast"],
    });
  });
  it("offers the seven weekdays and no rest day, with the current rest day selected", async () => {
    serve("restDayChosen");
    render(<BuildScreen />);
    const group = await screen.findByRole("radiogroup", { name: "Rest day" });
    const labels = Array.from(group.querySelectorAll('[role="radio"]')).map((r) => r.textContent);
    expect(labels).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "No rest day"]);
    expect(screen.getByRole("radio", { name: "Wed" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Sun" }).getAttribute("aria-checked")).toBe("false");
  });
  it("selects No rest day when the path has none", async () => {
    serve("noRestDay");
    render(<BuildScreen />);
    expect(
      (await screen.findByRole("radio", { name: "No rest day" })).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText(/7 days/)).toBeTruthy();
  });
  it("choosing a rest day sends it, and choosing none sends none", async () => {
    serve("onTrack");
    render(<BuildScreen />);
    fireEvent.click(await screen.findByRole("radio", { name: "Fri" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "PUT")!.init?.body))).toEqual({
      course: "en",
      action: "set_rest_day",
      restDay: 5,
    });
    calls.length = 0;
    fireEvent.click(screen.getByRole("radio", { name: "No rest day" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "PUT")!.init?.body))).toEqual({
      course: "en",
      action: "set_rest_day",
      restDay: "none",
    });
  });
  it("lessons cannot be switched off", async () => {
    serve("onTrack");
    render(<BuildScreen />);
    await screen.findByRole("switch", { name: "Podcasts in my path" });
    expect(screen.queryByRole("switch", { name: /Lessons/ })).toBeNull();
  });
});

describe("Profile my path", () => {
  it("shows a tile per activity with its streak and this week's minutes, and no Videos tile before any video activity", async () => {
    serve("onTrack");
    render(<PathProfileCard course="en" />);
    await screen.findByText(/This week:/);
    const label = { lesson: "Lessons", podcast: "Podcasts", talk: "Talk", campaign: "Campaigns" };
    const shown = fixtures.onTrack.streaks.filter((s) => s.type !== "video");
    expect(shown).toHaveLength(4);
    for (const s of shown) {
      const name = label[s.type as keyof typeof label];
      const text = `${name}: ${s.days} ${s.days === 1 ? "day" : "days"} in a row, ${s.weekMinutes} minutes this week`;
      expect(screen.getByLabelText(text)).toBeTruthy();
    }
    expect(screen.queryByLabelText(/^Videos:/)).toBeNull();
  });

  it("shows the Videos tile once the learner has watched one", async () => {
    const path = {
      ...fixtures.onTrack,
      streaks: fixtures.onTrack.streaks.map((s) =>
        s.type === "video" ? { ...s, days: 2, weekMinutes: 3 } : s,
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ path }), { status: 200 })),
    );
    render(<PathProfileCard course="en" />);
    await screen.findByText(/This week:/);
    expect(screen.getByLabelText("Videos: 2 days in a row, 3 minutes this week")).toBeTruthy();
  });
});
