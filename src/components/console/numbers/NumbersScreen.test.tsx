// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GROUP_DEFS,
  ownTiles,
  type GrowthAggregates,
  type GroupKey,
  type NumbersGroup,
  type NumbersResponse,
  type OwnAggregates,
  type WindowDays,
} from "../../../lib/numbers-core";
import { DEFAULT_SCOPES, SCOPES } from "../../../lib/staff-scopes";
import { NumbersScreen } from "./NumbersScreen";
import type { NumbersApi } from "./numbersApi";

afterEach(() => cleanup());

const OWN: OwnAggregates = {
  newToday: 3,
  newWindow: 90,
  activeToday: 41,
  activeWindow: 200,
  lessons: 1000,
  practiceCalls: 12,
  podcastsFinished: 8,
  avgStreak: 4.5,
  retention: { d1: 50, d7: 40, d30: null },
  openReports: 2,
  openTickets: 5,
  aiByKind: { chat: 10 },
};
const GROWTH: GrowthAggregates = {
  newPrev: 60,
  activePrev: 250,
  lessonsPrev: 1000,
  storiesPrev: 0,
  storiesRead: 37,
  perfectPct: 34.5,
  byCourse: [
    { language: "en", learners: 120 },
    { language: "es", learners: 64 },
  ],
  dauSeries: [
    { day: "2026-11-15", active: 10 },
    { day: "2026-11-16", active: 30 },
    { day: "2026-11-17", active: 20 },
  ],
  reactivated: 6,
};

function group(key: GroupKey, over: Partial<NumbersGroup> = {}): NumbersGroup {
  const def = GROUP_DEFS.find((g) => g.key === key)!;
  return {
    key,
    title: def.title,
    source: def.source,
    state: "not_connected",
    tiles: def
      .placeholders(7)
      .map((p) => ({ ...p, value: null, reason: "Add a key (owner step)" })),
    ...over,
  };
}
const ownGroup = (growth: GrowthAggregates | null = GROWTH, a: OwnAggregates = OWN): NumbersGroup =>
  group("own", { state: "ok", tiles: ownTiles(a, 7, growth) });

