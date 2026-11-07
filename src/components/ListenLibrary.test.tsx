// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePodcastPlayer } from "../lib/podcast-player";
import type { PodcastLibrary } from "../lib/podcast.functions";
import { ListenLibraryView, ListenShelfView } from "./ListenLibrary";
import { buildShelves } from "../lib/listen-library";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, params: _p, ...rest }: { to: string; children: React.ReactNode; params?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./PodcastQuizLauncher", () => ({ PodcastQuizLauncher: () => null }));

afterEach(cleanup);
beforeEach(() => usePodcastPlayer.setState({ episode: null, isPlaying: false }));

const folder = (id: string, parentId: string | null, slug: string, course: "en" | "fr" | "es" | null = null) => ({
  id, parentId, slug, title: slug === "bookshop" ? "Bookshop" : slug, description: null, sortOrder: 0, course,
});
const ep = (id: string, n: number, dur: number, folderId = "shop") => ({
  id, folderId, slug: id, title: `Episode title ${n}`, description: null, audioUrl: "https://x.test/a.mp3",
  durationSeconds: dur, positionSeconds: 0, aiNarrated: false, sortOrder: n, course: null,
});
const lib = (over: Partial<PodcastLibrary> = {}): PodcastLibrary => ({
  folders: [folder("en", null, "en", "en"), folder("a2", "en", "a2"), folder("shop", "a2", "bookshop")],
  episodes: [ep("e1", 1, 240), ep("e2", 2, 600), ep("e3", 3, 300)],
  progress: [],
  monthSeconds: 0,
  ...over,
});

describe("Listen library", () => {
  it("shows a designed empty state, and no continue card, when nothing is published", () => {
    render(<ListenLibraryView library={lib({ episodes: [] })} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    expect(screen.queryByText("CONTINUE LISTENING")).not.toBeInTheDocument();
  });

  it("draws one room per folder with its own count and percent from the data", () => {
    render(
      <ListenLibraryView
        library={lib({ progress: [{ episodeId: "e1", positionS: 0, completedAt: "t", updatedAt: "2026-01-01" }] })}
      />,
    );
    const link = screen.getByRole("link", { name: /Bookshop/ });
    expect(link).toHaveAccessibleName("Bookshop, A2, 3 episodes, 33 percent done");
    expect(within(link).getByText(/3 episodes · 33%/)).toBeInTheDocument();
  });

  it("offers continue listening with the minutes left, and plays that episode", async () => {
    render(
      <ListenLibraryView
        library={lib({ progress: [{ episodeId: "e2", positionS: 230, completedAt: null, updatedAt: "2026-01-01" }] })}
      />,
    );
    const card = screen.getByRole("button", { name: /Continue listening: Episode title 2, 6:10 left/ });
    await userEvent.click(card);
    expect(usePodcastPlayer.getState().episode?.id).toBe("e2");
  });

  it("only offers levels that exist and filters by the chosen one", async () => {
    const l = lib({
      folders: [...lib().folders, folder("b1", "en", "b1"), folder("sea", "b1", "seaside")],
      episodes: [...lib().episodes, ep("s1", 1, 100, "sea")],
    });
    render(<ListenLibraryView library={l} />);
    expect(screen.queryByRole("button", { name: "C1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "B1" }));
    expect(screen.queryByRole("link", { name: /Bookshop/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /seaside/ })).toBeInTheDocument();
  });

  it("the course switch hides other courses' folders", async () => {
    render(<ListenLibraryView library={lib()} />);
    await userEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByText(/No Français episodes/)).toBeInTheDocument();
  });

  it("shows the month total only when there is one", () => {
    const { unmount } = render(<ListenLibraryView library={lib()} />);
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
    unmount();
    render(<ListenLibraryView library={lib({ monthSeconds: 12000 })} />);
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
    expect(screen.getByRole("button", { name: "Episode title 1, 4:00, finished" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Episode title 2, 10:00, 4:00 left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Episode title 3, 5:00, new" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Episode title 2 progress" })).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByRole("button", { name: /Continue Episode 2/ })).toBeInTheDocument();
  });

  it("offers Start Episode 1 when nothing has been heard, and no button when everything is done", () => {
    const l = lib();
    const { unmount } = render(<ListenShelfView library={l} shelf={shelfOf(l)} />);
    expect(screen.getByRole("button", { name: /Start Episode 1/ })).toBeInTheDocument();
    unmount();
    const done = lib({
      progress: ["e1", "e2", "e3"].map((id) => ({ episodeId: id, positionS: 0, completedAt: "t", updatedAt: "2026-01-01" })),
    });
    render(<ListenShelfView library={done} shelf={shelfOf(done)} />);
    expect(screen.queryByRole("button", { name: /Continue Episode|Start Episode/ })).not.toBeInTheDocument();
  });

  it("tapping a row plays that episode", async () => {
    const l = lib();
    render(<ListenShelfView library={l} shelf={shelfOf(l)} />);
    await userEvent.click(screen.getByRole("button", { name: /Episode title 3/ }));
    expect(usePodcastPlayer.getState().episode?.id).toBe("e3");
  });
});
