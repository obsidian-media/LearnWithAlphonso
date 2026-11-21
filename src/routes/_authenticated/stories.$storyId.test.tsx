// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const params = vi.hoisted(() => ({ storyId: "garbage" }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: "/stories/x" } }),
  };
});

const getStory = vi.fn();
vi.mock("../../lib/stories.functions", () => ({
  getStory,
  saveStoryProgress: vi.fn(),
  completeStoryCheck: vi.fn(),
  finishBranchingStory: vi.fn(),
}));

const { Route } = await import("./stories.$storyId");

const GOOD_ID = "0b6f1a52-3c1e-4c1b-9a53-2f4d3e9a7c10";

function renderPage(
  storyId: string,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  params.storyId = storyId;
  (Route as unknown as { useParams: () => { storyId: string } }).useParams = () => ({
    storyId: params.storyId,
  });
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => getStory.mockReset());

describe("a story that is not there", () => {
  it("a mistyped id says so, links back to Stories, and never asks the server", async () => {
    renderPage("garbage");
    expect(await screen.findByText("We couldn't find this story")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Stories" })).toHaveAttribute(
      "href",
      "/stories",
    );
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    expect(getStory).not.toHaveBeenCalled();
  });

  it("a valid id with no published story (zero rows) says the same", async () => {
    getStory.mockResolvedValue(null);
    renderPage(GOOD_ID);
    expect(await screen.findByText("We couldn't find this story")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Stories" })).toBeInTheDocument();
  });

  it("a real failure keeps the connection message", async () => {
    // The query is already in its failed state (a rejected promise from a mock trips vitest's unhandled-error
    // check even though the query handles it), and nothing refetches it.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client
      .getQueryCache()
      .build(client, { queryKey: ["story", GOOD_ID] })
      .setState({
        status: "error",
        error: new Error("network down"),
        fetchStatus: "idle",
      });
    renderPage(GOOD_ID, client);
    expect(await screen.findByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't find this story")).toBeNull();
  });
});
