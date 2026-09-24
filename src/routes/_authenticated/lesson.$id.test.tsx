// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Question } from "../../data/curriculum";

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
// shuffle -- that's covered by bank-engine.test.ts. Reinforcement is
// disabled by default (pickReinforcementQuestion -> null) for the same
// reason: most tests below are about the core quiz flow, not V3 pkg 4b's
// in-lesson reinforcement, which gets its own dedicated tests further
// down overriding this mock's return value.
// jsdom implements neither speechSynthesis nor SpeechSynthesisUtterance, and
// `canSpeak` gates a readable fallback for listening questions, so it is mocked
// rather than shimmed. Defaults to available; the fallback test flips it.
const canSpeak = vi.fn(() => true);
vi.mock("../../lib/speech", () => ({
  speak: vi.fn(),
  canSpeak: () => canSpeak(),
}));

const pickReinforcementQuestion = vi.fn((_params: unknown) => null as unknown);
vi.mock("../../data/bank-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../data/bank-engine")>();
  return {
    ...actual,
    reshuffleQuestion: (q: unknown) => q,
    pickReinforcementQuestion: (params: unknown) => pickReinforcementQuestion(params),
  };
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

vi.mock("../../lib/auth-headers", () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));

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
  canSpeak.mockReturnValue(true);
  currentLessonId = "u1l1";
  navigate.mockClear();
  startLessonSession.mockReset();
  startLessonSession.mockResolvedValue({ token: "session-tok" });
  completeLessonRemote.mockReset();
  loseHeartRemote.mockReset();
  loseHeartRemote.mockResolvedValue({ hearts: 4 });
  recordMisses.mockReset();
  recordMisses.mockResolvedValue({ added: 1 });
  pickReinforcementQuestion.mockReset();
  pickReinforcementQuestion.mockReturnValue(null);
  useProgress.getState().reset();
});

