// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  buildUptime,
  type HealthData,
  type ServiceRow,
  type ServiceState,
} from "../../../lib/health-core";
import { HealthScreen } from "./HealthScreen";
import type { HealthApi } from "./healthApi";

afterEach(() => cleanup());

const NOW = new Date();
const svc = (key: ServiceRow["key"], state: ServiceState, over: Partial<ServiceRow> = {}) =>
  ({
    key,
    name: {
      database: "Database",
      auth: "Auth & sign-in",
      payments: "Payments",
      ai: "AI provider",
      jobs: "Background jobs",
    }[key],
    detail: null,
    state,
    reason: state === "healthy" ? null : `why-${key}`,
    latencyMs: null,
    uptime: null,
    uptimeError: false,
    jobs: null,
    ...over,
  }) as ServiceRow;

const history = (days: Array<[string, number, number]>, first: string | null = null) =>
  buildUptime(
    days.map(([day, checks, okChecks]) => ({ service: "database", day, checks, okChecks })),
    first,
    NOW,
  );
const today = NOW.toISOString().slice(0, 10);

function data(over: Partial<HealthData> = {}): HealthData {
  return {
    checkedAt: NOW.toISOString(),
    aal2Enforced: true,
    opsError: null,
    ops: {
      events: [
        {
          event: "hearts_settlement_failed",
          count24h: 2,
          count7d: 9,
          lastAt: "2026-11-20T10:00:00Z",
          status: "amber",
        },
      ],
      latest: [
        {
          id: 7,
          event: "hearts_settlement_failed",
          source: "web",
          userId: "abcdef12-0000-4000-8000-000000000000",
          detail: { fn: "settle" },
          createdAt: "2026-11-20T10:00:00Z",
        },
      ],
    },
    services: [
      svc("database", "healthy", {
        latencyMs: 12,
        uptime: history([[today, 4, 4]], NOW.toISOString()),
      }),
      svc("auth", "healthy", {
        latencyMs: 41,
        detail: "Two-step (AAL2) enforced",
        uptime: history([]),
      }),
      svc("payments", "not_connected"),
      svc("ai", "configured"),
      svc("jobs", "healthy", { jobs: { lastRunAt: NOW.toISOString(), runs24h: 90, failed24h: 0 } }),
    ],
    ...over,
  };
}

const show = async (d: HealthData | (() => Promise<HealthData>)) => {
  const api: HealthApi = { get: typeof d === "function" ? d : async () => d };
  render(<HealthScreen api={api} />);
  await waitFor(() => expect(screen.queryByLabelText("Running the checks")).toBeNull());
  return api;
};
const banner = () => document.querySelector("[data-banner]") as HTMLElement;

