// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListenFolderView, PodcastSearchResults } from "./listen";

vi.mock("../../lib/video.functions", () => ({
  listVideos: async () => [],
  saveVideoProgress: async () => undefined,
}));
vi.mock("../../components/PodcastQuizLauncher", () => ({
  PodcastQuizLauncher: ({ episode }: { episode: { title: string } }) => (
    <button type="button">{`Take the quiz: ${episode.title}`}</button>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
}));

const folders = [
  { id: "a", parentId: null, slug: "en", title: "English", description: null, sortOrder: 0 },
  { id: "b", parentId: "a", slug: "a1", title: "A1 Beginner", description: null, sortOrder: 0 },
];

const episode = {
  id: "e1",
  folderId: "b",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/x.mp3",
  durationSeconds: 305,
  positionSeconds: 0,
  aiNarrated: false,
};

describe("ListenFolderView", () => {
  it("offers a quiz only on the episodes that have one", () => {
    const withQuiz = { ...episode, id: "e1", title: "Ordering Coffee" };
    const without = { ...episode, id: "e2", slug: "other", title: "No Quiz Here" };
    render(
      <ListenFolderView
        folders={folders}
        episodes={[withQuiz, without]}
        segments={["en", "a1"]}
        quizEpisodeIds={new Set(["e1"])}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Take the quiz: Ordering Coffee" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Take the quiz: No Quiz Here" }),
    ).not.toBeInTheDocument();
  });

  it("shows no quiz buttons when none are known", () => {
    render(<ListenFolderView folders={folders} episodes={[episode]} segments={["en", "a1"]} />);
    expect(screen.queryByRole("button", { name: /Take the quiz/ })).not.toBeInTheDocument();
  });

  it("lists the child folders of the current level", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en"]} />);
    expect(screen.getByText("A1 Beginner")).toBeInTheDocument();
  });

  it("lists episodes with their duration", () => {
    render(<ListenFolderView folders={folders} episodes={[episode]} segments={["en", "a1"]} />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
    expect(screen.getByText("5:05")).toBeInTheDocument();
  });

  it("labels an AI-narrated episode and only that one", () => {
    const narrated = { ...episode, id: "e2", title: "Market Day", aiNarrated: true };
    render(
      <ListenFolderView folders={folders} episodes={[episode, narrated]} segments={["en", "a1"]} />,
    );
    expect(screen.getAllByText("AI-narrated")).toHaveLength(1);
    expect(screen.getByText("Market Day").closest("button")).toHaveTextContent("AI-narrated");
    expect(screen.getByText("Ordering Coffee").closest("button")).not.toHaveTextContent(
      "AI-narrated",
    );
  });

  it("shows an empty state for a folder with no children or episodes", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "a1"]} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("shows a not-found state for a path that does not resolve", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "nope"]} />);
    expect(screen.getByText(/couldn't find that folder/i)).toBeInTheDocument();
  });

  it("lists the root folders at the top level", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={[]} />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });
});

describe("PodcastSearchResults", () => {
  const results = [episode];

  it("lists matching episodes", () => {
    render(<PodcastSearchResults query="coffee" results={results} isLoading={false} />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("labels AI-narrated search results", () => {
    render(
      <PodcastSearchResults
        query="coffee"
        results={[{ ...episode, aiNarrated: true }]}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
    expect(screen.getByText("AI-narrated")).toBeInTheDocument();
  });

  it("says nothing matched rather than showing an empty list", () => {
    render(<PodcastSearchResults query="zzzz" results={[]} isLoading={false} />);
    expect(screen.getByText(/no episodes match/i)).toBeInTheDocument();
  });

  // A one-character query matches nearly everything, so the query builder
  // returns null and the handler returns []. Reporting "no episodes match"
  // for that would be a lie: the search never ran.
  it("asks for more characters instead of claiming nothing matched", () => {
    render(<PodcastSearchResults query="c" results={[]} isLoading={false} />);
    expect(screen.getByText(/keep typing/i)).toBeInTheDocument();
    expect(screen.queryByText(/no episodes match/i)).not.toBeInTheDocument();
  });

  it("shows a searching state rather than a premature empty state", () => {
    render(<PodcastSearchResults query="coffee" results={[]} isLoading />);
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
    expect(screen.queryByText(/no episodes match/i)).not.toBeInTheDocument();
  });

  it("folder and episode rows carry 3D icons on colour tiles", () => {
    const { container } = render(
      <ListenFolderView folders={folders} episodes={[episode]} segments={["en", "a1"]} />,
    );
    const icons = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(icons).toContain("/icons3d/headphone.png");
    expect(container.querySelector("[data-tone]")).not.toBeNull();
  });

  it("the empty state shows Alphonso", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "a1"]} />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });
});

describe("Listen in the studio", () => {
  it("the folder tree sits in front of the radio studio, under a large title", () => {
    const { container } = render(
      <ListenFolderView folders={folders} episodes={[]} segments={[]} />,
    );
    expect(container.querySelector('[data-scene="listen"] img')?.getAttribute("src")).toBe(
      "/scenes/listen.jpg",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Library" }).className).toContain(
      "text-3xl",
    );
  });

  it("search results keep the studio behind them", () => {
    const { container } = render(
      <PodcastSearchResults query="coffee" results={[]} isLoading={false} />,
    );
    expect(container.querySelector('[data-scene="listen"]')).not.toBeNull();
  });

  it("the empty state sits on a card, not straight on the scene", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "a1"]} />);
    const text = screen.getByText(/Nothing here yet/);
    expect(text.closest("[data-surface]")).not.toBeNull();
  });
});

describe("Listen folder not found", () => {
  it("the message and the way back sit on a card above the scene", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "nope"]} />);
    const text = screen.getByText(/couldn.t find that folder/i);
    expect(text.closest("[data-surface]")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to all folders" }).closest("[data-surface]"),
    ).not.toBeNull();
  });
});

describe("Listen while loading", () => {
  it("the studio is already there while the folders load, so it does not pop in", async () => {
    const { ListenBrowser } = await import("./listen");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ListenBrowser segments={[]} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(container.querySelector('[data-scene="listen"]')).not.toBeNull();
  });
});
