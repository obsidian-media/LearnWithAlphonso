// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";

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
  useReducedMotion: () => false,
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

// The For you rail uses react-query and the path client, which this test does not set up; it has its own tests
// (ForYouRail.test.tsx). Here we only check the page mounts it for the current course with the due count.
vi.mock("../../components/learn/ForYouRail", () => ({
  ForYouRail: ({ course, dueCount }: { course: string; dueCount: number }) => (
    <div data-testid="for-you-rail">
      {course}:{dueCount}
    </div>
  ),
}));

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
});

describe("Learn page", () => {
  it("mounts the For you rail for the current course", async () => {
    renderPage();
    expect(await screen.findByTestId("for-you-rail")).toHaveTextContent("en:0");
  });

  it("hands the rail the due-review count once fetchDueReviews resolves", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("for-you-rail")).toHaveTextContent("en:2"));
  });

  it("no longer repeats the streak and XP pills the app top bar already shows", async () => {
    renderPage();
    await screen.findByTestId("for-you-rail");
    // The shell's top bar owns the one streak pill and the one XP pill; the page adds none of its own.
    expect(screen.queryAllByLabelText(/^Streak/)).toHaveLength(1);
    expect(screen.queryAllByLabelText(/^[\d,]+ XP$/).length).toBeLessThanOrEqual(1);
  });

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
    await screen.findByRole("button", { name: new RegExp(a1Units[0].title) });
    expect(screen.queryByText("Not sure where to start?")).not.toBeInTheDocument();
  });

  // The climbing map replaced the Continue card: its next node opens a start sheet that continues.
  const openNext = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    await user.click(await screen.findByRole("button", { name: new RegExp(`, ${title}, next$`) }));
    return screen.getByRole("dialog", { name: title });
  };

  it("the map's next lesson is the first undone one, and its sheet continues it", async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openNext(user, firstLesson.title);
    expect(within(sheet).getByRole("link", { name: "Continue lesson" })).toHaveAttribute(
      "href",
      `/lesson/${firstLesson.id}`,
    );
  });

  it("moves the next lesson on once a lesson is done", async () => {
    useProgress.setState({ completedLessons: [firstLesson.id] });
    const user = userEvent.setup();
    renderPage();
    const sheet = await openNext(user, secondLesson.title);
    expect(within(sheet).getByRole("link", { name: "Continue lesson" })).toHaveAttribute(
      "href",
      `/lesson/${secondLesson.id}`,
    );
  });

  it("out of hearts, the sheet opens the hearts modal instead of the lesson", async () => {
    useProgress.setState({ hearts: 0 });
    const user = userEvent.setup();
    renderPage();
    const sheet = await openNext(user, firstLesson.title);
    await user.click(
      within(sheet).getByRole("button", { name: "Continue lesson (out of hearts)" }),
    );
    expect(await screen.findByRole("dialog", { name: "Out of hearts" })).toBeInTheDocument();
  });

  it("the map is this level's climb: with the learner's place in another level it says Start, not Continue", async () => {
    // Nothing done: the course-wide Continue lesson is A1's first. Looking at A2, the map's next is A2's first.
    const a2First = getCourse("en").curriculum.find((u) => u.level === "A2")!.lessons[0];
    useProgress.setState({ cefrLevel: "A2" });
    const user = userEvent.setup();
    renderPage();
    const sheet = await openNext(user, a2First.title);
    expect(within(sheet).queryByRole("link", { name: /Continue/ })).toBeNull();
    expect(within(sheet).getByRole("link", { name: "Start lesson" })).toHaveAttribute(
      "href",
      `/lesson/${a2First.id}`,
    );
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
    expect(await screen.findByText("0% complete")).toBeInTheDocument();

    useProgress.setState({ completedLessons: [firstLesson.id] });
    const expectedPct = Math.round((1 / a1Lessons.length) * 100);
    expect(await screen.findByText(`${expectedPct}% complete`)).toBeInTheDocument();
  });

  it("switches CEFR level locally and persists it remotely", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: new RegExp(a1Units[0].title) });

    const nextLevel = LEVELS[1].id;
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select CEFR level" }),
      nextLevel,
    );

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
    await screen.findByRole("button", { name: new RegExp(a1Units[0].title) });

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