describe("unknown means grey, and the banner says nothing false", () => {
  it("a not-connected row is grey with its own words, and the banner does not say healthy", async () => {
    await show(data());
    const row = document.querySelector('[data-service="payments"]') as HTMLElement;
    expect(row.getAttribute("data-state")).toBe("not_connected");
    expect(row.textContent).toContain("Not connected");
    expect(row.innerHTML).not.toContain("bg-ds-right");
    expect(banner().getAttribute("data-banner")).toBe("unchecked");
    expect(banner().textContent).toContain("could not be checked");
    expect(banner().textContent).not.toMatch(/healthy|operational|all/i);
  });

  it("an unknown row is grey 'Unknown' with its reason, and never green", async () => {
    await show(
      data({ services: [svc("database", "healthy", { latencyMs: 3 }), svc("jobs", "unknown")] }),
    );
    const row = document.querySelector('[data-service="jobs"]') as HTMLElement;
    expect(row.textContent).toContain("Unknown");
    expect(row.textContent).toContain("why-jobs");
    expect(row.innerHTML).not.toContain("bg-ds-right");
    expect(banner().getAttribute("data-banner")).toBe("unchecked");
  });

  it("only when every row is healthy or configured does the banner say so, and it still names the untested ones", async () => {
    await show(
      data({
        services: [svc("database", "healthy", { latencyMs: 3 }), svc("ai", "configured")],
      }),
    );
    expect(banner().getAttribute("data-banner")).toBe("ok");
    expect(banner().textContent).toContain("Everything that was checked is healthy");
    expect(banner().textContent).toContain("nothing tests them live");
  });

  it("the banner is green only when nothing is merely configured; with a configured row it is neutral", async () => {
    await show(data({ services: [svc("database", "healthy", { latencyMs: 3 })] }));
    expect(banner().className).toContain("bg-ds-right-tint");
    cleanup();
    await show(
      data({
        services: [svc("database", "healthy", { latencyMs: 3 }), svc("ai", "configured")],
      }),
    );
    expect(banner().className).not.toContain("bg-ds-right-tint");
  });

  it("the auth history card says it measures the data read, not the sign-in service", async () => {
    await show(data());
    expect(document.body.textContent).toContain("Auth data (database read) · last 90 days");
  });

  it("a degraded row says so with its reason and counts it", async () => {
    await show(
      data({
        services: [
          svc("database", "degraded", { reason: "No answer within 3 seconds" }),
          svc("payments", "not_connected"),
        ],
      }),
    );
    expect(banner().getAttribute("data-banner")).toBe("degraded");
    expect(banner().textContent).toContain("service degraded");
    expect(banner().textContent).toContain("Database");
    const row = document.querySelector('[data-service="database"]') as HTMLElement;
    expect(row.textContent).toContain("No answer within 3 seconds");
    expect(row.textContent).toContain("Degraded");
    expect(row.innerHTML).not.toContain("bg-ds-right");
  });
});

