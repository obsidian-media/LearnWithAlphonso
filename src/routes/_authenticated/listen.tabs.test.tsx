// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrarySessionTab } from "../../components/ListenLibrary";
import { ListenBrowser } from "./listen";

const listStories = vi.fn();

vi.mock("../../lib/podcast.functions", () => ({
  listLibrary: async () => ({
    folders: [
      {
        id: "en",
        parentId: null,
        slug: "en",
        title: "English",
        description: null,
        sortOrder: 0,
        course: "en",
      },
      {
        id: "shop",
        parentId: "en",
        slug: "bookshop",
        title: "Bookshop",
        description: null,
        sortOrder: 0,
        course: null,
      },
    ],
    episodes: [
      {
        id: "e1",
        folderId: "shop",
        slug: "e1",
        title: "Episode title 1",
        description: null,
        audioUrl: "https://x.test/a.mp3",
        durationSeconds: 240,
        positionSeconds: 0,
        aiNarrated: false,
        sortOrder: 1,
        course: null,
      },
    ],
    progress: [],
    monthSeconds: 0,
  }),
  searchEpisodes: async () => [],
}));
vi.mock("../../lib/video.functions", () => ({
  listVideos: async () => [],
  saveVideoProgress: async () => undefined,
}));
vi.mock("../../lib/stories.functions", () => ({
  listStories: (args: unknown) => listStories(args),
}));
vi.mock("../../lib/podcast-quiz.functions", () => ({ fetchQuizEpisodeIds: async () => [] }));
vi.mock("../../components/PodcastQuizLauncher", () => ({ PodcastQuizLauncher: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    params: _p,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    params?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
}));

const story = {
  id: "s1",
  course: "en",
  level: "A2",
  slug: "package",
  title: "The Package Mix-Up",
  sortOrder: 1,
  published: true,
  branching: true,
  segmentIndex: 0,
  segmentCount: 5,
  bestCorrect: null,
  checkTotal: null,
  completed: false,
};

function renderBrowser() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ListenBrowser segments={[]} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetLibrarySessionTab();
  listStories.mockReset();
  listStories.mockResolvedValue({ stories: [story] });
});
afterEach(cleanup);

describe("the Library route: sub-tabs", () => {
  it("opens on All, and the Stories tab shows the course's stories read by the route", async () => {
    listStories.mockResolvedValue([story]);
    renderBrowser();
    expect(await screen.findByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The old standalone Stories entry link is gone: Stories is a sub-tab now.
    expect(screen.queryByText("Read along, level by level")).toBeNull();
    const peek = await screen.findByTestId("stories-peek");
    expect(within(peek).getByText("The Package Mix-Up")).toBeInTheDocument();
    expect(listStories).toHaveBeenCalledWith({ data: { course: "en" } });
    await userEvent.click(screen.getByRole("button", { name: "See all stories" }));
    expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /The Package Mix-Up/ })).toBeInTheDocument();
  });

  it("a failed stories read is its own error line and never hides the podcasts", async () => {
    listStories.mockRejectedValue(new Error("boom"));
    renderBrowser();
    expect(await screen.findByText("We couldn't load the stories.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Listen" }));
    expect(screen.getByRole("link", { name: /Bookshop/ })).toBeInTheDocument();
  });
});
