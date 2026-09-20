// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
let currentLessonId = "u1l1";
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => navigate,
    useParams: () => ({ id: currentLessonId }),
  };
});

// Real reshuffle would randomize choice/bank order per mount, making the
// correct answer's position (and thus what to click) non-deterministic.
// The lesson player's own state machine is under test here, not the
// shuffle -- that's covered by bank-engine.test.ts.
vi.mock("../../data/bank-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../data/bank-engine")>();
  return { ...actual, reshuffleQuestion: (q: unknown) => q };
});

const startLessonSession = vi.fn();
const completeLessonRemote = vi.fn();
const loseHeartRemote = vi.fn();
vi.mock("../../lib/sync.functions", () => ({
  startLessonSession,
  completeLessonRemote,
  loseHeartRemote,
}));

const recordMisses = vi.fn();
vi.mock("../../lib/review.functions", () => ({ recordMisses }));

const { Route } = await import("./lesson.$id");
const { useProgress } = await import("../../lib/progress");

// Real curriculum lesson "u1l1" ("Saying Hello", 8 questions, 8 derived
// vocab items from its distinct answers):
// q1 mc "Good morning."   q2 fill "meet"        q3 mc "I am fine, thanks."
// q4 fill "Good"          q5 mc "Good night."    q6 mc "Hey!"
// q7 fill "later"         q8 mc "You're welcome."
const ANSWERS = [
  { correct: "Good morning.", wrong: "Yo." },
  { correct: "meet", wrong: "meat" },
  { correct: "I am fine, thanks.", wrong: "Yes, please." },
  { correct: "Good", wrong: "Well" },
  { correct: "Good night.", wrong: "Good day." },
  { correct: "Hey!", wrong: "How do you do?" },
  { correct: "later", wrong: "late" },
  { correct: "You're welcome.", wrong: "Please." },
];

function renderPage() {
  const LessonPage = Route.options.component!;
  return render(<LessonPage />);
}

async function skipToQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Begin lesson" }));
  await user.click(await screen.findByRole("button", { name: "Start practice" }));
}

beforeEach(() => {
  currentLessonId = "u1l1";
  navigate.mockClear();
  startLessonSession.mockReset();
  startLessonSession.mockResolvedValue({ token: "session-tok" });
  completeLessonRemote.mockReset();
  loseHeartRemote.mockReset();
  loseHeartRemote.mockResolvedValue({ hearts: 4 });
  recordMisses.mockReset();
  recordMisses.mockResolvedValue({ added: 1 });
  useProgress.getState().reset();
});

