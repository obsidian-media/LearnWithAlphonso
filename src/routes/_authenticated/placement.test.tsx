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
}));

const canSpeak = vi.fn(() => true);
const speak = vi.fn();
vi.mock("../../lib/speech", () => ({
  speak: (t: string, l: string) => speak(t, l),
  canSpeak: () => canSpeak(),
}));

const savePlacementResult = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ savePlacementResult }));

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

// Typed as the union rather than inferred from the first fixture, so a
// listening or translate set can be injected too.
const pickPlacement = vi.fn((): PlacementQuestion[] => FIXED_QUESTIONS);
vi.mock("../../data/courses", () => ({
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
  useProgress.getState().reset();
});

describe("Placement test", () => {
  it("shows step progress and disables submit until an answer is picked", () => {
    renderPage();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("advances to the next question on Continue, then finishes with 'See my level'", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("2/2")).toBeInTheDocument();
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
    expect(screen.getByText("1/2")).toBeInTheDocument();
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

  it("drops listening questions where the browser cannot speak", async () => {
    // The sentence IS the answer, so printing it as a fallback would hand the
    // learner the mark. The question leaves the exam instead.
    canSpeak.mockReturnValue(false);
    pickPlacement.mockReturnValue([...LISTENING_BAND]);
    renderPage();

    expect(await screen.findByText(/No placement questions are available/i)).toBeInTheDocument();
    expect(screen.queryByText("She's a doctor.")).toBeNull();
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

  it("keeps the exam moving when the grader cannot be reached", async () => {
    // There is no skip in this exam. A translation that never resolves is an
    // exam that cannot finish, which leaves the learner unplaced entirely --
    // worse than being placed a band low.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    pickPlacement.mockReturnValue([...TRANSLATE_QUESTIONS]);
    const user = userEvent.setup();
    renderPage();

    for (let i = 0; i < 3; i++) {
      fireEvent.change(await screen.findByLabelText("Your answer"), {
        target: { value: "nowhere near it" },
      });
      await user.click(screen.getByRole("button", { name: /See my level|Continue/ }));
    }

    // The exam finished and placed them, which is the point: an unresolvable
    // question would leave them with no level at all.
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
