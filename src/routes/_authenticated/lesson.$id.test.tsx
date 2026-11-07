// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { useAiConsent } from "@/lib/ai-consent-context";
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
const buyHeartWithXpRemote = vi.fn();
const restoreHeartsRemote = vi.fn();
vi.mock("../../lib/sync.functions", () => ({
  startLessonSession,
  completeLessonRemote,
  loseHeartRemote,
  buyHeartWithXpRemote,
  restoreHeartsRemote,
}));

const recordMisses = vi.fn();
vi.mock("../../lib/review.functions", () => ({ recordMisses }));

vi.mock("../../lib/auth-headers", () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));

// Alphonso Pro status, as /api/pro-status reports it. Free unless a test says otherwise.
let proState: "loading" | "pro" | "free" | "error" = "free";
vi.mock("../../lib/use-pro-status", () => ({
  useProStatus: () => ({
    state: proState,
    store: null,
    trialEligible: false,
    manageUrl: null,
    justPaid: false,
    retry: vi.fn(),
  }),
}));

// Sound effects: the real player is unit-tested in sfx.test.ts; here only which effect each lesson moment asks for.
const playSfx = vi.fn((_event: string, _key?: string) => true);
const playSfxCues = vi.fn((_cues: unknown, _key: string) => () => {});
vi.mock("../../lib/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/sfx")>();
  return {
    ...actual,
    playSfx: (event: string, key?: string) => playSfx(event, key),
    playSfxCues: (cues: unknown, key: string) => playSfxCues(cues, key),
  };
});

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

function renderPage(consentApi = fakeConsentApi()) {
  const LessonPage = Route.options.component!;
  return render(withAiConsent(<LessonPage />, consentApi));
}

async function skipToQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Start lesson" }));
  await user.click(await screen.findByRole("button", { name: "Skip to practice" }));
}

beforeEach(() => {
  proState = "free";
  canSpeak.mockReturnValue(true);
  currentLessonId = "u1l1";
  navigate.mockClear();
  startLessonSession.mockReset();
  startLessonSession.mockResolvedValue({ token: "session-tok" });
  completeLessonRemote.mockReset();
  loseHeartRemote.mockReset();
  loseHeartRemote.mockResolvedValue({ hearts: 4 });
  buyHeartWithXpRemote.mockReset();
  restoreHeartsRemote.mockReset();
  restoreHeartsRemote.mockResolvedValue({ hearts: 5 });
  recordMisses.mockReset();
  recordMisses.mockResolvedValue({ added: 1 });
  pickReinforcementQuestion.mockReset();
  pickReinforcementQuestion.mockReturnValue(null);
  useProgress.getState().reset();
  useProgress.setState({ streak: 7 });
  playSfx.mockClear();
  playSfxCues.mockClear();
});

