// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeView } from "./HomeView";
import { homeCardsFor } from "../../lib/staff-home-cards";

const counts = {
  support: { open: 4, unassigned: 2 },
  reports: { open: 3 },
  numbers: { newLearnersToday: 23 },
};

describe("homeCardsFor", () => {
  it("one card per scope, none without it", () => {
    expect(homeCardsFor([])).toEqual([]);
    expect(homeCardsFor(["users.read"])).toEqual([]);
    expect(homeCardsFor(["support.read"])).toEqual(["support"]);
    expect(homeCardsFor(["reports.manage"])).toEqual(["reports"]);
    expect(homeCardsFor(["numbers.read"])).toEqual(["numbers"]);
    expect(homeCardsFor(["numbers.read", "support.read", "reports.manage"])).toEqual([
      "support",
      "reports",
      "numbers",
    ]);
  });
});

describe("HomeView", () => {
  it("shows only the cards the viewer's scopes allow, with counts only", () => {
    render(<HomeView scopes={["support.read"]} counts={counts} />);
    expect(screen.getByText("open tickets, 2 unassigned")).toBeTruthy();
    expect(screen.queryByText("open reports")).toBeNull();
    expect(screen.queryByText("new learners today")).toBeNull();
  });

  it("an owner sees all three", () => {
    render(
      <HomeView scopes={["support.read", "reports.manage", "numbers.read"]} counts={counts} />,
    );
    expect(screen.getByText("open tickets, 2 unassigned")).toBeTruthy();
    expect(screen.getByText("open reports")).toBeTruthy();
    expect(screen.getByText("new learners today")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
  });

  it("a person with no cards gets the no-pages page", () => {
    render(<HomeView scopes={["users.read"]} counts={counts} />);
    expect(screen.getByText("Your account has no console pages yet. Ask the owner.")).toBeTruthy();
    expect(screen.queryByText("What needs you today.")).toBeNull();
  });

  it("a count that could not be read says so, never 0", () => {
    render(<HomeView scopes={["reports.manage"]} counts={{ reports: null }} />);
    expect(screen.getByText("Could not read this count.")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
