// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePodcastPlayer } from "../lib/podcast-player";
import type { PodcastLibrary } from "../lib/podcast.functions";
import { ListenLibraryView, ListenShelfView, resetLibrarySessionTab } from "./ListenLibrary";
import type { StorySummary } from "../lib/stories";
import { buildShelves } from "../lib/listen-library";
import type { LibraryVideo } from "../lib/video-library";

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
}));
vi.mock("./PodcastQuizLauncher", () => ({ PodcastQuizLauncher: () => null }));

afterEach(cleanup);
beforeEach(() => {
  usePodcastPlayer.setState({ episode: null, isPlaying: false });
  resetLibrarySessionTab();
});

const folder = (
  id: string,
  parentId: string | null,
  slug: string,
  course: "en" | "fr" | "es" | null = null,
) => ({
  id,
  parentId,
  slug,
  title: slug === "bookshop" ? "Bookshop" : slug,
  description: null,
  sortOrder: 0,
  course,
});
const ep = (id: string, n: number, dur: number, folderId = "shop") => ({
  id,
  folderId,
  slug: id,
  title: `Episode title ${n}`,
  description: null,
  audioUrl: "https://x.test/a.mp3",
  durationSeconds: dur,
  positionSeconds: 0,
  aiNarrated: false,
  sortOrder: n,
  course: null,
});
const lib = (over: Partial<PodcastLibrary> = {}): PodcastLibrary => ({
  folders: [
    folder("en", null, "en", "en"),
    folder("a2", "en", "a2"),
    folder("shop", "a2", "bookshop"),
  ],
  episodes: [ep("e1", 1, 240), ep("e2", 2, 600), ep("e3", 3, 300)],
  progress: [],
  monthSeconds: 0,
  ...over,
});

