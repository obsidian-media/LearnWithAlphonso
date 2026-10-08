// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

const { Route } = await import("./converse");
const { scenariosFor } = await import("../../data/scenarios");
const { campaignsFor } = await import("../../data/campaigns");
const { useProgress } = await import("../../lib/progress");

describe("Converse route", () => {
  beforeEach(() => useProgress.setState({ course: "en" }));
  afterEach(() => useProgress.setState({ course: "en" }));

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
});
