// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlacementQuestion } from "../../data/placement";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return { ...actual, useServerFn: (fn: unknown) => fn };
});

// AnimatePresence's mode="wait" defers mounting the next question until
// the previous one's exit animation completes -- which real framer-motion
// never resolves under jsdom/fake timers, silently freezing the flow one
// step behind. Render children immediately instead; this component's own
// question-swap logic is what's under test, not the transition itself.
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

const canSpeak = vi.fn(() => true);
const speak = vi.fn();
vi.mock("../../lib/speech", () => ({
  speak: (t: string, l: string) => speak(t, l),
  canSpeak: () => canSpeak(),
}));

const savePlacementResult = vi.fn();
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ savePlacementResult, fetchProgress }));

// A fixed, deterministic 2-question A1 set instead of the real random
// 15-question pool, so the placement flow (score -> next-level placement)
// is exercised without depending on which questions get sampled.
const FIXED_QUESTIONS: PlacementQuestion[] = [
  {
    id: "p1",
    level: "A1",
    type: "mc" as const,
    prompt: "Pick 2",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "p2",
    level: "A1",
    type: "mc" as const,
    prompt: "Pick 4",
    choices: ["wrong", "wrong2", "wrong3", "right"],
    answer: 3,
  },
];
const LISTENING_BAND: PlacementQuestion[] = [
  {
    id: "p50",
    level: "A1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "She's a doctor.",
    choices: ["She's a doctor.", "She's a teacher.", "He's a doctor.", "She's an actor."],
    answer: "She's a doctor.",
  },
  {
    id: "p50b",
    level: "A1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "She's a doctor.",
    choices: ["She's a doctor.", "She's a teacher.", "He's a doctor.", "She's an actor."],
    answer: "She's a doctor.",
  },
  {
    id: "p50c",
    level: "A1",
    type: "listening",
    prompt: "What did you hear?",
    audioText: "She's a doctor.",
    choices: ["She's a doctor.", "She's a teacher.", "He's a doctor.", "She's an actor."],
    answer: "She's a doctor.",
  },
];

const LISTENING_QUESTIONS: PlacementQuestion[] = [
  {
    id: "p50",
    level: "A1",
    type: "listening" as const,
    prompt: "What did you hear?",
    audioText: "She's a doctor.",
    choices: ["She's a doctor.", "She's a teacher."],
    answer: "She's a doctor.",
  },
];

// A full A1 band: the exam passes a band on 2 of 3, so a one-question fixture
// could never demonstrate acceptance -- it would score A1 whatever was typed.
const TRANSLATE_QUESTIONS: PlacementQuestion[] = [
  {
    id: "p60",
    level: "A1",
    type: "translate",
    prompt: "Greet someone in the morning.",
    acceptableAnswers: ["Good morning.", "Morning.", "Good morning to you."],
  },
  {
    id: "p60b",
    level: "A1",
    type: "translate",
    prompt: "Greet someone in the morning, again.",
    acceptableAnswers: ["Good morning.", "Morning.", "Good morning to you."],
  },
  {
    id: "p60c",
    level: "A1",
    type: "translate",
    prompt: "Greet someone in the morning, once more.",
    acceptableAnswers: ["Good morning.", "Morning.", "Good morning to you."],
  },
];

// Three real bands (A1, B1, C1) with A2/B2 deliberately absent -- exercises
// the adaptive skip-ahead path (acing a band skips the next one, credited
// synthetically, and resumes on the one after) without needing the full
// 15-question shape.
const MULTI_BAND_QUESTIONS: PlacementQuestion[] = [
  {
    id: "m-a1-1",
    level: "A1",
    type: "mc" as const,
    prompt: "A1 Q1",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-a1-2",
    level: "A1",
    type: "mc" as const,
    prompt: "A1 Q2",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-a1-3",
    level: "A1",
    type: "mc" as const,
    prompt: "A1 Q3",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-b1-1",
    level: "B1",
    type: "mc" as const,
    prompt: "B1 Q1",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-b1-2",
    level: "B1",
    type: "mc" as const,
    prompt: "B1 Q2",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-b1-3",
    level: "B1",
    type: "mc" as const,
    prompt: "B1 Q3",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-c1-1",
    level: "C1",
    type: "mc" as const,
    prompt: "C1 Q1",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-c1-2",
    level: "C1",
    type: "mc" as const,
    prompt: "C1 Q2",
    choices: ["wrong", "right"],
    answer: 1,
  },
  {
    id: "m-c1-3",
    level: "C1",
    type: "mc" as const,
    prompt: "C1 Q3",
    choices: ["wrong", "right"],
    answer: 1,
  },
];