describe("Listen library", () => {
  it("shows a designed empty state, and no continue card, when nothing is published", () => {
    render(<ListenLibraryView library={lib({ episodes: [] })} initialTab="listen" />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByText("CONTINUE LISTENING")).not.toBeInTheDocument();
  });

  it("draws one room per folder with its own count and percent from the data", () => {
    render(
      <ListenLibraryView
        library={lib({
          progress: [{ episodeId: "e1", positionS: 0, completedAt: "t", updatedAt: "2026-01-01" }],
        })}
        initialTab="listen"
      />,
    );
    const link = screen.getByRole("link", { name: /Bookshop/ });
    expect(link).toHaveAccessibleName("Bookshop, A2, 3 episodes, 33 percent done");
    expect(within(link).getByText(/3 episodes · 33%/)).toBeInTheDocument();
  });

  it("offers continue listening with the minutes left, and plays that episode", async () => {
    render(
      <ListenLibraryView
        library={lib({
          progress: [
            { episodeId: "e2", positionS: 230, completedAt: null, updatedAt: "2026-01-01" },
          ],
        })}
      />,
    );
    const card = screen.getByRole("button", {
      name: "Continue Bookshop, episode 2 of 3: Episode title 2, 6:10 left",
    });
    expect(within(card).getByText("Episode 2 of 3 · 6:10 left")).toBeInTheDocument();
    // The new studio art, filling the card (the platform crops the centre of the square picture).
    expect(card.querySelector("img")).toHaveAttribute("src", "/avatar/scenes/continue-studio.webp");
    await userEvent.click(card);
    expect(usePodcastPlayer.getState().episode?.id).toBe("e2");
  });

  it("only offers levels that exist and filters by the chosen one", async () => {
    const l = lib({
      folders: [...lib().folders, folder("b1", "en", "b1"), folder("sea", "b1", "seaside")],
      episodes: [...lib().episodes, ep("s1", 1, 100, "sea")],
    });
    render(<ListenLibraryView library={l} initialTab="listen" />);
    expect(screen.queryByRole("button", { name: "C1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "B1" }));
    expect(screen.queryByRole("link", { name: /Bookshop/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /seaside/ })).toBeInTheDocument();
  });

  it("the course switch hides other courses' folders", async () => {
    render(<ListenLibraryView library={lib()} initialTab="listen" />);
    await userEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByText(/No Français episodes/)).toBeInTheDocument();
  });

  it("shows the month total only when there is one", () => {
    const { unmount } = render(<ListenLibraryView library={lib()} initialTab="listen" />);
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
    unmount();
    render(<ListenLibraryView library={lib({ monthSeconds: 12000 })} initialTab="listen" />);
    expect(screen.getByText(/3 h 20 m this month/)).toBeInTheDocument();
  });
});

describe("Listen folder view", () => {
  const shelfOf = (l: PodcastLibrary) => buildShelves(l.folders, l.episodes, l.progress, "en")[0]!;

  it("labels each episode by its state: finished, in progress with time left, new", () => {
    const l = lib({
      progress: [
        { episodeId: "e1", positionS: 0, completedAt: "t", updatedAt: "2026-01-01" },
        { episodeId: "e2", positionS: 360, completedAt: null, updatedAt: "2026-01-02" },
      ],
    });
    render(<ListenShelfView library={l} shelf={shelfOf(l)} />);
    expect(
      screen.getByRole("button", { name: "Episode title 1, 4:00, finished" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Episode title 2, 10:00, 4:00 left" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Episode title 3, 5:00, new" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Episode title 2 progress" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
    expect(screen.getByRole("button", { name: /Continue Episode 2/ })).toBeInTheDocument();
  });

  it("offers Start Episode 1 when nothing has been heard, and no button when everything is done", () => {
    const l = lib();
    const { unmount } = render(<ListenShelfView library={l} shelf={shelfOf(l)} />);
    expect(screen.getByRole("button", { name: /Start Episode 1/ })).toBeInTheDocument();
    unmount();
    const done = lib({
      progress: ["e1", "e2", "e3"].map((id) => ({
        episodeId: id,
        positionS: 0,
        completedAt: "t",
        updatedAt: "2026-01-01",
      })),
    });
    render(<ListenShelfView library={done} shelf={shelfOf(done)} />);
    expect(
      screen.queryByRole("button", { name: /Continue Episode|Start Episode/ }),
    ).not.toBeInTheDocument();
  });

  it("tapping a row plays that episode", async () => {
    const l = lib();
    render(<ListenShelfView library={l} shelf={shelfOf(l)} />);
    await userEvent.click(screen.getByRole("button", { name: /Episode title 3/ }));
    expect(usePodcastPlayer.getState().episode?.id).toBe("e3");
  });
});

describe("Library: the Watch shelf", () => {
  const vid = (over: Partial<LibraryVideo> = {}): LibraryVideo => ({
    id: "v1",
    slug: "en-a",
    course: "en",
    title: "I'd like vs I want",
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
    ...over,
  });

  it("is named Library, with the videos on All and the podcast rooms under Listen", async () => {
    render(<ListenLibraryView library={lib()} videos={[vid()]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Watch" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bookshop/ })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Listen" }));
    expect(screen.getByRole("link", { name: /Bookshop/ })).toBeInTheDocument();
  });

  it("hides the shelf (no empty box) when there are no videos, none for this course, or they are still loading", () => {
    const { rerender } = render(<ListenLibraryView library={lib()} videos={[]} />);
    expect(screen.queryByTestId("watch-shelf")).toBeNull();
    rerender(<ListenLibraryView library={lib()} videos={[vid({ course: "fr" })]} />);
    expect(screen.queryByTestId("watch-shelf")).toBeNull();
    rerender(<ListenLibraryView library={lib()} />);
    expect(screen.queryByTestId("watch-shelf")).toBeNull();
  });

  it("follows the course switch: French videos appear under Français", async () => {
    render(
      <ListenLibraryView library={lib()} videos={[vid({ course: "fr", title: "Au café" })]} />,
    );
    expect(screen.queryByRole("button", { name: /Au café/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByRole("button", { name: /Au café/ })).toBeInTheDocument();
  });

  it("opens the player for the tapped video", async () => {
    const onOpenVideo = vi.fn();
    render(<ListenLibraryView library={lib()} videos={[vid()]} onOpenVideo={onOpenVideo} />);
    await userEvent.click(screen.getByRole("button", { name: /I'd like vs I want/ }));
    expect(onOpenVideo).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
  });

  it("shows the existing error pattern with Try again when the videos fail to load, instead of hiding it", async () => {
    const onRetryVideos = vi.fn();
    render(
      <ListenLibraryView
        library={lib()}
        videosFailed
        onRetryVideos={onRetryVideos}
        videos={undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the videos.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryVideos).toHaveBeenCalled();
    expect(screen.queryByTestId("watch-shelf")).toBeNull();
  });
});

describe("Library: the All, Listen, Watch and Stories tabs", () => {
  const vid = (n: number, over: Partial<LibraryVideo> = {}): LibraryVideo => ({
    id: `v${n}`,
    slug: `en-${n}`,
    course: "en",
    title: `Video ${n}`,
    description: null,
    level: "A1",
    durationSeconds: 49,
    videoUrl: "https://x.test/a.mp4",
    posterUrl: null,
    captionsUrl: "https://x.test/a.vtt",
    tags: [],
    practice: null,
    sortOrder: n,
    progressSeconds: 0,
    completedAt: null,
    ...over,
  });
  const story = (n: number, over: Partial<StorySummary> = {}): StorySummary => ({
    id: `s${n}`,
    course: "en",
    level: "A2",
    slug: `story-${n}`,
    title: `Story ${n}`,
    sortOrder: n,
    published: true,
    branching: false,
    segmentIndex: 0,
    segmentCount: 5,
    bestCorrect: null,
    checkTotal: null,
    completed: false,
    ...over,
  });
  const videos = [1, 2, 3, 4, 5].map((n) => vid(n));
  const stories = [1, 2, 3, 4].map((n) => story(n, { branching: n === 1 }));

  it("is a real tab control: four tabs, All selected by default, one panel", () => {
    render(<ListenLibraryView library={lib()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["All", "Listen", "Watch", "Stories"]);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Watch" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "library-tab-all");
  });

  it("moves between tabs with the arrow keys (selected state follows)", async () => {
    render(<ListenLibraryView library={lib()} />);
    screen.getByRole("tab", { name: "All" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Listen" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("All: a Continue card plus one-row peeks of Watch and Stories, no room grid", () => {
    render(
      <ListenLibraryView
        library={lib({
          progress: [{ episodeId: "e1", positionS: 0, completedAt: "t", updatedAt: "2026-01-01" }],
        })}
        videos={videos}
        stories={stories}
      />,
    );
    expect(screen.getByTestId("continue-card")).toBeInTheDocument();
    const watch = screen.getByTestId("watch-shelf");
    expect(within(watch).getAllByRole("button", { name: /Video \d/ })).toHaveLength(3);
    const peek = screen.getByTestId("stories-peek");
    expect(within(peek).getAllByRole("link")).toHaveLength(3);
    expect(
      within(peek).getByRole("link", { name: /Story 1.*Choose your path/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bookshop/ })).toBeNull();
  });

  it("See all switches to the focused tab and shows everything", async () => {
    render(<ListenLibraryView library={lib()} videos={videos} stories={stories} />);
    await userEvent.click(screen.getByRole("button", { name: "See all videos" }));
    expect(screen.getByRole("tab", { name: "Watch" })).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByTestId("watch-shelf")).getAllByRole("button", { name: /Video \d/ }),
    ).toHaveLength(5);
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "See all stories" }));
    expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("link", { name: /Story \d/ })).toHaveLength(4);
    expect(screen.getAllByText("Choose your path").length).toBeGreaterThan(0);
  });

  it("Listen holds the rooms, level chips and month stat, and none of the other shelves", async () => {
    render(
      <ListenLibraryView
        library={lib({ monthSeconds: 12000 })}
        videos={videos}
        stories={stories}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Listen" }));
    expect(screen.getByRole("link", { name: /Bookshop/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Level" })).toBeInTheDocument();
    expect(screen.getByText(/this month/)).toBeInTheDocument();
    expect(screen.queryByTestId("watch-shelf")).toBeNull();
    expect(screen.queryByTestId("stories-peek")).toBeNull();
    expect(screen.queryByTestId("continue-card")).toBeNull();
  });

  it("remembers the chosen tab for the session, and a fresh launch starts on All", async () => {
    const first = render(<ListenLibraryView library={lib()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Watch" }));
    first.unmount();
    const back = render(<ListenLibraryView library={lib()} />);
    expect(screen.getByRole("tab", { name: "Watch" })).toHaveAttribute("aria-selected", "true");
    back.unmount();
    resetLibrarySessionTab();
    render(<ListenLibraryView library={lib()} />);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("posters carry state and length: New, in progress with a bar, watched with a tick", () => {
    render(
      <ListenLibraryView
        library={lib()}
        initialTab="watch"
        videos={[
          vid(1),
          vid(2, { progressSeconds: 25 }),
          vid(3, { completedAt: "2026-11-14T00:00:00Z" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Video 1, 0:49, new" })).toHaveTextContent("NEW");
    expect(screen.getByRole("button", { name: "Video 2, 0:49, in progress" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Video 2 progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video 3, 0:49, watched" })).toHaveTextContent("✓");
  });

  it("the Continue card is one labelled button: nothing heard offers none, then the next new episode of the series", async () => {
    const { unmount } = render(<ListenLibraryView library={lib()} />);
    expect(screen.queryByTestId("continue-card")).toBeNull();
    unmount();
    render(
      <ListenLibraryView
        library={lib({
          progress: [{ episodeId: "e1", positionS: 0, completedAt: "t", updatedAt: "2026-01-01" }],
        })}
      />,
    );
    const card = screen.getByRole("button", {
      name: "Continue Bookshop, episode 2 of 3: Episode title 2, 10:00",
    });
    await userEvent.click(card);
    expect(usePodcastPlayer.getState().episode?.id).toBe("e2");
  });

  it("Stories: a loading line, an error with Try again, and the real list", async () => {
    const retry = vi.fn();
    const { rerender } = render(<ListenLibraryView library={lib()} initialTab="stories" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    rerender(
      <ListenLibraryView
        library={lib()}
        initialTab="stories"
        storiesFailed
        onRetryStories={retry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    rerender(<ListenLibraryView library={lib()} initialTab="stories" stories={stories} />);
    expect(screen.getAllByRole("link", { name: /Story \d/ })).toHaveLength(4);
  });
});