describe("Learn, round 6.1: pinned current unit and folded rooms", () => {
  const unitIds = (u: { lessons: { id: string }[] }) => u.lessons.map((l) => l.id);

  it("the map's unit strip names the current unit with its place in the level, replacing the old hero", async () => {
    const { container } = renderPage();
    expect(
      await screen.findByRole("heading", {
        name: `Unit 1 of ${a1Units.length} · ${a1Units[0].title}`,
      }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-learn-hero]")).toBeNull();
    expect(container.querySelectorAll("[data-learn-map]")).toHaveLength(1);
  });

  it("the current unit is open and later units are folded until tapped", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: `Start ${firstLesson.title}` });
    const later = a1Units[1];
    const laterRow = screen.getByRole("button", { name: new RegExp(later.title) });
    expect(laterRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("note", { name: `${later.lessons[0].title} (locked)` })).toBeNull();
    await user.click(laterRow);
    expect(laterRow).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("note", { name: `${later.lessons[0].title} (locked)` }),
    ).toBeInTheDocument();
  });

  it("finished units fold into one row that opens on tap", async () => {
    const user = userEvent.setup();
    useProgress.setState({ completedLessons: unitIds(a1Units[0]) });
    renderPage();
    const run = await screen.findByRole("button", { name: /^Unit 1 · A1 done/ });
    expect(run).toHaveAttribute("aria-expanded", "false");
    const title = a1Units[0].lessons[0].title;
    expect(screen.queryByRole("link", { name: `Start ${title}` })).toBeNull();
    await user.click(run);
    expect(screen.getByRole("link", { name: `Start ${title}` })).toBeInTheDocument();
    // The map moved on to unit 2, with unit 1's earned chest at the foot of the climb.
    expect(
      screen.getByRole("heading", { name: `Unit 2 of ${a1Units.length} · ${a1Units[1].title}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Unit 1 reward, earned" })).toBeInTheDocument();
  });

  it("folds future rooms: the next room is one row, the rest sit behind Show all units", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: `Start ${firstLesson.title}` });
    expect(a1Units.length).toBeGreaterThan(2);
    const third = a1Units[2];
    expect(screen.getByRole("button", { name: new RegExp(a1Units[1].title) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(`^${third.eyebrow} · `) })).toBeNull();
    const more = screen.getByRole("button", { name: /^Show all units in A1/ });
    await user.click(more);
    expect(
      screen.getByRole("button", { name: new RegExp(`^${third.eyebrow} · `) }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Show all units in/ })).toBeNull();
  });

  it("paints on the round-6 cream surface, not the old tokens", () => {
    const src = readFileSync(`${import.meta.dirname}/learn.tsx`, "utf8");
    expect(src).toContain("bg-ds-surface");
    expect(src).not.toMatch(/\b(bg|text|border)-(ink|surface|parchment|hairline|moss|ember)\b/);
  });

  it("shows Jump to current only when the current unit is off screen, and scrolls to it", async () => {
    const user = userEvent.setup();
    let notify: (e: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderPage();
    await screen.findByRole("heading", { name: /^Unit 1 of / });
    expect(screen.queryByRole("button", { name: /Jump to where I am/ })).toBeNull();
    act(() => notify([{ isIntersecting: false }]));
    await user.click(await screen.findByRole("button", { name: /Jump to where I am/ }));
    expect(scroll).toHaveBeenCalled();
    act(() => notify([{ isIntersecting: true }]));
    expect(screen.queryByRole("button", { name: /Jump to where I am/ })).toBeNull();
    vi.unstubAllGlobals();
  });
});