// The real shape of a sitting: all five bands, three questions each, labelled
// "<band> Q<n>" so a test can tell WHICH band the exam is asking about -- the
// whole point of the skipped-band scenarios is that the exam goes back to a band
// the learner was never shown.
const FULL_BAND_QUESTIONS: PlacementQuestion[] = (["A1", "A2", "B1", "B2", "C1"] as const).flatMap(
  (level) =>
    [1, 2, 3].map((n): PlacementQuestion => ({
      id: `f-${level.toLowerCase()}-${n}`,
      level,
      type: "mc",
      prompt: `${level} Q${n}`,
      choices: ["wrong", "right"],
      answer: 1,
    })),
);

// Typed as the union rather than inferred from the first fixture, so a
// listening or translate set can be injected too. It takes the same
// `canPlayAudio` argument the real bundle does, because the route's job is now
// to pass the device's capability INTO sampling rather than filter the sampled
// set afterwards -- filtering afterwards can leave a band with one question,
// which no learner can pass. See playablePool in placement.ts.
const pickPlacement = vi.fn((canPlayAudio = true): PlacementQuestion[] =>
  canPlayAudio ? FIXED_QUESTIONS : FIXED_QUESTIONS.filter((q) => q.type !== "listening"),
);
vi.mock("../../data/courses", () => ({
  COURSES: [
    { id: "en", label: "English", flag: "EN", targetLanguage: "English" },
    { id: "fr", label: "French", flag: "FR", targetLanguage: "French" },
    { id: "es", label: "Spanish", flag: "ES", targetLanguage: "Spanish" },
  ],
  getCourse: () => ({ pickPlacement }),
  // Omitting this made the Play-audio handler unclickable in tests: vitest
  // throws on an export a mock factory does not define, so the button could
  // not be exercised at all.
  localeForCourse: () => "en-US",
}));

/** Answers the current question and advances, regardless of which label ("Continue" / "See my level") the submit button currently shows. */
async function answer(user: ReturnType<typeof userEvent.setup>, choice: "right" | "wrong") {
  await user.click(screen.getByRole("button", { name: choice }));
  await user.click(screen.getByRole("button", { name: /Continue|See my level/ }));
}

const { Route } = await import("./placement");
const { useProgress } = await import("../../lib/progress");

function renderPage() {
  const PlacementPage = Route.options.component!;
  return render(<PlacementPage />);
}

beforeEach(() => {
  canSpeak.mockReturnValue(true);
  speak.mockReset();
  vi.unstubAllGlobals();
  navigate.mockClear();
  savePlacementResult.mockReset();
  savePlacementResult.mockResolvedValue({});
  pickPlacement.mockClear();
  pickPlacement.mockReturnValue(FIXED_QUESTIONS);
  // mockReturnValue above wins over the factory implementation, so tests that
  // care about the argument re-establish it themselves.
  useProgress.getState().reset();
  fetchProgress.mockReset();
  // Most tests below are the RETAKE path: this course already has a placement, so the page goes
  // straight to the questions. The language chooser (only for a course with no placement) has its own
  // describe block, which clears this again.
  useProgress.setState({ placementTakenAt: "2026-01-01T00:00:00.000Z" });
});

