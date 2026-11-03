// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockPathname = "/converse";
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to: string;
      params?: Record<string, string>;
      children: React.ReactNode;
    }) => (
      <a href={params ? to.replace(/\$(\w+)/, (_, k) => params[k]) : to} {...rest}>
        {children}
      </a>
    ),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: mockPathname } }),
  };
});

vi.mock("@/components/HectorInvite", () => ({
  HectorInvite: ({ source }: { source: string }) => (
    <div data-testid="hector-invite" data-source={source} />
  ),
}));
const { Route } = await import("./converse");
const { scenariosFor } = await import("../../data/scenarios");
const { campaignsFor } = await import("../../data/campaigns");
const { useProgress } = await import("../../lib/progress");

describe("Converse route", () => {
  beforeEach(() => useProgress.setState({ course: "en" }));
  afterEach(() => useProgress.setState({ course: "en" }));

  it("offers Hector to learners from the top of Practice (practice_hector_card)", () => {
    const ConversePage = Route.options.component!;
    render(<ConversePage />);
    expect(screen.getByTestId("hector-invite")).toHaveAttribute(
      "data-source",
      "practice_hector_card",
    );
  });

  it("lists every scenario with a link to its conversation", () => {
    const ConversePage = Route.options.component!;
    render(<ConversePage />);
    for (const s of scenariosFor("en")) {
      expect(screen.getByRole("heading", { name: s.title })).toBeInTheDocument();
      const link = screen.getByRole("link", { name: new RegExp(s.title) });
      expect(link).toHaveAttribute("href", `/converse/${s.id}`);
    }
  });

  // V4 candidate #4: campaigns render as an additive section above the
  // untouched scenario list -- see the campaigns data-shape design doc.
  it("lists every campaign with a link to its campaign chat", () => {
    const ConversePage = Route.options.component!;
    render(<ConversePage />);
    for (const c of campaignsFor("en")) {
      expect(screen.getByRole("heading", { name: c.title })).toBeInTheDocument();
      const link = screen.getByRole("link", { name: new RegExp(c.title) });
      expect(link).toHaveAttribute("href", `/campaign/${c.id}`);
    }
  });

  it("lists the active course's titles", () => {
    useProgress.setState({ course: "es" });
    const ConversePage = Route.options.component!;
    render(<ConversePage />);
    for (const s of scenariosFor("es")) {
      expect(screen.getByRole("heading", { name: s.title })).toBeInTheDocument();
    }
    for (const c of campaignsFor("es")) {
      expect(screen.getByRole("heading", { name: c.title })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Order coffee" })).toBeNull();
  });
  it("scenarios render as colour tiles, toned in list order", () => {
    const ConversePage = Route.options.component!;
    const { container } = render(<ConversePage />);
    const tiles = [...container.querySelectorAll<HTMLElement>("[data-scenario-tile] [data-tone]")];
    expect(tiles.length).toBe(scenariosFor("en").length);
    expect(tiles[0].dataset.tone).toBe("coral");
    expect(tiles[1].dataset.tone).toBe("sky");
    expect(tiles[5].dataset.tone).toBe("coral");
  });

  it("scenario tiles show 3D icons, not emoji text", () => {
    const ConversePage = Route.options.component!;
    const { container } = render(<ConversePage />);
    const first = container.querySelector("[data-scenario-tile]")!;
    expect(first.querySelector("img")?.getAttribute("src")).toMatch(/^\/icons3d\/.+\.png$/);
  });

  it("each campaign renders as a hero card with its scene count and 3D icon", () => {
    const ConversePage = Route.options.component!;
    const { container } = render(<ConversePage />);
    const heroes = container.querySelectorAll("[data-campaign-hero]");
    expect(heroes.length).toBe(campaignsFor("en").length);
    const c = campaignsFor("en")[0];
    expect(heroes[0]).toHaveTextContent(`${c.scenes.length} scenes`);
    expect(heroes[0].querySelector("img")?.getAttribute("src")).toMatch(/^\/icons3d\//);
  });

  it("campaign hero text is never faded (white on moss is only 4.52:1 in studio-ink)", () => {
    const ConversePage = Route.options.component!;
    const { container } = render(<ConversePage />);
    const hero = container.querySelector("[data-campaign-hero]")!;
    for (const el of hero.querySelectorAll("p, h2, span")) {
      expect(el.className).not.toMatch(/opacity-/);
    }
  });
});

describe("Practice in the cafe", () => {
  it("the cafe is behind Practice, the title on a card and the scenes on a sheet", () => {
    const ConversePage = Route.options.component!;
    const { container } = render(<ConversePage />);
    expect(container.querySelector('[data-scene="practice"] img')?.getAttribute("src")).toBe(
      "/scenes/practice.jpg",
    );
    const title = screen.getByRole("heading", { level: 1, name: "Practice out loud" });
    expect(title.closest("[data-surface]")).not.toBeNull();
    const sheet = container.querySelector("[data-sheet]") as HTMLElement;
    expect(within(sheet).getByRole("heading", { name: "Scenarios" })).toBeInTheDocument();
  });
});
