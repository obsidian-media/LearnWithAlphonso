// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  GROUP_DEFS,
  type NumbersGroup,
  type NumbersResponse,
  type Tile,
} from "../../lib/numbers-core";
import { formatTile, NumbersView, updatedLabel } from "./NumbersView";

const tile = (over: Partial<Tile>): Tile => ({
  id: "t",
  label: "Tile",
  kind: "number",
  value: 5,
  note: "today",
  ...over,
});
const group = (
  key: NumbersGroup["key"],
  state: NumbersGroup["state"],
  tiles: Tile[],
): NumbersGroup => {
  const def = GROUP_DEFS.find((g) => g.key === key)!;
  return { key, title: def.title, source: def.source, state, tiles };
};
const data = (groups: NumbersGroup[]): NumbersResponse => ({
  windowDays: 7,
  generatedAt: "2026-11-15T10:42:00",
  groups,
});
const view = (d: NumbersResponse | null, over: Partial<Parameters<typeof NumbersView>[0]> = {}) =>
  render(
    <NumbersView
      data={d}
      windowDays={7}
      busy={false}
      error={null}
      onWindow={() => {}}
      onRefresh={() => {}}
      {...over}
    />,
  );

describe("formatTile", () => {
  it("formats each kind and leaves a missing value empty (never 0)", () => {
    expect(formatTile(tile({ value: 1234 }))).toBe("1,234");
    expect(formatTile(tile({ kind: "percent", value: 41 }))).toBe("41%");
    expect(formatTile(tile({ kind: "money", value: 1640.4 }))).toBe("$1,640");
    expect(formatTile(tile({ kind: "days", value: 6.4 }))).toBe("6.4 days");
    expect(formatTile(tile({ kind: "rating", value: 4 }))).toBe("4.0");
    expect(formatTile(tile({ kind: "text", value: "3 / 4" }))).toBe("3 / 4");
    expect(formatTile(tile({ value: null }))).toBe("");
    expect(formatTile(tile({ value: 0 }))).toBe("0");
  });
  it("writes Updated hh:mm", () => {
    expect(updatedLabel("2026-11-15T10:42:00")).toBe("Updated 10:42");
  });
});

describe("NumbersView", () => {
  it("shows the heading, Updated time, Refresh and the 7 / 30 / 90 picker", () => {
    const onWindow = vi.fn();
    const onRefresh = vi.fn();
    view(data([group("own", "ok", [tile({ label: "New learners", value: 23 })])]), {
      onWindow,
      onRefresh,
      windowDays: 30,
    });
    expect(screen.getByRole("heading", { name: "Numbers" })).toBeInTheDocument();
    expect(screen.getByText("Updated 10:42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(onWindow).toHaveBeenCalledWith(90);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalled();
  });
  it("renders a Connected group with real numbers, a real 0 as 0", () => {
    view(
      data([
        group("own", "ok", [
          tile({ id: "a", value: 23 }),
          tile({ id: "b", label: "Zero", value: 0 }),
        ]),
      ]),
    );
    const g = screen.getByRole("region", { name: "Our database" });
    expect(within(g).getByText("Connected")).toBeInTheDocument();
    expect(within(g).getByText("23")).toBeInTheDocument();
    expect(within(g).getByText("0")).toBeInTheDocument();
  });
  it("renders Not connected tiles with the reason and no number", () => {
    view(
      data([
        group("sentry", "not_connected", [
          tile({
            id: "c",
            label: "Crash-free sessions",
            value: null,
            reason: "Add a Sentry token (owner step)",
          }),
        ]),
      ]),
    );
    const g = screen.getByRole("region", { name: "Sentry" });
    expect(within(g).getByText("Not connected", { selector: "span" })).toBeInTheDocument();
    expect(within(g).getAllByText("Not connected").length).toBe(2);
    expect(within(g).getByText(/Add a Sentry token \(owner step\)/)).toBeInTheDocument();
    expect(within(g).queryByText("0")).toBeNull();
  });
  it("renders Could not load with one Try again that re-reads, other groups intact", () => {
    const onRefresh = vi.fn();
    view(
      data([
        group("revenuecat", "error", [
          tile({ id: "d", label: "Active Pro", value: null, reason: "Try again in a minute" }),
        ]),
        group("own", "ok", [tile({ value: 9 })]),
      ]),
      { onRefresh },
    );
    const rc = screen.getByRole("region", { name: "RevenueCat" });
    expect(within(rc).getAllByText("Could not load").length).toBe(2);
    fireEvent.click(within(rc).getByRole("button", { name: "Try again" }));
    expect(onRefresh).toHaveBeenCalled();
    expect(
      within(screen.getByRole("region", { name: "Our database" })).getByText("9"),
    ).toBeInTheDocument();
  });
  it("shows grey blocks while loading, and an error line", () => {
    view(null, { error: "Too many requests. Wait a minute and try again." });
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests");
  });
  it("lists rows for a list tile, with percent units", () => {
    view(
      data([
        group("sentry", "ok", [
          tile({
            id: "e",
            kind: "list",
            value: null,
            rows: [
              { label: "ios", value: 99.5, unit: "%" },
              { label: "web", value: 99, unit: "%" },
            ],
          }),
        ]),
      ]),
    );
    expect(screen.getByText("99.5%")).toBeInTheDocument();
  });
});