describe("Placement language choice", () => {
  beforeEach(() => {
    useProgress.setState({ placementTakenAt: null });
  });

  it("asks which language before the first question when this course has no placement", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /which language do you want to learn/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /english/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /french/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /spanish/i })).toBeInTheDocument();
    expect(screen.queryByText("Pick 2")).not.toBeInTheDocument();
  });

  it("switches the course and loads that course's progress before starting the test", async () => {
    fetchProgress.mockResolvedValue({ course: "fr", xp: 0 });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /french/i }));
    expect(useProgress.getState().course).toBe("fr");
    expect(fetchProgress).toHaveBeenCalledWith({ data: { course: "fr" } });
    expect(await screen.findByText("Pick 2")).toBeInTheDocument();
  });

  it("does not reload progress when the learner keeps the current course", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /english/i }));
    expect(fetchProgress).not.toHaveBeenCalled();
    expect(await screen.findByText("Pick 2")).toBeInTheDocument();
  });

  it("still starts the test in the chosen course when loading progress fails (offline)", async () => {
    fetchProgress.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /spanish/i }));
    expect(useProgress.getState().course).toBe("es");
    expect(await screen.findByText("Pick 2")).toBeInTheDocument();
  });

  it("is skipped on a retake (a placement already exists)", () => {
    useProgress.setState({ placementTakenAt: "2026-01-01T00:00:00.000Z" });
    renderPage();
    expect(screen.queryByRole("heading", { name: /which language/i })).not.toBeInTheDocument();
    expect(screen.getByText("Pick 2")).toBeInTheDocument();
  });

  it("does not flash the chooser before the account has loaded", () => {
    useProgress.setState({ hydrated: false, placementTakenAt: null });
    renderPage();
    expect(screen.queryByRole("heading", { name: /which language/i })).not.toBeInTheDocument();
  });
});

describe("Placement test", () => {
  it("shows step progress and disables submit until an answer is picked", () => {
    renderPage();
    expect(screen.getByText("Question 1 · up to 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("advances to the next question on Continue, then finishes with 'See my level'", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Question 2 · up to 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my level" })).toBeDisabled();
  });

  it("scores a fully-correct A1 set into A2 and persists it locally + remotely", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "See my level" }));

    expect(await screen.findByText("A2")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 correct")).toBeInTheDocument();
    expect(useProgress.getState().cefrLevel).toBe("A2");
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "A2", score: 2, course: "en" },
    });
  });

  it("scores an all-wrong set as A1", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "wrong" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "wrong" }));
    await user.click(screen.getByRole("button", { name: "See my level" }));

    expect(await screen.findByText("A1")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 correct")).toBeInTheDocument();
  });

  it("does not fail the flow when the remote save rejects", async () => {
    savePlacementResult.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "See my level" }));

    expect(await screen.findByText("A2")).toBeInTheDocument();
  });

  it("lets the user retake the test, resampling questions and resetting state", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "See my level" }));
    await screen.findByText("A2");

    pickPlacement.mockClear();
    await user.click(screen.getByRole("button", { name: "Retake the test" }));

    expect(pickPlacement).toHaveBeenCalled();
    expect(screen.getByText("Question 1 · up to 2")).toBeInTheDocument();
  });

  it("navigates to /learn from the results screen", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "See my level" }));
    await user.click(await screen.findByRole("button", { name: /Start learning at/ }));
    expect(navigate).toHaveBeenCalledWith({ to: "/learn" });
  });

  it("navigates to /learn when exiting mid-test", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Exit placement test" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/learn" });
  });
});

