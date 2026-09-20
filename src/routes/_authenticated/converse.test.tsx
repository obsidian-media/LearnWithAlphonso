// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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
const { SCENARIOS } = await import("../../data/scenarios");

describe("Converse route", () => {
  it("lists every scenario with a link to its conversation", () => {
    const ConversePage = Route.options.component!;
    render(<ConversePage />);
    for (const s of SCENARIOS) {
      expect(screen.getByRole("heading", { name: s.title })).toBeInTheDocument();
      const link = screen.getByRole("link", { name: new RegExp(s.title) });
      expect(link).toHaveAttribute("href", `/converse/${s.id}`);
    }
  });
});