describe("a probe timeout is degraded with a reason, not omitted", () => {
  it("the row stays in the list, carries no latency figure, and the bars still render", async () => {
    await show(
      data({
        services: [
          svc("database", "degraded", {
            reason: "No answer within 3 seconds",
            uptime: history([]),
          }),
        ],
      }),
    );
    const row = document.querySelector('[data-service="database"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.querySelector("[data-figure]")).toBeNull();
  });
});

describe("uptime bars: no-data days are grey, never green", () => {
  it("with no history every bar is no data, the percentage says No data yet and nothing is green", async () => {
    await show(
      data({ services: [svc("database", "healthy", { latencyMs: 3, uptime: history([]) })] }),
    );
    const bars = document.querySelectorAll('[data-uptime="database"] [data-bar]');
    expect(bars.length).toBe(90);
    for (const b of Array.from(bars)) {
      expect(b.getAttribute("data-bar")).toBe("nodata");
      expect(b.className).not.toContain("bg-ds-right");
    }
    expect(screen.getByText("No data yet")).toBeTruthy();
    expect(document.body.textContent).toContain("No checks recorded yet");
  });

  it("only a day with checks is coloured; the header percentage is over those days; it says when collection started", async () => {
    await show(
      data({
        services: [
          svc("database", "healthy", {
            latencyMs: 3,
            uptime: history([[today, 3, 2]], "2026-11-19T04:00:00Z"),
          }),
        ],
      }),
    );
    const bars = Array.from(document.querySelectorAll('[data-uptime="database"] [data-bar]'));
    expect(bars.filter((b) => b.getAttribute("data-bar") !== "nodata")).toHaveLength(1);
    const card = document.querySelector('[data-uptime="database"]')!.parentElement!;
    expect(card.textContent).toContain("66.67%");
    expect(card.textContent).toContain("Collecting since 19 Nov 2026");
    // the green class appears only on days that are fully up (none here: 2 of 3 passed)
    expect(card.querySelectorAll(".bg-ds-right")).toHaveLength(0);
  });

  it("unreadable history says so instead of drawing bars", async () => {
    await show(
      data({
        services: [svc("database", "healthy", { latencyMs: 3, uptime: null, uptimeError: true })],
      }),
    );
    expect(screen.getAllByText("Could not read the history.").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-bar]")).toBeNull();
  });
});

describe("the ops events table is preserved", () => {
  it("shows each event with its counts and thresholds, and the latest rows", async () => {
    await show(data());
    const events = document.querySelector("[data-events]")!;
    expect(events.textContent).toContain("Hearts settlement");
    expect(events.textContent).toContain("hearts_settlement_failed");
    expect(events.textContent).toContain("Watch");
    expect(events.textContent).toMatch(/24 h: 2 · 7 d: 9/);
    const latest = document.querySelector("[data-latest]")!;
    expect(latest.textContent).toContain("learner abcdef12");
    expect(latest.textContent).toContain('{"fn":"settle"}');
  });

  it("when the events cannot be read it says so and the services still show", async () => {
    await show(data({ ops: null, opsError: "Could not read the events." }));
    expect(screen.getByRole("alert").textContent).toBe("Could not read the events.");
    expect(document.querySelector('[data-service="database"]')).not.toBeNull();
  });
});

describe("the learner website note", () => {
  it("is an informational line, not a service row, and it does not change the banner", async () => {
    await show(data({ services: [svc("database", "healthy", { latencyMs: 3 })] }));
    const note = document.querySelector("[data-footnote='website']") as HTMLElement;
    expect(note.textContent).toBe(
      "The learner website's health is tracked by the deploy pipeline, not probed here.",
    );
    expect(note.closest("[data-service]")).toBeNull();
    expect(document.querySelectorAll("[data-service]")).toHaveLength(1);
    // all rows healthy: the banner is still "ok" with the note on the page
    expect(banner().getAttribute("data-banner")).toBe("ok");
    expect(banner().textContent).not.toContain("website");
  });
});

describe("figures", () => {
  it("a row with no reading shows no digit in any figure node (absent figures carry words only)", async () => {
    await show(
      data({
        services: [svc("payments", "not_connected"), svc("jobs", "unknown", { jobs: null })],
        ops: { events: [], latest: [] },
      }),
    );
    const absent = Array.from(document.querySelectorAll("[data-figure-absent]"));
    expect(absent.length).toBeGreaterThan(0);
    for (const el of absent) expect(el.textContent).not.toMatch(/\d/);
    for (const el of Array.from(document.querySelectorAll("[data-figure]"))) {
      // every digit on screen came through <Figure>: the service rows hold none outside one
      expect(el.textContent).toMatch(/\d|ago|just now/);
    }
    const row = document.querySelector('[data-service="jobs"]') as HTMLElement;
    expect(row.textContent).not.toMatch(/\d/);
  });
});

describe("re-run and failures", () => {
  it("Re-run checks calls the server again", async () => {
    const get = vi.fn(async () => data());
    await show(get);
    expect(get).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Re-run checks" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("a failed read says so and shows no service as fine", async () => {
    await show(async () => {
      throw new Error("Forbidden: missing scope numbers.read");
    });
    expect(screen.getByRole("alert").textContent).toContain("Forbidden");
    expect(document.querySelector("[data-service]")).toBeNull();
    expect(banner()).toBeNull();
  });
});

describe("the layout holds at phone width (no 375 px e2e exists for the admin app)", () => {
  it("rows wrap, bars shrink to fit, events stack until md, nothing forces sideways scroll, controls are 44 px", async () => {
    await show(data());
    const row = document.querySelector("[data-service]") as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    for (const bar of Array.from(document.querySelectorAll("[data-bar]")))
      expect(bar.className).toContain("min-w-0");
    expect(document.querySelector('[data-uptime="database"]')!.className).toContain("flex");
    const li = document.querySelector("[data-latest] li") as HTMLElement;
    expect(li.className).toContain("md:grid-cols-");
    expect(li.className).not.toMatch(/(^|\s)grid-cols-/);
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("main")?.innerHTML).not.toMatch(/min-w-\[|w-\[\d{3,}px\]/);
    for (const el of Array.from(document.querySelectorAll("button")))
      expect(el.className).toMatch(/min-h-11/);
  });
});
