// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

let mockPathname = "/learn";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}));

const { TopBar, BottomTabs, MobileFrame, LessonFrame } = await import("./AppShell");
const { useProgress } = await import("../lib/progress");
const { DsIcon } = await import("./ds/DsIcon");

beforeEach(() => {
  mockPathname = "/learn";
  useProgress.getState().reset();
});

afterEach(() => {
  useProgress.getState().reset();
});

describe("TopBar", () => {
  it("shows placeholder stats before hydration", () => {
    useProgress.setState({ hydrated: false, xp: 999, streak: 999, hearts: 999 });
    render(<TopBar />);
    expect(screen.getByLabelText("Streak")).toHaveTextContent("0");
    expect(screen.getByLabelText("XP")).toHaveTextContent("0");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("5");
  });

  it("shows real stats once hydrated", () => {
    useProgress.setState({ hydrated: true, xp: 120, streak: 4, hearts: 3 });
    render(<TopBar />);
    // The spoken label is the shown streak's, as on iOS and Android.
    expect(screen.getByLabelText("Streak: 4 days")).toHaveTextContent("4");
    expect(screen.getByLabelText("XP")).toHaveTextContent("120");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("3");
  });

  it("shows the streak as it reads today: protected by a freeze, or 0 once the run is over", () => {
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    useProgress.setState({
      hydrated: true,
      streak: 12,
      lastActiveDate: day(-2),
      streakFreezes: 1,
      dayBasis: "local",
    });
    const { unmount } = render(<TopBar />);
    const pill = screen.getByLabelText("12-day streak, protected by a streak freeze");
    expect(pill).toHaveTextContent("12");
    expect(pill).toHaveTextContent("❄️");
    unmount();
    useProgress.setState({ streakFreezes: 0 });
    render(<TopBar />);
    expect(screen.getByLabelText("Streak: 0 days")).toHaveTextContent("0");
  });

  it("shows the wait for the next heart while hearts are below the cap, and nothing at full hearts", () => {
    useProgress.setState({ hydrated: true, hearts: 3, heartsRefillAt: Date.now() + 90_000 });
    const { unmount } = render(<TopBar />);
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("+1 in 1:30");
    unmount();
    useProgress.setState({ hydrated: true, hearts: 5, heartsRefillAt: null });
    render(<TopBar />);
    expect(screen.getByLabelText("Hearts")).not.toHaveTextContent("+1 in");
  });

  it("shows the real brand mark and name at the left, not a league shield", () => {
    render(<TopBar />);
    const home = screen.getByRole("link", { name: "Learn with Alphonso, home" });
    expect(home).toHaveAttribute("href", "/learn");
    expect(home.querySelector('img[src="/icon-192.png"]')).not.toBeNull();
    expect(home).toHaveTextContent("Alphonso");
    expect(home.querySelector("svg")).toBeNull();
  });

  it("keeps the learner's league badge, apart from the brand, linking to the league", () => {
    useProgress.setState({ hydrated: true, leagueTier: "sapphire" });
    render(<TopBar />);
    const badge = screen.getByLabelText("Grove league");
    const league = badge.closest("a");
    expect(league).toHaveAttribute("href", "/league");
    expect(screen.getByRole("link", { name: "Learn with Alphonso, home" })).not.toContainElement(
      badge,
    );
  });

  it("announces a stat change to screen readers after hydration", () => {
    useProgress.setState({ hydrated: true, xp: 100, streak: 1, hearts: 5 });
    const { rerender } = render(<TopBar />);
    useProgress.setState({ xp: 150 });
    rerender(<TopBar />);
    expect(screen.getByRole("status")).toHaveTextContent("+50 XP");
  });
});