const response = (groups: NumbersGroup[], windowDays: WindowDays = 7): NumbersResponse => ({
  windowDays,
  generatedAt: "2026-11-21T14:32:00Z",
  groups,
});
const supportView = (): NumbersGroup[] => [
  ownGroup(),
  group("sentry", { envNames: ["SENTRY_API_TOKEN", "SENTRY_ORG"] }),
  group("posthog", { envNames: ["POSTHOG_PERSONAL_API_KEY"] }),
];
const ownerView = (): NumbersGroup[] => [
  ...supportView(),
  group("aicost", {
    state: "ok",
    tiles: [{ id: "spend_week", label: "AI spend", kind: "usd", value: 31.4, note: "last 7 days" }],
  }),
  group("revenuecat", { envNames: ["REVENUECAT_METRICS_KEY", "REVENUECAT_PROJECT_ID"] }),
  group("appstore", { envNames: ["ASC_KEY_ID", "ASC_ISSUER_ID"] }),
  group("googleplay", { envNames: ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"] }),
];

function show(res: NumbersResponse | (() => Promise<NumbersResponse>), scopes = [...SCOPES]) {
  const get = vi.fn<NumbersApi["get"]>(async () => (typeof res === "function" ? res() : res));
  const user = userEvent.setup();
  const out = render(<NumbersScreen me={{ scopes }} api={{ get }} />);
  return { get, user, ...out };
}
const tile = (id: string) => document.querySelector(`[data-tile="${id}"]`) as HTMLElement;
const figure = (id: string) => tile(id).querySelector("[data-figure]")?.textContent ?? null;
const absent = (id: string) => tile(id).querySelector("[data-figure-absent]")?.textContent ?? null;

describe("every figure shows its real value", () => {
  it("renders the numbers the server returned, written by Figure", async () => {
    show(response(ownerView()));
    await screen.findByRole("heading", { name: "Numbers" });
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    expect(figure("dau")).toBe("41");
    expect(figure("active_window")).toBe("200");
    expect(figure("ret_d7")).toBe("40%");
    expect(figure("reactivated")).toBe("6");
    expect(figure("lessons")).toBe("1,000");
    expect(figure("stories")).toBe("37");
    expect(figure("perfect")).toBe("34.5%");
    expect(figure("practice")).toBe("12");
    // derived from two real numbers: 1000 lessons / 200 active learners
    const per = screen
      .getByText("Lessons per active learner")
      .closest("[data-tile]") as HTMLElement;
    expect(per.querySelector("[data-figure]")?.textContent).toBe("5");
    // a money group that answered
    expect(figure("spend_week")).toBe("$31.40");
  });
  it("draws the per-day chart from the real series and gives the same numbers as a table", async () => {
    show(response(ownerView()));
    const chart = await screen.findByRole("img", { name: /Active learners per day, 3 days/ });
    expect(chart.getAttribute("aria-label")).toMatch(/Highest 30\. Latest 20\./);
    const table = document.querySelector('[data-chart="dau"] table') as HTMLElement;
    const cells = within(table).getAllByRole("row").slice(1);
    expect(cells.map((r) => r.textContent)).toEqual(["15 Nov10", "16 Nov30", "17 Nov20"]);
    // one polyline vertex per real day, none invented
    const pts = document.querySelector("polyline")!.getAttribute("points")!.trim().split(" ");
    expect(pts).toHaveLength(3);
  });
  it("lists learners by course as bars from the real rows", async () => {
    show(response(ownerView()));
    await screen.findByRole("heading", { name: "Numbers" });
    await waitFor(() => expect(tile("by_course")).toBeTruthy());
    const rows = within(tile("by_course")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["en120", "es64"]);
  });
  it("a real zero from an answering source is written as 0, not as an absent figure", async () => {
    show(response([ownGroup({ ...GROWTH, reactivated: 0, storiesRead: 0 })]));
    await waitFor(() => expect(figure("reactivated")).toBe("0"));
    expect(figure("stories")).toBe("0");
    expect(absent("reactivated")).toBeNull();
  });
});

describe("changes against the previous window are real or absent", () => {
  it("shows the percent change when the previous window is a real number above zero", async () => {
    show(response(supportView()));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    // 90 vs 60 = +50%; lessons 1000 vs 1000 = no change; learners 200 vs 250 = -20%
    expect(within(tile("new_window")).getByText(/50%/)).toBeTruthy();
    expect(tile("new_window").querySelector("[data-delta]")?.textContent).toMatch(
      /up.*50%.*vs previous 7 days/,
    );
    expect(tile("active_window").querySelector("[data-delta]")?.textContent).toMatch(/down.*20%/);
    expect(tile("lessons").querySelector("[data-delta]")?.textContent).toMatch(/no change/);
  });
  it("shows no change at all when the previous number is 0 (no 'infinite' percent) or was not comparable", async () => {
    show(response(supportView()));
    await waitFor(() => expect(figure("stories")).toBe("37"));
    expect(tile("stories").querySelector("[data-delta]")).toBeNull(); // previous was 0
    expect(tile("dau").querySelector("[data-delta]")).toBeNull(); // no previous window is read for it
    expect(tile("perfect").querySelector("[data-delta]")).toBeNull();
  });
  it("compares the lessons-per-learner average with the previous AVERAGE, never the raw previous lesson count", async () => {
    show(response(supportView()));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    const per = () =>
      screen.getByText("Lessons per active learner").closest("[data-tile]") as HTMLElement;
    // 1000 / 200 = 5 now, 1000 / 250 = 4 before: up 25%. (Against the raw 1000 it would read "down 99%".)
    const delta = per().querySelector("[data-delta]")?.textContent ?? "";
    expect(delta).toMatch(/up.*25%/);
    expect(delta).not.toMatch(/99/);
  });
  it("shows no change on lessons per learner when a previous count is missing or zero", async () => {
    for (const over of [{ activePrev: 0 }, { lessonsPrev: null }]) {
      cleanup();
      show(
        response([group("own", { state: "ok", tiles: ownTiles(OWN, 7, { ...GROWTH, ...over }) })]),
      );
      await waitFor(() => expect(figure("lessons")).toBe("1,000"));
      const per = screen
        .getByText("Lessons per active learner")
        .closest("[data-tile]") as HTMLElement;
      expect(per.querySelector("[data-delta]")).toBeNull();
    }
  });
  it("marks today's partial UTC day in the chart and the table", async () => {
    const today = new Date().toISOString().slice(0, 10);
    show(
      response([
        group("own", {
          state: "ok",
          tiles: ownTiles(OWN, 7, {
            ...GROWTH,
            dauSeries: [
              { day: "2026-11-01", active: 10 },
              { day: today, active: 4 },
            ],
          }),
        }),
      ]),
    );
    const chart = await screen.findByRole("img", { name: /Active learners per day/ });
    expect(chart.getAttribute("aria-label")).toMatch(/today so far/);
    expect(document.querySelector("[data-partial]")).not.toBeNull();
    expect(document.querySelector('[data-chart="dau"] table')?.textContent).toMatch(/partial day/);
  });
  it("shows no change for the one-day window", async () => {
    const day = response(
      [
        group("own", {
          state: "ok",
          tiles: ownTiles(OWN, 1, {
            ...GROWTH,
            newPrev: null,
            activePrev: null,
            lessonsPrev: null,
            storiesPrev: null,
          }),
        }),
      ],
      1,
    );
    show(day);
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    expect(document.querySelectorAll("[data-delta]")).toHaveLength(0);
  });
});

describe("the honest absent states", () => {
  it("a growth read that failed blanks only its tiles: 'Could not read', no digit, the rest still renders", async () => {
    show(response(supportView().map((g) => (g.key === "own" ? ownGroup(null) : g))));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    for (const id of ["stories", "perfect", "reactivated", "by_course", "dau_series"]) {
      expect(absent(id), id).toBe("Could not read");
      expect(tile(id).querySelector("[data-figure]"), id).toBeNull();
    }
    expect(document.querySelector('[data-chart="dau"]')).toBeNull();
    expect(figure("lessons")).toBe("1,000");
  });
  it("no lessons or no series says so instead of 0 or a flat line", async () => {
    show(
      response([
        ownGroup({
          ...GROWTH,
          perfectPct: null,
          byCourse: [],
          dauSeries: [{ day: "2026-11-21", active: 4 }],
        }),
      ]),
    );
    await waitFor(() => expect(absent("perfect")).toBe("No lessons in this window"));
    expect(absent("by_course")).toBe("No lessons in this window");
    expect(absent("dau_series")).toBe("No data yet");
    expect(document.querySelector("polyline")).toBeNull();
  });
  it("a provider without its key says Not connected and no digit; Add key names the settings, never a value", async () => {
    const { user } = show(response(ownerView()));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    for (const key of ["revenuecat", "appstore", "googleplay"]) {
      const section = document.querySelector(`[data-group="${key}"]`) as HTMLElement;
      expect(section.querySelectorAll("[data-figure]")).toHaveLength(0);
      for (const a of Array.from(section.querySelectorAll("[data-figure-absent]")))
        expect(a.textContent).toBe("Not connected");
    }
    const rc = document.querySelector('[data-group="revenuecat"]') as HTMLElement;
    expect(within(rc).queryByText("REVENUECAT_METRICS_KEY")).toBeNull();
    await user.click(within(rc).getByRole("button", { name: "Add key" }));
    expect(within(rc).getByText("REVENUECAT_METRICS_KEY")).toBeTruthy();
    expect(within(rc).getByText("REVENUECAT_PROJECT_ID")).toBeTruthy();
    expect(within(rc).getByText(/never shown on this page/)).toBeTruthy();
  });
  it("a group whose provider failed says Could not load with a retry, and the others still render", async () => {
    const failed = group("sentry", { state: "error" });
    const { user, get } = show(response([ownGroup(), failed]));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    expect(absent("crash_free")).toBe("Could not load");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(get).toHaveBeenLastCalledWith(7, true);
  });
  it("a failed read of everything says so and shows no figure at all", async () => {
    show(() => Promise.reject(new Error("Too many requests. Wait a minute and try again.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(document.querySelectorAll("[data-figure]")).toHaveLength(0);
  });
  it("a non-numeric tile (open reports / tickets) is written as the server gave it", async () => {
    show(response([ownGroup()]));
    await waitFor(() => expect(figure("open")).toBe("2 / 5"));
  });
});

describe("what each role sees (the server sends the groups; the page adds nothing)", () => {
  it("support: Growth, Learning and App health, and NO Money section or provider", async () => {
    show(response(supportView()), [...DEFAULT_SCOPES.support, "numbers.read"]);
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    expect(screen.getByRole("heading", { name: "Growth" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Money" })).toBeNull();
    expect(screen.queryByText("Owner only")).toBeNull();
    for (const key of ["aicost", "revenuecat", "appstore", "googleplay"])
      expect(document.querySelector(`[data-group="${key}"]`)).toBeNull();
    expect(screen.getByText(/You see Growth, Learning, App health\./)).toBeTruthy();
  });
  it("owner: Money is there with its owner-only tag", async () => {
    show(response(ownerView()));
    await waitFor(() => expect(figure("new_window")).toBe("90"));
    expect(screen.getByRole("heading", { name: "Money" })).toBeTruthy();
    expect(screen.getByText("Owner only")).toBeTruthy();
    for (const key of ["aicost", "revenuecat", "appstore", "googleplay"])
      expect(document.querySelector(`[data-group="${key}"]`), key).toBeTruthy();
  });
});

describe("the window and refresh", () => {
  it("loads 7 days first, and Today / 30 / 90 ask for that window, Refresh asks again past the cache", async () => {
    const { get, user } = show(response(supportView()));
    await waitFor(() => expect(get).toHaveBeenCalledWith(7, false));
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(get).toHaveBeenLastCalledWith(1, false);
    await user.click(screen.getByRole("button", { name: "90 days" }));
    expect(get).toHaveBeenLastCalledWith(90, false);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(get).toHaveBeenLastCalledWith(90, true);
    expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
  });
  it("offers exactly Today, 7, 30 and 90 days", async () => {
    show(response(supportView()));
    const group = screen.getByRole("group", { name: "Window" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Today", "7 days", "30 days", "90 days"]);
  });
});