describe("Adaptive band sequencing", () => {
  it("skips ahead on a perfect run, testing only the confirming bands, and discloses the fast-track", async () => {
    pickPlacement.mockReturnValue(MULTI_BAND_QUESTIONS);
    const user = userEvent.setup();
    renderPage();

    // A1 (3) -> ace it, skip A2 -> B1 (3) -> ace it, skip B2 -> C1 (3).
    for (let i = 0; i < 9; i++) {
      await answer(user, "right");
    }

    expect(await screen.findByText("C1")).toBeInTheDocument();
    expect(screen.getByText("9 of 9 correct")).toBeInTheDocument();
    expect(screen.getByText(/Fast-tracked past A2, B2/)).toBeInTheDocument();
  });

  it("stops right after a decisive fail on the first band instead of testing every band", async () => {
    pickPlacement.mockReturnValue(MULTI_BAND_QUESTIONS);
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 3; i++) {
      await answer(user, "wrong");
    }

    expect(await screen.findByText("A1")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 correct")).toBeInTheDocument();
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
  });

  it("plays the sentence in the course locale and grades the choice by its text", async () => {
    // A full band, so the 2-of-3 rule can actually distinguish right from
    // wrong. With a single question the result is A1 whatever is clicked, and
    // the old version of this test passed with listening grading broken.
    pickPlacement.mockReturnValue([...LISTENING_BAND]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /play audio/i }));
    expect(speak).toHaveBeenCalledWith("She's a doctor.", "en-US");

    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole("button", { name: "She's a doctor." }));
      await user.click(screen.getByRole("button", { name: /Continue|See my level/ }));
    }
    // Three correct answers pass the A1 band, which places them one above it.
    expect(await screen.findByText("A2")).toBeInTheDocument();
  });

  it("marks a wrong listening choice wrong", async () => {
    // The other half of the same claim: without this, a grader that returned
    // true unconditionally would still pass the test above.
    pickPlacement.mockReturnValue([...LISTENING_BAND]);
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole("button", { name: "She's a teacher." }));
      await user.click(screen.getByRole("button", { name: /Continue|See my level/ }));
    }
    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("asks for a pool the device can actually play, rather than filtering afterwards", async () => {
    // The route's whole responsibility here is the ARGUMENT: sampling has to
    // see the capability, because a listening question removed after the
    // 3-per-band draw can leave a band holding one question, and a band needs 2
    // correct -- so it becomes unpassable and the learner is placed a band low.
    // That is the exact defect this replaced. What the filter then does to real
    // content is asserted in placement-validity.test.ts.
    canSpeak.mockReturnValue(false);
    pickPlacement.mockImplementation((canPlayAudio = true) =>
      canPlayAudio ? [...LISTENING_BAND] : [],
    );
    renderPage();

    expect(pickPlacement).toHaveBeenCalledWith(false);
    expect(await screen.findByText(/No placement questions are available/i)).toBeInTheDocument();
    expect(screen.queryByText("She's a doctor.")).toBeNull();
  });

  it("asks for the full pool when the device can speak", async () => {
    // The other half: a true capability must not be reported as false, or every
    // device silently loses the listening questions.
    canSpeak.mockReturnValue(true);
    pickPlacement.mockImplementation((canPlayAudio = true) =>
      canPlayAudio ? [...LISTENING_BAND] : [],
    );
    renderPage();

    expect(pickPlacement).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("button", { name: /play audio/i })).toBeInTheDocument();
  });

  it("accepts a curated wording for a translation without asking the server", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    pickPlacement.mockReturnValue([...TRANSLATE_QUESTIONS]);
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 3; i++) {
      // fireEvent.change, not user.type: the answer field is controlled, and a
      // per-keystroke path left only the last character in state here.
      fireEvent.change(await screen.findByLabelText("Your answer"), {
        target: { value: "good morning" },
      });
      await user.click(screen.getByRole("button", { name: /See my level|Continue/ }));
    }

    // A curated wording is settled locally, so the exam never touches the
    // network -- which is also what keeps it usable offline.
    expect(fetchSpy).not.toHaveBeenCalled();
    // Three locally-accepted translations pass the A1 band, which places the
    // learner in the band above it.
    expect(await screen.findByText("A2")).toBeInTheDocument();
  });

  it("never sends a rejected translation to the AI grader (placement is graded on the device)", async () => {
    // There is no skip in this exam and no consent to ask for: a rejected translation is settled against the curated
    // wordings, so the exam finishes without the network and without sending the learner's words anywhere.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    pickPlacement.mockReturnValue([...TRANSLATE_QUESTIONS]);
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 3; i++) {
      fireEvent.change(await screen.findByLabelText("Your answer"), {
        target: { value: "nowhere near it" },
      });
      await user.click(screen.getByRole("button", { name: /See my level|Continue/ }));
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("does not let whitespace advance the exam", async () => {
    pickPlacement.mockReturnValue([...TRANSLATE_QUESTIONS]);
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /See my level|Continue/ })).toBeDisabled();
  });
});

const R = "right" as const;
const W = "wrong" as const;

/** Answers the next questions in order, one verdict each. */
async function answerAll(
  user: ReturnType<typeof userEvent.setup>,
  verdicts: ("right" | "wrong")[],
) {
  for (const verdict of verdicts) {
    await answer(user, verdict);
  }
}

