// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    // MobileFrame renders BottomTabs, which calls useRouterState -- the
    // real implementation needs a <RouterProvider>, so it's stubbed here
    // the same way profile_.friends.test.tsx does for its own BottomTabs.
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/season" } }),
  };
});

const getSeasonStatus = vi.fn();
vi.mock("../../lib/season.functions", () => ({ getSeasonStatus }));

const { Route } = await import("./season");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getSeasonStatus.mockReset();
});

describe("Season page", () => {
  it("shows the current division and rank", async () => {
    getSeasonStatus.mockResolvedValue({
      division: 3,
      rankInCohort: 5,
      cohortSize: 28,
      lastWeekResult: null,
    });
    renderPage();
    expect(await screen.findByText("Division 3")).toBeInTheDocument();
    expect(screen.getByText("Rank 5 of 28 this week")).toBeInTheDocument();
  });

  it("shows last week's result when present", async () => {
    getSeasonStatus.mockResolvedValue({
      division: 3,
      rankInCohort: 5,
      cohortSize: 28,
      lastWeekResult: { division: 2, rankInCohort: 1, cohortSize: 25 },
    });
    renderPage();
    expect(await screen.findByText(/Last week: Division 2, rank 1 of/)).toBeInTheDocument();
  });

  it("shows a fallback message when status fails to load", async () => {
    getSeasonStatus.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("Couldn't load your season status.")).toBeInTheDocument();
  });
});
