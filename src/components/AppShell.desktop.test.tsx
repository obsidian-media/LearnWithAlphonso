// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/*
 * The desktop layout (the owner's pick, "Option A: sidebar app"): what each width draws, what each route's panel
 * holds, and that the phone layout below 768 is still exactly the one it always was.
 */

let mockPathname = "/learn";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}));

// The panel's server reads, answered with plain data (the panel imports them on demand).
vi.mock("../lib/profile.functions", () => ({
  getProfileOverview: vi.fn(async () => ({
    dailyGoalMinutes: 10,
    today: "2026-11-22",
    learning: [{ day: "2026-11-22", lessonSeconds: 240, practiceSeconds: 120 }],
  })),
}));
vi.mock("../lib/leaderboard.functions", () => ({
  getLeaderboard: vi.fn(async () => [
    { user_id: "a", display_name: "Marta", country: null, avatar_seed: "0", xp: 212, isYou: false },
    { user_id: "me", display_name: "Me", country: null, avatar_seed: "0", xp: 170, isYou: true },
    { user_id: "c", display_name: "Joon", country: null, avatar_seed: "0", xp: 164, isYou: false },
    { user_id: "d", display_name: "Faraway", country: null, avatar_seed: "0", xp: 5, isYou: false },
  ]),
}));

const { MobileFrame, LessonFrame } = await import("./AppShell");
const { useProgress } = await import("../lib/progress");
const { usePodcastPlayer } = await import("../lib/podcast-player");
const { STANDARD_PANEL, PROFILE_PANEL, panelPlanFor } = await import("./shell/panel-config");

/** A window `width` px wide, as matchMedia sees it (only min-width queries are used). */
function setWidth(width: number | null) {
  if (width === null) {
    // @ts-expect-error -- remove it, as the server and a bare test have none
    delete window.matchMedia;
    return;
  }
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
}

function shell(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockPathname = "/learn";
  useProgress.getState().reset();
  usePodcastPlayer.getState().close();
});
afterEach(() => {
  setWidth(null);
  useProgress.getState().reset();
  usePodcastPlayer.getState().close();
});