describe("out of hearts", () => {
  it("shows the hearts dialog, not the lesson, when the server says out-of-hearts", async () => {
    startLessonSession.mockResolvedValue({
      error: "out-of-hearts",
      refillAt: Date.now() + 5 * 60_000,
    });
    renderPage();
    expect(await screen.findByRole("dialog", { name: "Out of hearts" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start lesson" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review instead" })).toBeInTheDocument();
  });

  it("buying a heart with XP retries the session and opens the lesson", async () => {
    const user = userEvent.setup();
    useProgress.setState({ xp: 120 });
    startLessonSession
      .mockResolvedValueOnce({ error: "out-of-hearts", refillAt: Date.now() + 5 * 60_000 })
      .mockResolvedValueOnce({ token: "session-tok" });
    buyHeartWithXpRemote.mockResolvedValue({ ok: true, hearts: 1, xp: 70, cost: 50 });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Use 50 XP for a heart" }));
    expect(await screen.findByRole("button", { name: "Start lesson" })).toBeInTheDocument();
    expect(startLessonSession).toHaveBeenCalledTimes(2);
  });

  it("when the countdown ends it restores hearts and asks for a new session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      startLessonSession
        .mockResolvedValueOnce({ error: "out-of-hearts", refillAt: Date.now() + 1000 })
        .mockResolvedValueOnce({ token: "session-tok" });
      renderPage();
      await screen.findByRole("dialog", { name: "Out of hearts" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      await waitFor(() => expect(restoreHeartsRemote).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(startLessonSession).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole("button", { name: "Start lesson" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Review instead goes to review; closing goes back to learn", async () => {
    const user = userEvent.setup();
    startLessonSession.mockResolvedValue({ error: "out-of-hearts", refillAt: null });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Review instead" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/review" });
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/learn" });
  });
});

describe("Lesson page", () => {
  it("lesson start is set in the unit's own room, with the unit, the title, the steps and a gold Start button", async () => {
    const { container } = renderPage();
    const start = await screen.findByRole("button", { name: "Start lesson" });
    // The pressable primary: gold with an edge that presses down.
    expect(start.className).toContain("bg-[linear-gradient(180deg,var(--c-action-hi)");
    expect(start.className).toContain("active:translate-y-1");
    // u1l1 is in unit u1, whose room is the park cafe terrace.
    expect(container.querySelector("[data-room]")?.getAttribute("data-room")).toBe(
      "/avatar/scenes/smalltalk.webp",
    );
    expect(screen.getByRole("img", { name: "Alphonso, talking" })).toHaveAttribute(
      "src",
      "/alphonso/lesson/talk.webp",
    );
    expect(screen.getByText("Unit 1 · Everyday Basics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Saying Hello" })).toBeInTheDocument();
    const steps = [...container.querySelectorAll<HTMLElement>("[data-step]")];
    expect(steps.map((s) => s.dataset.step)).toEqual(["words", "practice", "review"]);
    // Drawn icons, not emoji pictures.
    expect(container.querySelector("[data-step] img")).toBeNull();
    expect(container.querySelectorAll("[data-step] svg")).toHaveLength(3);
  });

  it("lesson start says how long, how many questions and the most XP, from the real lesson and the XP formula", async () => {
    const { getCourse } = await import("../../data/courses");
    const { estimateLessonMinutes } = await import("../../lib/lesson-time");
    const { computeXpGain } = await import("../../lib/progress-math");
    const { vocabForLesson } = await import("../../data/vocab");
    const lesson = getCourse("en").curriculum[0].lessons[0];
    renderPage();
    await screen.findByRole("button", { name: "Start lesson" });
    const minutes = estimateLessonMinutes(lesson.questions, vocabForLesson(lesson.id, "en").length);
    const most = computeXpGain(lesson.questions.length, lesson.questions.length);
    expect(most).toBe(100);
    expect(
      screen.getByText(
        `About ${minutes} min · ${lesson.questions.length} questions · Up to ${most} XP`,
      ),
    ).toBeInTheDocument();
  });

  it("a right answer shows the XP it earns; a wrong one shows none", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].correct }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    const right = (await screen.findByText("Exactly!")).closest('[role="status"]') as HTMLElement;
    expect(within(right).getByText("+10 XP")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: ANSWERS[1].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    const wrong = (await screen.findByText("Not quite")).closest('[role="status"]') as HTMLElement;
    expect(within(wrong).queryByText(/XP/)).toBeNull();
  });

  it("a replay shows no XP on a right answer until the learner passes their best earlier score", async () => {
    // Best earlier try: 2 of 8. The server pays a replay only past that, so the first two right answers earn nothing.
    useProgress.setState({
      completedLessons: ["u1l1"],
      answersByLesson: { u1l1: { correct: 2, total: 8 } },
    });
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    const chips: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const sheet = (await screen.findByText("Exactly!")).closest('[role="status"]') as HTMLElement;
      chips.push(within(sheet).queryByText(/XP/)?.textContent ?? null);
      await user.click(screen.getByRole("button", { name: "Continue" }));
    }
    expect(chips).toEqual([null, null, "+10 XP"]);
  });

  it("the room changes with the unit: a lesson in another unit stands in that unit's room", async () => {
    currentLessonId = "u2l1";
    const { container } = renderPage();
    await screen.findByRole("button", { name: "Start lesson" });
    expect(container.querySelector("[data-room]")?.getAttribute("data-room")).toBe(
      "/avatar/scenes/bedroom.webp",
    );
  });

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
    // deriveVocab deliberately skips (see vocab.ts), so "Start lesson" goes
    // straight to the quiz rather than via "Start practice".
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
  });

  it("marks a different phrase wrong on a speaking question", async () => {
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good night");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(loseHeartRemote).toHaveBeenCalled();
  });

  it("a Pro learner's wrong answer costs no heart (unlimited hearts)", async () => {
    proState = "pro";
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good night");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(loseHeartRemote).not.toHaveBeenCalled();
  });

  it("lets the learner save a word from the explanation (the page provides the dialog)", async () => {
    const user = userEvent.setup();
    currentLessonId = "a1p24l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Type the phrase"), "good night");
    await user.click(screen.getByRole("button", { name: "Check" }));
    const feedback = (await screen.findByText("Not quite")).closest('[role="status"]')!;
    const reason = feedback.querySelector<HTMLElement>("[data-verdict-reason]")!;
    const words = within(reason).queryAllByRole("button");
    expect(words.length).toBeGreaterThan(0);
    await user.click(words[0]);
    expect(screen.getByRole("dialog", { name: /save this word/i })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "morning to you all");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
  });

  it("without consent grades a translation locally and never asks the grader", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ correct: true, reason: "Same meaning.", source: "ai" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage(fakeConsentApi(null));
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    expect(await screen.findByText("Turn on AI grading")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your answer"), "morning to you all");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith("/api/grade-translation", expect.anything());
  });

  it("a 403 ai-consent-required from the grader (withdrawn elsewhere) turns AI off in this tab too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        clone() {
          return this;
        },
        json: async () => ({ error: "ai-consent-required" }),
      })),
    );
    function Probe() {
      return <p data-testid="consent-status">{useAiConsent().status}</p>;
    }
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    const LessonPage = Route.options.component!;
    render(
      withAiConsent(
        <>
          <LessonPage />
          <Probe />
        </>,
        fakeConsentApi("2026-10-09T10:00:00Z"),
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    expect(screen.getByTestId("consent-status")).toHaveTextContent("granted");
    await user.type(screen.getByLabelText("Your answer"), "morning to you all");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(screen.getByTestId("consent-status")).toHaveTextContent("denied");
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
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "goodbye");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument();
    expect(screen.getByText("That is a farewell.")).toBeInTheDocument();
  });

  it("does not enable Check for a whitespace-only translation", async () => {
    const user = userEvent.setup();
    currentLessonId = "a1p25l1";
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));

    await user.type(screen.getByLabelText("Your answer"), "   ");
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
  });

  it("walks overview -> vocab -> quiz for a lesson with derived vocabulary", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Saying Hello")).toBeInTheDocument();
    expect(screen.getAllByText("8 new words").length).toBeGreaterThan(0);
    expect(screen.getByText("8 questions: pick, listen, say it back")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start lesson" }));
    expect(await screen.findByText("Word 1 of 8")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument(); // a derived vocab term

    await user.click(screen.getByRole("button", { name: "Skip to practice" }));
    expect(await screen.findByText("Which is a formal greeting?")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Question 1 of 8");
  });

  it("words to learn come one card at a time: Next word moves on, the last card starts practice", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    expect(await screen.findByText("Word 1 of 8")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-vocab-card]")).toHaveLength(1);
    expect(screen.getByText("Good morning.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next word" }));
    expect(await screen.findByText("Word 2 of 8")).toBeInTheDocument();
    // The first card slides out, then only the second is on screen.
    await waitFor(() => expect(screen.queryByText("Good morning.")).not.toBeInTheDocument());
    expect(container.querySelectorAll("[data-vocab-card]")).toHaveLength(1);

    for (let i = 2; i < 8; i++) await user.click(screen.getByRole("button", { name: "Next word" }));
    expect(await screen.findByText("Word 8 of 8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next word" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    expect(await screen.findByText("Which is a formal greeting?")).toBeInTheDocument();
  });

  it("a word with no photo gets a coloured band with the word, and Skip sits on the counter row", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    const counter = await screen.findByText("Word 1 of 8");
    // "Good morning." has no photo: the band carries the word, in the first tile tone.
    const band = container.querySelector("[data-word-band]");
    expect(band).not.toBeNull();
    expect(band).toHaveTextContent("Good morning.");
    expect(band?.className).toContain("bg-ds-choice-tint");
    expect(container.querySelector("[data-vocab-card] img[src*='vocab']")).toBeNull();
    expect(counter.parentElement).toContainElement(
      screen.getByRole("button", { name: "Skip to practice" }),
    );

    await user.click(screen.getByRole("button", { name: "Next word" }));
    await screen.findByText("Word 2 of 8");
    await waitFor(() =>
      expect(container.querySelector("[data-word-band]")?.className).toContain("bg-ds-xp-tint"),
    );
  });

  it("the arrow keys move through the words too", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    expect(await screen.findByText("Word 1 of 8")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("Word 2 of 8")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByText("Word 1 of 8")).toBeInTheDocument();
  });

  it("the arrow keys still work right after a click on Next word or the speaker, which leaves that button focused", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    await user.click(await screen.findByRole("button", { name: "Next word" }));
    expect(await screen.findByText("Word 2 of 8")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("Word 3 of 8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Play pronunciation for/ }));
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByText("Word 2 of 8")).toBeInTheDocument();
  });

  it("announces card changes: the Word n of N counter is a polite, atomic live region", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    const counter = await screen.findByText("Word 1 of 8");
    expect(counter).toHaveAttribute("aria-live", "polite");
    expect(counter).toHaveAttribute("aria-atomic", "true");
  });

  it("the arrow keys leave the words alone while focus is in a field, a button or a dialog, or a modifier is held", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start lesson" }));
    await screen.findByText("Word 1 of 8");

    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    await user.keyboard("{ArrowRight}");
    field.remove();

    const area = document.createElement("textarea");
    document.body.appendChild(area);
    area.focus();
    await user.keyboard("{ArrowRight}");
    area.remove();

    // Widgets that really use the arrows keep them.
    for (const role of ["slider", "listbox", "radiogroup", "tablist"]) {
      const widget = document.createElement("div");
      widget.setAttribute("role", role);
      widget.tabIndex = 0;
      document.body.appendChild(widget);
      widget.focus();
      await user.keyboard("{ArrowRight}");
      widget.remove();
    }

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("div");
    inner.tabIndex = 0;
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    inner.focus();
    await user.keyboard("{ArrowRight}");
    dialog.remove();

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

    expect(screen.getByText("Word 1 of 8")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("Word 2 of 8")).toBeInTheDocument();
  });

  it("grades a correct answer, shows feedback, and advances on Continue", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    await user.click(screen.getByRole("button", { name: ANSWERS[0].correct }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Question 2 of 8");
    expect(loseHeartRemote).not.toHaveBeenCalled();
  });

  it("loses a heart locally and remotely on a wrong answer", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    const startingHearts = useProgress.getState().hearts;
    await user.click(screen.getByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Not quite")).toBeInTheDocument();
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
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
  });

  it("completes the lesson with server-graded misses and applies the returned progress", async () => {
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
      // A miss is acknowledged with "Got it", a right answer goes on with "Continue".
      const label = i === ANSWERS.length - 1 ? "Finish" : i === 1 ? "Got it" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(recordMisses).not.toHaveBeenCalled();
    expect(completeLessonRemote).toHaveBeenCalledWith({
      data: {
        lessonId: "u1l1",
        total: 8,
        answers: ANSWERS.map((a, i) => ({
          questionId: `q${i + 1}`,
          answer: i === 1 ? a.wrong : a.correct,
        })),
        course: "en",
        sessionToken: "session-tok",
      },
    });

    expect(await screen.findByLabelText("XP: +60")).toBeInTheDocument();
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

  it("a replay below the best earlier score keeps the best locally, so the next replay's XP chips start from it", async () => {
    useProgress.setState({
      completedLessons: ["u1l1"],
      answersByLesson: { u1l1: { correct: 8, total: 8 } },
    });
    completeLessonRemote.mockResolvedValue({
      xpGain: 0,
      correct: 7,
      newlyUnlocked: [],
      heartsBonus: null,
      progress: {
        xp: 100,
        streak: 1,
        longestStreak: 1,
        lastActiveDate: "2026-09-19",
        hearts: 4,
        heartsRefillAt: null,
        streakFreezes: 0,
        leagueTier: "bronze",
      },
    });
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    for (let i = 0; i < ANSWERS.length; i++) {
      const text = i === 1 ? ANSWERS[i].wrong : ANSWERS[i].correct;
      await user.click(await screen.findByRole("button", { name: text }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const label = i === ANSWERS.length - 1 ? "Finish" : i === 1 ? "Got it" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }
    await screen.findByLabelText("XP: +0");
    expect(useProgress.getState().answersByLesson.u1l1).toEqual({ correct: 8, total: 8 });
  });

  it("a second tap on Finish while the completion is in flight does not complete the lesson again", async () => {
    let resolve!: (v: unknown) => void;
    completeLessonRemote.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    for (let i = 0; i < ANSWERS.length; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      if (i < ANSWERS.length - 1)
        await user.click(screen.getByRole("button", { name: "Continue" }));
    }
    const finish = screen.getByRole("button", { name: "Finish" });
    await user.click(finish);
    await user.click(finish);
    expect(completeLessonRemote).toHaveBeenCalledTimes(1);
    resolve({
      xpGain: 100,
      correct: 8,
      newlyUnlocked: [],
      heartsBonus: null,
      progress: {
        xp: 100,
        streak: 1,
        longestStreak: 1,
        lastActiveDate: "2026-09-19",
        hearts: 5,
        heartsRefillAt: null,
        streakFreezes: 0,
        leagueTier: "bronze",
      },
    });
    expect(await screen.findByLabelText("XP: +100")).toBeInTheDocument();
  });

  it("the lesson time leaves out the minutes the tab was hidden", async () => {
    completeLessonRemote.mockRejectedValue(new Error("network down"));
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    let hidden = false;
    const hiddenProp = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const setHidden = (h: boolean, at: number) => {
      now = at;
      hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Start lesson" })); // the clock starts at 0
      await user.click(await screen.findByRole("button", { name: "Skip to practice" }));
      setHidden(true, 20_000); // 20 s in, the tab is hidden...
      setHidden(false, 620_000); // ...for ten minutes
      for (let i = 0; i < ANSWERS.length; i++) {
        await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
        await user.click(screen.getByRole("button", { name: "Check" }));
        now = i === ANSWERS.length - 1 ? 645_000 : now; // the last answer, 25 s after coming back
        const label = i === ANSWERS.length - 1 ? "Finish" : "Continue";
        await user.click(screen.getByRole("button", { name: label }));
      }
      expect(await screen.findByLabelText("Time: 0:45")).toBeInTheDocument();
    } finally {
      clock.mockRestore();
      hiddenProp.mockRestore();
    }
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

    expect(await screen.findByLabelText("XP: +0")).toBeInTheDocument();
    expect(useProgress.getState().completedLessons).not.toContain("u1l1");
    // Nothing was saved, so a streak from the stored progress would be a claim the server never made.
    expect(screen.queryByLabelText(/^Streak:/)).not.toBeInTheDocument();
  });

  it("asks for calm, not an error, when the server refuses a completion over the hourly ceiling", async () => {
    completeLessonRemote.mockRejectedValue(new Error("rate-limited"));
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    for (let i = 0; i < ANSWERS.length; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      const label = i === ANSWERS.length - 1 ? "Finish" : "Continue";
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(await screen.findByText("Slow down a little and try again.")).toBeInTheDocument();
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
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    expect(loseHeartRemote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Quick practice")).not.toBeInTheDocument();

    // Got it reveals the reinforcement round, not q2 yet -- progress
    // stays at 1/8 since it isn't a real question.
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(await screen.findByText("Quick practice")).toBeInTheDocument();
    expect(screen.getByText("Reinforcement: pick the greeting.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Question 1 of 8");

    // Answering it (even wrong) doesn't touch hearts/missed again.
    await user.click(screen.getByRole("button", { name: "Goodbye" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(loseHeartRemote).toHaveBeenCalledTimes(1);

    // Past the (missed) reinforcement lands on the real next question.
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Question 2 of 8");
  });

  it("shows no reinforcement round when none is available", async () => {
    pickReinforcementQuestion.mockReturnValue(null);
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);

    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.queryByText("Quick practice")).not.toBeInTheDocument();
  });

  it("says 'Got it' rather than 'Finish' when a reinforcement is pending on the last question", async () => {
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
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
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
    // Decorative on purpose: a descriptive alt ("a doctor ...") would give the answer away.
    const img = screen.getByTestId("vocab-image").querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain("/vocab-images/en/doctor.jpg");

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
  });

  it("shows a play-audio button and grades a listening mc question normally", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuestion(user, 9); // land on q10

    expect(await screen.findByText("What is her job?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play audio/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
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
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
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
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
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
    expect(await screen.findByText("Exactly!")).toBeInTheDocument();
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
    await screen.findByLabelText("XP: +80");
  }

  it("generates and lets the user practice extra questions", async () => {
    global.fetch = vi.fn().mockImplementation(
      async () =>
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
    // The generated explanation's words can be saved like any other explanation.
    expect(screen.getByRole("button", { name: "why" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish practice" }));
    expect(await screen.findByText(/that's all the extra practice/)).toBeInTheDocument();
  });

  it("shows a message when no practice could be generated", async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ questions: [] }), { status: 200 }),
      );
    const user = userEvent.setup();
    await finishLesson(user);
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(
      await screen.findByText("Couldn't generate practice for this lesson right now."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    global.fetch = vi.fn().mockImplementation(async () => new Response("err", { status: 500 }));
    const user = userEvent.setup();
    await finishLesson(user);
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  });
});

describe("sound effects at the lesson's moments", () => {
  const events = () => playSfx.mock.calls.map((c) => c[0]);
  const cueEvents = () =>
    playSfxCues.mock.calls.map((c) => (c[0] as { event: string }[]).map((cue) => cue.event));

  it("a right answer plays the right-answer effect, once", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].correct }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Exactly!");
    expect(events().filter((e) => e === "right")).toHaveLength(1);
    expect(events()).not.toContain("wrong");
    expect(cueEvents()).toEqual([]);
  });

  it("a wrong answer plays the wrong effect, then the heart going", async () => {
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Not quite");
    expect(cueEvents()).toEqual([["wrong", "heartLost"]]);
    expect(events()).not.toContain("right");
  });

  it("a Pro learner's wrong answer loses no heart, so no heart sound", async () => {
    proState = "pro";
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Not quite");
    expect(cueEvents()).toEqual([["wrong"]]);
  });

  it("with no hearts left to lose, a wrong answer plays no heart sound (the header shows no change)", async () => {
    useProgress.setState({ hearts: 0 });
    const user = userEvent.setup();
    renderPage();
    await skipToQuiz(user);
    await user.click(await screen.findByRole("button", { name: ANSWERS[0].wrong }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Not quite");
    expect(cueEvents()).toEqual([["wrong"]]);
  });

  it("Continue taps; the complete screen plays its jingle, XP and achievement once", async () => {
    completeLessonRemote.mockResolvedValue({
      xpGain: 60,
      newlyUnlocked: ["xp_100"],
      heartsBonus: null,
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
    for (let i = 0; i < ANSWERS.length; i++) {
      await user.click(await screen.findByRole("button", { name: ANSWERS[i].correct }));
      await user.click(screen.getByRole("button", { name: "Check" }));
      await user.click(
        screen.getByRole("button", { name: i === ANSWERS.length - 1 ? "Finish" : "Continue" }),
      );
    }
    await screen.findByText("Lesson complete");
    expect(events().filter((e) => e === "tap")).toHaveLength(ANSWERS.length);
    expect(cueEvents()).toEqual([["lessonComplete", "xp", "achievement"]]);
  });
});