describe("BottomTabs", () => {
  const tabs = () =>
    within(screen.getByRole("navigation"))
      .getAllByRole("link")
      .map((l) => [l.getAttribute("aria-label"), l.getAttribute("href")]);

  it("has the five iOS tabs in order: Learn, Library, Practice, Hector, Profile", () => {
    render(<BottomTabs />);
    expect(tabs()).toEqual([
      ["Learn", "/learn"],
      ["Library", "/listen"],
      ["Practice", "/converse"],
      ["Hector", "/hector"],
      ["Profile", "/profile"],
    ]);
  });

  it("has no League or Chat tab: League lives behind Profile", () => {
    render(<BottomTabs />);
    expect(screen.queryByLabelText("League")).toBeNull();
    expect(screen.queryByLabelText("Chat")).toBeNull();
    expect(document.querySelector('nav a[href="/league"]')).toBeNull();
  });

  it("draws Practice with the microphone, not a speech bubble", () => {
    render(<BottomTabs />);
    const icon = screen.getByLabelText("Practice").querySelector("svg")!;
    const mic = renderToStaticMarkup(<DsIcon name="mic" className="size-5" />);
    expect(icon.innerHTML).toBe(mic.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, ""));
  });

  it("marks the tab matching the current route as active", () => {
    mockPathname = "/profile";
    render(<BottomTabs />);
    expect(screen.getByLabelText("Profile").firstElementChild).toHaveClass("text-ds-choice");
    expect(screen.getByLabelText("Learn").firstElementChild).not.toHaveClass("text-ds-choice");
  });

  it("lights Profile, and only Profile, on /league, which has no tab of its own", () => {
    mockPathname = "/league";
    render(<BottomTabs />);
    const lit = screen
      .getAllByRole("link")
      .filter((l) => l.firstElementChild?.classList.contains("text-ds-choice"))
      .map((l) => l.getAttribute("aria-label"));
    expect(lit).toEqual(["Profile"]);
  });

  it("lights Practice for nested /converse paths and no other tab", () => {
    mockPathname = "/converse/coffee";
    render(<BottomTabs />);
    expect(screen.getByLabelText("Practice").firstElementChild).toHaveClass("text-ds-choice");
    expect(screen.getByLabelText("Hector").firstElementChild).not.toHaveClass("text-ds-choice");
  });

  it("lights Hector on /hector", () => {
    mockPathname = "/hector";
    render(<BottomTabs />);
    expect(screen.getByLabelText("Hector").firstElementChild).toHaveClass("text-ds-choice");
  });
});

describe("MobileFrame / LessonFrame", () => {
  it("MobileFrame renders the top bar, children, and bottom tabs", () => {
    render(
      <MobileFrame>
        <p>Page content</p>
      </MobileFrame>,
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("pins the player bar and the tabs together in ONE sticky dock, so neither can cover the other", async () => {
    const { usePodcastPlayer } = await import("../lib/podcast-player");
    usePodcastPlayer.getState().play({
      id: "11111111-1111-4111-8111-111111111111",
      folderId: "22222222-2222-4222-8222-222222222222",
      slug: "s",
      title: "An episode",
      description: null,
      audioUrl: "https://example.test/a.mp3",
      durationSeconds: 60,
      positionSeconds: 0,
      aiNarrated: false,
    });
    render(
      <MobileFrame>
        <p>Page content</p>
      </MobileFrame>,
    );
    const nav = screen.getByRole("navigation");
    const dock = screen.getByTestId("bottom-dock");
    expect(dock.className).toMatch(/\bsticky\b/);
    expect(dock.className).toMatch(/\bbottom-0\b/);
    expect(dock.contains(nav)).toBe(true);
    expect(dock.contains(screen.getByText("An episode"))).toBe(true);
    // Nothing else in the frame is pinned to the bottom edge to fight it.
    const bottomPinned = document.querySelectorAll(".sticky.bottom-0");
    for (const el of bottomPinned) expect(el === dock || dock.contains(el)).toBe(true);
    usePodcastPlayer.getState().close();
  });

  it("LessonFrame renders only its children, no chrome", () => {
    render(
      <LessonFrame>
        <p>Lesson content</p>
      </LessonFrame>,
    );
    expect(screen.getByText("Lesson content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