describe("Lesson page", () => {
  it("shows a not-found message for an unknown lesson id", async () => {
    currentLessonId = "does-not-exist";
    renderPage();
    expect(await screen.findByText("Lesson not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to learn" })).toHaveAttribute("href", "/learn");
  });

  it("walks overview -> vocab -> quiz for a lesson with derived vocabulary", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Saying Hello")).toBeInTheDocument();
    expect(screen.getByText("8 words with examples")).toBeInTheDocument();
    expect(screen.getByText("8 questions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Begin lesson" }));
    expect(await screen.findByText("8 words to learn before you practise.")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument(); // a derived vocab term

    await user.click(screen.getByRole("button", { name: "Start practice" }));
    expect(await screen.findByText("Which is a formal greeting?")).toBeInTheDocument();
    expect(screen.getByText("1/8")).toBeInTheDocument();
  });

  it("grades a correct answer, shows feedback, and advances on Continue", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    await user.click(screen.getByRole("button", { name: ANSWERS[0].correct }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.getByText("2/8")).toBeInTheDocument();
    expect(loseHeartRemote).not.toHaveBeenCalled();
  });

  it("loses a heart locally and remotely on a wrong answer", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    const startingHearts = useProgress.getState().hearts;
    await user.click(screen.getByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(loseHeartRemote).toHaveBeenCalledTimes(1);
    expect(useProgress.getState().hearts).toBe(startingHearts - 1);
  });

  it("supports fill-in-the-blank items via the word bank", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    await user.click(screen.getByRole("button", { name: ANSWERS[0].correct }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Nice to ___ you.");
    await user.click(screen.getByRole("button", { name: "meet" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("completes the lesson, records misses, and applies the returned progress", async () => {
    completeLessonRemote.mockResolvedValue({
      xpGain: 60,
      newlyUnlocked: ["xp_100"],
      heartsBonus: "perfect",
      progress: {
        xp: 160,
        streak: 1,
        longestStreak: 1,
        lastActiveDate: "2026-09-19",
        hearts: 5,
        heartsRefillAt: null,
        streakFreezes: 0,
        leagueTier: "bronze",
      },
    });
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    // Answer q2 wrong, everything else correct.
    for (let i = 0; i < ANSWERS.length; i++) {
      const text = i === 1 ? ANSWERS[i].wrong : ANSWERS[i].correct;
      await user.click(await screen.findByRole("button", { name: text }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const label = i === ANSWERS.length - 1 ? "Finish" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(recordMisses).toHaveBeenCalledWith({
      data: {
        lessonId: "u1l1",
        level: "A1",
        itemKeys: ["u1l1:q2"],
        course: "en",
        sessionToken: "session-tok",
      },
    });
    expect(completeLessonRemote).toHaveBeenCalledWith({
      data: {
        lessonId: "u1l1",
        total: 8,
        missedQuestionIds: ["q2"],
        course: "en",
        sessionToken: "session-tok",
      },
    });

    expect(await screen.findByText("+60 XP")).toBeInTheDocument();
    expect(screen.getByText("7/8 correct")).toBeInTheDocument();
    expect(screen.getByText("Perfect lesson: +1 heart")).toBeInTheDocument();
    expect(screen.getByText("First strides")).toBeInTheDocument();
    expect(screen.getByText("Review · 1 to practise again")).toBeInTheDocument();

    const state = useProgress.getState();
    expect(state.xp).toBe(160);
    expect(state.completedLessons).toContain("u1l1");
    expect(state.answersByLesson.u1l1).toEqual({ correct: 7, total: 8 });
    expect(state.unlockedAchievements).toContain("xp_100");
  });

  it("shows a graceful finish screen when completion fails", async () => {
    completeLessonRemote.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    for (let i = 0; i < ANSWERS.length; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const label = i === ANSWERS.length - 1 ? "Finish" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(await screen.findByText("+0 XP")).toBeInTheDocument();
    expect(useProgress.getState().completedLessons).not.toContain("u1l1");
  });

  it("navigates to /learn when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/learn" });
  });
});

// Real curriculum lesson "u1l2" ("About Me") -- q9 is an mc question with
// an imageKey (image matching), q10 an mc question with audioText
// (listening comprehension), q11 a reorder question. See curriculum.ts's
// V3 pkg 4a comment.
describe("Lesson page -- new V3 pkg 4a question formats (u1l2)", () => {
  beforeEach(() => {
    currentLessonId = "u1l2";
  });

  async function skipToQuestion(user: ReturnType<typeof userEvent.setup>, n: number) {
    await skipToQuiz(user);
    for (let i = 0; i < n; i++) {
      // Each of u1l2's first 8 questions has a distinct, known-correct
      // answer text -- reuse fill/mc answering to walk forward without
      // duplicating grading logic here.
      const correctByIndex = [
        "is",
        "am",
        "Where are you from?",
        "student",
        "is",
        "I am 22.",
        "are",
        "I'm Alex, nice to meet you.",
        "Doctor", // q9, image matching
        "Doctor", // q10, listening
      ];
      await user.click(await screen.findByRole("button", { name: correctByIndex[i] }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      await user.click(screen.getByRole("button", { name: "Continue" }));
    }
  }

  it("shows an image and grades an image-matching mc question normally", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 8); // land on q9

    expect(await screen.findByText("What is shown in the picture?")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("alt", expect.stringContaining("doctor"));

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("shows a play-audio button and grades a listening mc question normally", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 9); // land on q10

    expect(await screen.findByText("What is her job?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play audio/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("assembles and grades a reorder question by tapping tokens in order", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 10); // land on q11

    expect(
      await screen.findByText("Put the words in order to make a sentence."),
    ).toBeInTheDocument();
    const checkButton = screen.getByRole("button", { name: "Check" });
    expect(checkButton).toBeDisabled();

    for (const word of ["She", "is", "a", "doctor"]) {
      await user.click(screen.getByRole("button", { name: word }));
    }
    expect(checkButton).toBeEnabled();
    await user.click(checkButton);
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("marks a reorder question wrong when tapped out of order", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 10);
    await screen.findByText("Put the words in order to make a sentence.");

    for (const word of ["doctor", "a", "is", "She"]) {
      await user.click(screen.getByRole("button", { name: word }));
    }
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
  });

  it("lets a tapped reorder token be removed and re-picked", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 10);
    await screen.findByText("Put the words in order to make a sentence.");

    await user.click(screen.getByRole("button", { name: "doctor" })); // wrong first tap
    // Tapping the assembled chip removes it from the sentence area.
    await user.click(screen.getByRole("button", { name: "doctor" }));
    for (const word of ["She", "is", "a", "doctor"]) {
      await user.click(screen.getByRole("button", { name: word }));
    }
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });
});