// The defect this block pins, found in a QA run and reproduced on the web: ace A1 and the exam skips A2 on credit
// it gives itself, then lands on B1. Fail B1 outright and it used to stop there and place the learner AT B1 -- on
// the strength of an A2 nobody ever asked them, with the one band above A1 they had really sat failed. A skipped
// band's credit is only a bet that the band after it will be passed; when it is not, the exam has to go back and
// ask the skipped band, and place on answers it really has.
describe("A skipped band is only credited once the band after it is passed", () => {
  beforeEach(() => {
    pickPlacement.mockReturnValue(FULL_BAND_QUESTIONS);
  });

  it("goes back and asks A2 when B1 is failed outright, then places at A2 when A2 is failed too", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R]); // A1 perfect: A2 is skipped, B1 is next
    expect(await screen.findByText("B1 Q1")).toBeInTheDocument();
    expect(screen.queryByText("A2 Q1")).not.toBeInTheDocument();
    await answerAll(user, [W, W, W]); // B1 failed outright

    // It does not place on the A2 it gave itself -- it asks A2.
    expect(await screen.findByText("A2 Q1")).toBeInTheDocument();
    await answerAll(user, [W, W]);
    // The sent-back band is the last one asked, so its final question already says so.
    expect(screen.getByRole("button", { name: "See my level" })).toBeDisabled();
    await answer(user, W);

    expect(await screen.findByText("A2")).toBeInTheDocument();
    expect(screen.getByText("3 of 9 correct")).toBeInTheDocument();
    // Nothing was fast-tracked: the one band that was skipped has been asked after all.
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
    expect(useProgress.getState().cefrLevel).toBe("A2");
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "A2", score: 3, course: "en" },
    });
  });

  it("places at B1 once the band it went back to is really passed", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R, W, W, W]); // A1 perfect, B1 failed outright
    expect(await screen.findByText("A2 Q1")).toBeInTheDocument();
    await answerAll(user, [R, R, W]); // A2 really passed, 2 of 3

    // A1 and A2 passed on real answers and B1 failed: B1 is where they start.
    expect(await screen.findByText("B1")).toBeInTheDocument();
    expect(screen.getByText("5 of 9 correct")).toBeInTheDocument();
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "B1", score: 5, course: "en" },
    });
  });

  it("treats 1 of 3 on B1 as a fail too: it goes back to A2 instead of carrying on to B2", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R]);
    await answerAll(user, [R, W, W]); // B1: 1 of 3, under the 2-of-3 pass mark

    expect(await screen.findByText("A2 Q1")).toBeInTheDocument();
    // B2 is not asked: it could not change the result, B1 having failed.
    expect(screen.queryByText("B2 Q1")).not.toBeInTheDocument();
    await answerAll(user, [W, W, W]);

    expect(await screen.findByText("A2")).toBeInTheDocument();
    expect(screen.getByText("4 of 9 correct")).toBeInTheDocument();
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "A2", score: 4, course: "en" },
    });
  });

  it("keeps the fast-track when B1 is passed 2 of 3: the credit for A2 now has a real pass above it", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R]);
    await answerAll(user, [R, R, W]); // B1 passed, not perfect: carry on to B2

    expect(await screen.findByText("B2 Q1")).toBeInTheDocument();
    expect(screen.queryByText("A2 Q1")).not.toBeInTheDocument();
    await answerAll(user, [W, W, W]);

    // A1 and B1 passed for real, A2 stands on B1, B2 failed: start at B2.
    expect(await screen.findByText("B2")).toBeInTheDocument();
    expect(screen.getByText("5 of 9 correct")).toBeInTheDocument();
    expect(screen.getByText("Fast-tracked past A2 after strong answers.")).toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "B2", score: 5, course: "en" },
    });
  });

  it("skips B2 as well when B1 is perfect, and keeps both skips once C1 is passed", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R, R, R, R]); // A1 and B1 perfect: A2 and B2 skipped
    expect(await screen.findByText("C1 Q1")).toBeInTheDocument();
    await answerAll(user, [R, R, R]);

    expect(await screen.findByText("C1")).toBeInTheDocument();
    expect(screen.getByText("9 of 9 correct")).toBeInTheDocument();
    expect(screen.getByText("Fast-tracked past A2, B2 after strong answers.")).toBeInTheDocument();
  });

  it("goes back to B2 when C1 is failed after a double skip, and keeps the A2 credit that B1 backs", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R, R, R, R]); // A2 and B2 skipped, C1 next
    await answerAll(user, [W, W, W]); // C1 failed outright

    expect(await screen.findByText("B2 Q1")).toBeInTheDocument();
    await answerAll(user, [W, W, W]);

    // A2 is still credited -- B1 was really passed above it -- but B2 was asked, and failed.
    expect(await screen.findByText("B2")).toBeInTheDocument();
    expect(screen.getByText("6 of 12 correct")).toBeInTheDocument();
    expect(screen.getByText("Fast-tracked past A2 after strong answers.")).toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "B2", score: 6, course: "en" },
    });
  });

  it("applies the same rule higher up: A2 perfect skips B1, and a failed B2 sends the exam back to B1", async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, W]); // A1: 2 of 3 is a pass but not perfect, so A2 is asked
    expect(await screen.findByText("A2 Q1")).toBeInTheDocument();
    await answerAll(user, [R, R, R]); // A2 perfect: B1 skipped
    expect(await screen.findByText("B2 Q1")).toBeInTheDocument();
    await answerAll(user, [W, W, W]); // B2 failed outright

    expect(await screen.findByText("B1 Q1")).toBeInTheDocument();
    await answerAll(user, [W, W, W]);

    expect(await screen.findByText("B1")).toBeInTheDocument();
    expect(screen.getByText("5 of 12 correct")).toBeInTheDocument();
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "B1", score: 5, course: "en" },
    });
  });

  it("places at the skipped band at most when that band has no questions to go back to", async () => {
    // MULTI_BAND_QUESTIONS has no A2. The skip is still taken (a real band lies beyond it), but a failed B1 leaves
    // nothing to ask, so the credit is simply withdrawn and is never the basis for B1.
    pickPlacement.mockReturnValue(MULTI_BAND_QUESTIONS);
    const user = userEvent.setup();
    renderPage();

    await answerAll(user, [R, R, R, W, W, W]);

    expect(await screen.findByText("A2")).toBeInTheDocument();
    expect(screen.getByText("3 of 6 correct")).toBeInTheDocument();
    expect(screen.queryByText(/Fast-tracked/)).not.toBeInTheDocument();
    expect(savePlacementResult).toHaveBeenCalledWith({
      data: { level: "A2", score: 3, course: "en" },
    });
  });
});