describe("the phone layout below 768px is unchanged", () => {
  for (const width of [null, 320, 390, 767]) {
    it(`draws the 430px column with the top bar and the tab bar at ${width ?? "no matchMedia"}`, () => {
      setWidth(width);
      const { container } = shell(
        <MobileFrame>
          <p>page</p>
        </MobileFrame>,
      );
      // The column and its width cap, the sticky top bar, one dock holding the tab bar, no desktop parts.
      const column = container.querySelector("main")!.parentElement!;
      expect(column.className).toBe(
        "mx-auto flex min-h-dvh max-w-[430px] flex-col bg-ds-surface/60",
      );
      expect(container.querySelector("header")!.className).toContain("sticky top-0");
      expect(screen.getByTestId("bottom-dock")).toContainElement(
        screen.getByRole("navigation", { name: "Main" }),
      );
      expect(container.querySelector("[data-shell-rail]")).toBeNull();
      expect(container.querySelector("aside")).toBeNull();
      expect(screen.getAllByRole("navigation")).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Learn with Alphonso, home" })).toBeInTheDocument();
    });
  }

  it("keeps the focus frame at 430px, widening only from md", () => {
    setWidth(390);
    const { container } = render(
      <LessonFrame>
        <p>lesson</p>
      </LessonFrame>,
    );
    const main = container.querySelector("main")!;
    expect(main.className).toContain("max-w-[430px]");
    expect(main.className).toContain("md:max-w-[640px]");
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("768 to 1023: icon rail, one wide column, stats as a strip", () => {
  beforeEach(() => setWidth(900));

  it("replaces the tab bar with an icon-only rail and puts the stats in a strip", () => {
    useProgress.setState({ hydrated: true, xp: 120, streak: 4, hearts: 3 });
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(container.querySelector("[data-shell-rail]")).toContainElement(nav);
    // Icons only: the visible label text is not drawn, but every link keeps its accessible name.
    expect(within(nav).queryByText("Learn")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
    // No panel; the stats are a strip above the page, with the same numbers.
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.getByLabelText("XP")).toHaveTextContent("120");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("3");
    expect(screen.getByTestId("bottom-dock").querySelector("nav")).toBeNull();
  });
});

describe("1024 to 1279: icon rail, main column and a 280px panel", () => {
  it("draws the panel beside the page, with the rail still icon-only", async () => {
    setWidth(1100);
    useProgress.setState({ hydrated: true, xp: 120, streak: 4, hearts: 3 });
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("aria-label", "Your progress");
    expect(aside.className).toContain("w-[280px]");
    expect(await within(aside).findByText("Daily goal")).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Main" })).queryByText("Learn"),
    ).toBeNull();
    // The stats live in the panel (one set, not a strip as well).
    expect(screen.getAllByLabelText("XP")).toHaveLength(1);
  });
});

describe("1280 and up: labelled rail, 720px main, 336px panel", () => {
  beforeEach(() => setWidth(1440));

  it("labels the rail, marks the current page and keeps the layout under about 1400px", () => {
    mockPathname = "/listen";
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.getAttribute("aria-label")),
    ).toEqual(["Learn", "Library", "Practice", "Hector", "Profile"]);
    expect(within(nav).getByText("Library")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Learn" })).not.toHaveAttribute("aria-current");
    // Settings and who is learning sit in the foot of the rail.
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(container.querySelector("[data-rail-me]")).toHaveTextContent("English");
    // 720px main, 336px panel, the whole layout capped.
    expect(container.querySelector("[data-shell-main]")!.className).toContain("w-[720px]");
    expect(container.querySelector("aside")!.className).toContain("xl:w-[336px]");
    expect(container.querySelector("[data-shell-rail]")!.parentElement!.className).toContain(
      "max-w-[1400px]",
    );
  });

  it("lights Profile on /league, as the tab bar does", () => {
    mockPathname = "/league";
    shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("is reachable by keyboard: every rail link is a link with a visible focus style", () => {
    shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:outline-2");
      expect(link.tabIndex).toBeGreaterThanOrEqual(0);
    }
    // Tab order: the rail comes first, then the page, then the panel.
    const all = Array.from(document.querySelectorAll("[data-shell-rail], main, aside"));
    expect(
      all.map((e) => e.tagName.toLowerCase() + (e.hasAttribute("data-shell-rail") ? "-rail" : "")),
    ).toEqual(["div-rail", "main", "aside"]);
  });

  it("the standard panel holds the stats, the daily goal, a league snippet and Talk to Hector, from real data", async () => {
    useProgress.setState({ hydrated: true, xp: 170, streak: 12, hearts: 5, streakFreezes: 1 });
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const aside = container.querySelector("aside")!;
    expect(await within(aside).findByText("6 of 10 min today")).toBeInTheDocument();
    expect(within(aside).getByLabelText("XP")).toHaveTextContent("170");
    expect(within(aside).getByLabelText("Streak freezes: 1")).toBeInTheDocument();
    // The rows around the learner, ranked from the real board.
    const league = await within(aside).findByLabelText("League");
    expect(await within(league).findByText("Marta")).toBeInTheDocument();
    expect(within(league).getByText("You")).toBeInTheDocument();
    expect(within(league).getByText("Joon")).toBeInTheDocument();
    expect(within(league).queryByText("Faraway")).toBeNull();
    expect(within(aside).getByRole("link", { name: /Start talking/ })).toHaveAttribute(
      "href",
      "/hector",
    );
  });

  it("Library adds Now playing only while an episode is loaded", async () => {
    mockPathname = "/listen";
    const { container, unmount } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const aside = container.querySelector("aside")!;
    expect(await within(aside).findByText("Daily goal")).toBeInTheDocument();
    expect(within(aside).queryByLabelText("Now playing")).toBeNull();
    unmount();
    usePodcastPlayer.getState().play({
      id: "e1",
      title: "Ordering a coffee",
      folderId: "f",
      durationSeconds: 360,
    } as never);
    const again = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const card = await within(again.container.querySelector("aside")!).findByLabelText(
      "Now playing",
    );
    expect(card).toHaveTextContent("Ordering a coffee");
  });

  it("League gets the stats panel without a second league snippet", async () => {
    mockPathname = "/league";
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    const aside = container.querySelector("aside")!;
    expect(await within(aside).findByText("Daily goal")).toBeInTheDocument();
    expect(within(aside).getByLabelText("Your stats")).toBeInTheDocument();
    expect(within(aside).queryByLabelText("League")).toBeNull();
  });

  it("Profile is a wide single column with no panel (the owner has not decided: PROFILE_PANEL)", () => {
    mockPathname = "/profile";
    const { container } = shell(
      <MobileFrame>
        <p>page</p>
      </MobileFrame>,
    );
    expect(PROFILE_PANEL).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("[data-shell-main]")!.className).toContain("max-w-[880px]");
    // Sub-pages of Profile follow it.
    expect(panelPlanFor("/profile/memory")).toBeNull();
    expect(panelPlanFor("/learn")).toBe(STANDARD_PANEL);
  });

  it("a page can bring its own panel (Hector) or ask for none", () => {
    const own = shell(
      <MobileFrame panel={<p>scenario and memory</p>}>
        <p>page</p>
      </MobileFrame>,
    );
    expect(
      within(own.container.querySelector("aside")!).getByText("scenario and memory"),
    ).toBeInTheDocument();
    own.unmount();
    const none = shell(
      <MobileFrame panel={null}>
        <p>page</p>
      </MobileFrame>,
    );
    expect(none.container.querySelector("aside")).toBeNull();
  });

  it("docks the player and the page's dock (Hector's composer) at the bottom of the main column", () => {
    const { container } = shell(
      <MobileFrame aboveTabs={<p>composer</p>}>
        <p>page</p>
      </MobileFrame>,
    );
    const main = container.querySelector("[data-shell-main]")!;
    expect(main).toContainElement(screen.getByTestId("bottom-dock"));
    expect(screen.getByTestId("bottom-dock")).toContainElement(screen.getByText("composer"));
  });
});

describe("focus mode at 768 and up", () => {
  it("LessonFrame is a centred ~640px view with no rail, no panel and no navigation", () => {
    setWidth(1440);
    const { container } = render(
      <LessonFrame>
        <p>lesson</p>
      </LessonFrame>,
    );
    const main = container.querySelector("main")!;
    expect(main).toHaveAttribute("data-focus-mode");
    expect(main.className).toContain("md:max-w-[640px]");
    expect(main.className).toContain("mx-auto");
    expect(container.querySelector("nav, aside, [data-shell-rail]")).toBeNull();
  });
});
