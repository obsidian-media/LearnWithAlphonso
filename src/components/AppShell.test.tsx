// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
    expect(screen.getByLabelText("Streak")).toHaveTextContent("4");
    expect(screen.getByLabelText("XP")).toHaveTextContent("120");
    expect(screen.getByLabelText("Hearts")).toHaveTextContent("3");
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
  it("marks the tab matching the current route as active", () => {
    mockPathname = "/league";
    render(<BottomTabs />);
    expect(screen.getByLabelText("League").firstElementChild).toHaveClass("text-moss");
    expect(screen.getByLabelText("Learn").firstElementChild).not.toHaveClass("text-moss");
  });

  it("has a Hector tab after Chat that links to /hector", () => {
    mockPathname = "/hector";
    render(<BottomTabs />);
    const hector = screen.getByLabelText("Hector");
    expect(hector).toHaveAttribute("href", "/hector");
    expect(hector.firstElementChild).toHaveClass("text-moss");
    const labels = screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    expect(labels.indexOf("Hector")).toBe(labels.indexOf("Chat") + 1);
  });

  it("treats nested paths as active via startsWith", () => {
    mockPathname = "/converse/coffee";
    render(<BottomTabs />);
    expect(screen.getByLabelText("Chat").firstElementChild).toHaveClass("text-moss");
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