describe("The length is shown up front and the level markers tell passes from skips", () => {
  beforeEach(() => {
    pickPlacement.mockReturnValue(FULL_BAND_QUESTIONS);
  });

  const state = (level: string) =>
    screen.getByLabelText(new RegExp(`^${level},`)).getAttribute("data-state");

  it("says 'up to 15' from the first question to the last, however the exam adapts", async () => {
    const user = userEvent.setup();
    renderPage();

    // A1 perfect (A2 skipped), B1 failed, back to A2: 9 questions. The counter grows, the maximum never does.
    const seen: string[] = [];
    for (const verdict of [R, R, R, W, W, W, W, W, W]) {
      seen.push(screen.getByText(/^Question \d+ · up to \d+$/).textContent ?? "");
      await answer(user, verdict);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Question ${n} · up to 15`));
  });

  it("reads an early finish as a result: 'Placed after 9 questions'", async () => {
    const user = userEvent.setup();
    renderPage();
    await answerAll(user, [R, R, R, W, W, W, W, W, W]);
    expect(await screen.findByText("Placed after 9 questions")).toBeInTheDocument();
  });

  it("does not add the early-finish line when every question was asked", async () => {
    pickPlacement.mockReturnValue(FIXED_QUESTIONS);
    const user = userEvent.setup();
    renderPage();
    await answerAll(user, [R, R]);
    await screen.findByText("A2");
    expect(screen.queryByText(/Placed after/)).not.toBeInTheDocument();
  });

  it("marks a skipped band differently from a passed one", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(state("A1")).toBe("current");
    expect(state("C1")).toBe("upcoming");

    await answerAll(user, [R, R, R]); // A1 perfect: A2 skipped
    expect([state("A1"), state("A2"), state("B1"), state("B2")]).toEqual([
      "passed",
      "skipped",
      "current",
      "upcoming",
    ]);

    await answerAll(user, [R, R, W]); // B1 passed 2 of 3: B1 is passed, A2 still only skipped
    expect([state("A1"), state("A2"), state("B1"), state("B2")]).toEqual([
      "passed",
      "skipped",
      "passed",
      "current",
    ]);
  });

  it("takes the skipped marker back when the credit is withdrawn", async () => {
    const user = userEvent.setup();
    renderPage();
    await answerAll(user, [R, R, R, W, W, W]); // B1 failed: A2 is asked after all
    expect([state("A1"), state("A2"), state("B1")]).toEqual(["passed", "current", "missed"]);
  });
});
