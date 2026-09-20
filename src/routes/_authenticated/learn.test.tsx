// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to: string;
      params?: Record<string, string>;
      children: React.ReactNode;
    }) => (
      <a href={params ? to.replace(/\$(\w+)/, (_, k) => params[k]) : to} {...rest}>
        {children}
      </a>
    ),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/learn" } }),
  };
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return { ...actual, useServerFn: (fn: unknown) => fn };
});

// AnimatePresence's exit animation keeps a removed child mounted until it
// resolves, which real framer-motion never does synchronously under
// jsdom -- so closing the hearts modal wouldn't otherwise be observable
// in the DOM within a test.
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag) =>
        ({
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _t,
          ...rest
        }: Record<string, unknown> & { children?: React.ReactNode }) => {
          const Tag = tag as string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return <Tag {...(rest as any)} />;
        },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const setCefrLevel = vi.fn();
const fetchProgress = vi.fn();
const restoreHeartsRemote = vi.fn();
const buyHeartWithXpRemote = vi.fn();
vi.mock("../../lib/sync.functions", () => ({
  setCefrLevel,
  fetchProgress,
  restoreHeartsRemote,
  buyHeartWithXpRemote,
}));

const fetchDueReviews = vi.fn();
vi.mock("../../lib/review.functions", () => ({ fetchDueReviews }));

const { Route } = await import("./learn");
const { useProgress } = await import("../../lib/progress");
const { getCourse } = await import("../../data/courses");
const { LEVELS } = await import("../../data/curriculum");

function renderPage() {
  const LearnPage = Route.options.component!;
  return render(<LearnPage />);
}

// Real curriculum data for course "en" at level A1, so lesson
// counts/progress percentages are derived rather than hardcoded and
// won't silently drift out of sync with the curriculum.
const a1Units = getCourse("en").curriculum.filter((u) => u.level === "A1");
const a1Lessons = a1Units.flatMap((u) => u.lessons);
const firstLesson = a1Lessons[0];
const secondLesson = a1Lessons[1];

beforeEach(() => {
  setCefrLevel.mockReset();
  setCefrLevel.mockResolvedValue({ cefrLevel: "A1" });
  fetchProgress.mockReset();
  restoreHeartsRemote.mockReset();
  restoreHeartsRemote.mockResolvedValue({ hearts: 5, heartsRefillAt: null });
  buyHeartWithXpRemote.mockReset();
  fetchDueReviews.mockReset();
  fetchDueReviews.mockResolvedValue({ due: [], total: 0 });
  useProgress.getState().reset();
  // reset() only restores the fields in progress.ts's `initial` object --
  // `course` is set separately in the store's initializer and is a
  // shallow-merge target zustand's `set` never touches on reset, so it
  // silently survives across tests once anything changes it (e.g. the
  // course-switch test below). Reset it here explicitly.
  useProgress.setState({ course: "en" });
});

describe("Learn page", () => {
  it("shows the placement banner before a placement test has been taken", async () => {
    renderPage();
    expect(await screen.findByText("Not sure where to start?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Take the placement test/ })).toHaveAttribute(
      "href",
      "/placement",
    );
  });

  it("hides the placement banner once a placement result exists", async () => {
    useProgress.setState({ placementTakenAt: "2026-09-19T00:00:00.000Z" });
    renderPage();
    await screen.findByText(a1Units[0].title);
    expect(screen.queryByText("Not sure where to start?")).not.toBeInTheDocument();
  });

  it("marks the first undone lesson active and later ones locked", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: `Start ${firstLesson.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: `${secondLesson.title} (locked)` }),
    ).toBeInTheDocument();
  });

  it("marks a completed lesson done and unlocks the next one", async () => {
    useProgress.setState({ completedLessons: [firstLesson.id] });
    renderPage();
    expect(
      await screen.findByRole("link", { name: `Start ${secondLesson.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("note", { name: `${firstLesson.title} (locked)` }),
    ).not.toBeInTheDocument();
  });

  it("shows 0% progress with no completions and updates as lessons complete", async () => {
    renderPage();
    expect(await screen.findByText("0%")).toBeInTheDocument();

    useProgress.setState({ completedLessons: [firstLesson.id] });
    const expectedPct = Math.round((1 / a1Lessons.length) * 100);
    expect(await screen.findByText(`${expectedPct}%`)).toBeInTheDocument();
  });

  it("shows the due-review badge once fetchDueReviews resolves", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    renderPage();
    expect(await screen.findByLabelText("2 items due")).toHaveTextContent("2");
  });

  it("switches CEFR level locally and persists it remotely", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(a1Units[0].title);

    const nextLevel = LEVELS[1].id;
    await user.click(screen.getByRole("tab", { name: new RegExp(`^${nextLevel}`) }));

    expect(useProgress.getState().cefrLevel).toBe(nextLevel);
    await waitFor(() =>
      expect(setCefrLevel).toHaveBeenCalledWith({ data: { level: nextLevel, course: "en" } }),
    );
  });

  it("switches course, loading and hydrating from the new course's progress", async () => {
    fetchProgress.mockResolvedValue({
      xp: 250,
      streak: 2,
      longestStreak: 2,
      lastActiveDate: "2026-09-19",
      hearts: 5,
      heartsRefillAt: null,
      streakFreezes: 0,
      leagueTier: "bronze",
      completedLessons: [],
      answersByLesson: {},
      activityDates: [],
      unlockedAchievements: [],
      cefrLevel: "A1",
      placementLevel: null,
      placementScore: null,
      placementTakenAt: null,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(a1Units[0].title);

    await user.click(screen.getByRole("button", { name: "🇫🇷 French" }));

    await waitFor(() => expect(fetchProgress).toHaveBeenCalledWith({ data: { course: "fr" } }));
    expect(useProgress.getState().course).toBe("fr");
    expect(useProgress.getState().xp).toBe(250);
  });

  it("blocks starting a lesson when out of hearts and opens the hearts modal", async () => {
    useProgress.setState({ hearts: 0 });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: `Start ${firstLesson.title} (out of hearts)` }),
    );
    expect(await screen.findByRole("dialog", { name: "Out of hearts" })).toBeInTheDocument();
  });

  it("refills hearts locally and remotely from the hearts modal", async () => {
    useProgress.setState({ hearts: 0 });
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: `Start ${firstLesson.title} (out of hearts)` }),
    );
    await user.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("buys a heart with XP and shows an error when the purchase fails", async () => {
    buyHeartWithXpRemote.mockResolvedValue({ ok: false, reason: "insufficient-xp", hearts: 0 });
    useProgress.setState({ hearts: 0, xp: 100 });
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: `Start ${firstLesson.title} (out of hearts)` }),
    );
    await user.click(await screen.findByRole("button", { name: /Use \d+ XP for a heart/ }));
    expect(await screen.findByText("Not enough XP for a heart.")).toBeInTheDocument();
  });
});
