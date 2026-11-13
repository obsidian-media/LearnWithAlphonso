// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const shelfVideo = {
  id: "v1",
  slug: "en-a",
  course: "en",
  title: "Deep linked video",
  description: null,
  level: "A1",
  durationSeconds: 49,
  videoUrl: "https://x.test/a.mp4",
  posterUrl: null,
  captionsUrl: "https://x.test/a.vtt",
  tags: [],
  practice: null,
  sortOrder: 0,
  progressSeconds: 0,
  completedAt: null,
};

vi.mock("../../lib/video.functions", () => ({
  listVideos: async () => [shelfVideo],
  saveVideoProgress: async () => undefined,
}));
vi.mock("../../lib/podcast.functions", () => ({
  listLibrary: async () => ({ folders: [], episodes: [], progress: {}, monthSeconds: 0 }),
  searchEpisodes: async () => [],
}));
vi.mock("../../lib/podcast-quiz.functions", () => ({ fetchQuizEpisodeIds: async () => [] }));
vi.mock("../../components/PodcastQuizLauncher", () => ({ PodcastQuizLauncher: () => null }));
vi.mock("../../components/ListenLibrary", () => ({
  ListenLibraryView: () => <p>library</p>,
  ListenShelfView: () => null,
}));
vi.mock("../../components/VideoPlayerSheet", () => ({
  VideoPlayerSheet: ({ video }: { video: { title: string } }) => <p>{`playing ${video.title}`}</p>,
}));
vi.mock("../../components/AppShell", () => ({
  MobileFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  Outlet: () => null,
  useChildMatches: () => [],
  useSearch: () => ({}),
  createFileRoute: () => () => ({}),
}));

afterEach(cleanup);

async function tree(openVideoId?: string) {
  const { ListenBrowser } = await import("./listen");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ListenBrowser segments={[]} openVideoId={openVideoId} />
    </QueryClientProvider>
  );
}

describe("the /listen?video= deep link", () => {
  it("opens the player at mount", async () => {
    render(await tree("v1"));
    expect(await screen.findByText("playing Deep linked video")).toBeInTheDocument();
  });

  it("reopens the player when the search param changes while the page stays mounted", async () => {
    const { rerender } = render(await tree(undefined));
    await screen.findByText("library");
    expect(screen.queryByText(/^playing/)).not.toBeInTheDocument();
    rerender(await tree("v1"));
    expect(await screen.findByText("playing Deep linked video")).toBeInTheDocument();
  });
});