describe("Lesson page", () => {
  it("shows a not-found message for an unknown lesson id", async () => {
    currentLessonId = "does-not-exist";
    renderPage();
    expect(await screen.findByText("Lesson not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to learn" })).toHaveAttribute("href", "/learn");
  });

  it("renders a play control and answerable choices for a listening question", async () => {
    // Speech synthesis may be unavailable -- `speak` returns silently in that
    // case -- so this asserts the question is answerable without audio, not
    // that anything played. It also pins the format label, since a listening
    // question must not look like an ordinary multiple choice.
    const user = userEvent.setup();
    currentLessonId = "a1p23l1";
    renderPage();
    // No vocabulary step here: listening answers are whole sentences, which
    // deriveVocab deliberately skips (see vocab.ts), so "Begin lesson" goes
    // straight to the quiz rather than via "Start practice".
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    expect(await screen.findByRole("button", { name: /play audio/i })).toBeEnabled();
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByText("What did you hear?")).toBeInTheDocument();
    // The choices are full sentences from the same pack, and picking one must
    // be possible with no audio played.
    const choice = screen.getByRole("button", { name: "She's a doctor." });
    await user.click(choice);
    expect(screen.getByRole("button", { name: "Check" })).toBeEnabled();
  });

  it("shows the transcript for a listening question when speech is unavailable", async () => {
    // `speak` fails silently on a browser with no speechSynthesis, leaving an
    // inert button. For a listening question that is unanswerable -- a
    // one-in-four guess that costs a heart -- so the sentence must be readable
    // instead. 125 questions depend on this, not the 1 that did before.
    canSpeak.mockReturnValue(false);
    const user = userEvent.setup();
    currentLessonId = "a1p23l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    expect(await screen.findByText(/audio is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("She's a doctor.", { selector: "p" })).toBeInTheDocument();
  });

  it("renders a speaking question with the phrase to say and a way to hear it", async () => {
    // jsdom has no MediaRecorder, so this exercises the no-microphone path --
    // which is the important one to pin: a speaking question the learner cannot
    // answer is a lesson they cannot complete, and completion is what pays out
    // XP, the streak and the next unlock.
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    expect(await screen.findByText("Speaking")).toBeInTheDocument();
    expect(screen.getByText("Say this aloud:")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hear it first/i })).toBeInTheDocument();
    expect(screen.getByText(/recording isn't available/i)).toBeInTheDocument();
  });

  it("grades a spoken answer tolerantly rather than character by character", async () => {
    // What reaches grading is a speech-to-text transcript, so it arrives
    // without capitalisation or final punctuation. Grading it strictly would
    // fail a learner who said the phrase perfectly.
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("marks a different phrase wrong on a speaking question", async () => {
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good night");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(loseHeartRemote).toHaveBeenCalled();
  });

  it("keeps a translation question answerable and gradeable with no network", async () => {
    // deriveLessonCompletion throws when the submitted total does not equal the
    // lesson's question count, so a question that cannot be answered offline is
    // a lesson that can never be completed: no XP, no streak, no unlock, and
    // nothing on screen saying why. The curated phrasings are bundled content,
    // so they still grade offline -- just without the AI second opinion.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("upgrades a wrong local verdict when the grader accepts the wording", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ correct: true, reason: "Same meaning.", source: "ai" }),
      })),
    );
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "morning to you all");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();
  });

  it("shows one accepted phrasing after a wrong translation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ correct: false, reason: "That is a farewell.", source: "ai" }),
      })),
    );
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "goodbye");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument();
    expect(screen.getByText("That is a farewell.")).toBeInTheDocument();
  });

  it("does not enable Check for a whitespace-only translation", async () => {
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Begin lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "   ");
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
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

// V3 pkg 4b: in-lesson reinforcement. pickReinforcementQuestion is mocked
// per-test here (defaults to null in beforeEach, matching every other
// test in this file) so these can control exactly when a reinforcement
// round appears, independent of the real curriculum's sibling/level pools.
describe("Lesson page -- in-lesson reinforcement (V3 pkg 4b)", () => {
  const reinforcementQuestion: Question = {
    id: "reinforce1",
    type: "mc",
    prompt: "Reinforcement: pick the greeting.",
    choices: ["Hello", "Goodbye"],
    answer: 0,
    explanation: "Hello is a greeting.",
  };

  it("shows a reinforcement question after a miss, then continues without double-counting", async () => {
    pickReinforcementQuestion.mockReturnValue(reinforcementQuestion);
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    // Miss q1 -- its own feedback shows first, not the reinforcement yet.
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(loseHeartRemote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Quick practice")).not.toBeInTheDocument();

    // Continue reveals the reinforcement round, not q2 yet -- progress
    // stays at 1/8 since it isn't a real question.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Quick practice")).toBeInTheDocument();
    expect(screen.getByText("Reinforcement: pick the greeting.")).toBeInTheDocument();
    expect(screen.getByText("1/8")).toBeInTheDocument();

    // Answering it (even wrong) doesn't touch hearts/missed again.
    await user.click(screen.getByRole("button", { name: "Goodbye" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(loseHeartRemote).toHaveBeenCalledTimes(1);

    // Continue past the reinforcement lands on the real next question.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.getByText("2/8")).toBeInTheDocument();
  });

  it("shows no reinforcement round when none is available", async () => {
    pickReinforcementQuestion.mockReturnValue(null);
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.queryByText("Quick practice")).not.toBeInTheDocument();
  });

  it("says 'Continue' rather than 'Finish' when a reinforcement is pending on the last question", async () => {
    pickReinforcementQuestion.mockReturnValue(reinforcementQuestion);
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    for (let i = 0; i < ANSWERS.length - 1; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      await user.click(screen.getByRole("button", { name: "Continue" }));
    }
    // Miss the last real question -- a naive idx-based label would say
    // "Finish" here, but the reinforcement round is still pending.
    await user.click(await screen.findByRole("button", { name: ANSWERS[7].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();
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

// V3 pkg 4b: generative sentence content -- on-demand extra practice from
// the finish screen, calling /api/generate-practice directly (a raw HTTP
// route, not a TanStack server function, same as /api/chat).
describe("Lesson page -- generative practice (V3 pkg 4b)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    completeLessonRemote.mockResolvedValue({
      xpGain: 80,
      newlyUnlocked: [],
      heartsBonus: null,
      progress: {
        xp: 80,
        streak: 1,
        longestStreak: 1,
        lastActiveDate: "2026-09-20",
        hearts: 5,
        heartsRefillAt: null,
        streakFreezes: 0,
        leagueTier: "bronze",
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function finishLesson(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await skipToQuiz(user);
    for (let i = 0; i < ANSWERS.length; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const label = i === ANSWERS.length - 1 ? "Finish" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }
    await screen.findByText("+80 XP");
  }

  it("generates and lets the user practice extra questions", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          questions: [
            { prompt: "Extra Q1", choices: ["a", "b"], answerIndex: 0, explanation: "why" },
          ],
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    await finishLesson(user);

    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText("Extra Q1")).toBeInTheDocument();
    expect(screen.getByText("Extra practice · 1/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "a" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Nice.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish practice" }));
    expect(await screen.findByText(/that's all the extra practice/)).toBeInTheDocument();
  });

  it("shows a message when no practice could be generated", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ questions: [] }), { status: 200 }));
    const user = userEvent.setup();
    await finishLesson(user);
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(
      await screen.findByText("Couldn't generate practice for this lesson right now."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("err", { status: 500 }));
    const user = userEvent.setup();
    await finishLesson(user);
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText("Something went wrong — try again.")).toBeInTheDocument();
  });
});
