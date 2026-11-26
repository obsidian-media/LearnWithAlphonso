// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return { ...actual, useServerFn: (fn: unknown) => fn };
});

// jsdom implements no speechSynthesis, so `canSpeak` is genuinely false there
// and the player correctly hides the play button and shows a transcript
// instead. Mock it to true so these tests exercise the audio path.
const canSpeak = vi.fn(() => true);
vi.mock("../../lib/speech", () => ({
  speak: vi.fn(),
  canSpeak: () => canSpeak(),
}));

const fetchDueReviews = vi.fn();
const gradeReview = vi.fn();
const claimReviewClearBonusRemote = vi.fn();
vi.mock("../../lib/review.functions", () => ({
  fetchDueReviews,
  gradeReview,
  claimReviewClearBonusRemote,
}));

const { Route } = await import("./review");
const { useProgress } = await import("../../lib/progress");

// Real curriculum questions: u1l1:q1 is mc ("Good morning." is correct),
// u1l1:q2 is fill-in-the-blank (answer "meet").
function renderPage() {
  const ReviewPage = Route.options.component!;
  return render(<ReviewPage />);
}

beforeEach(() => {
  fetchDueReviews.mockReset();
  gradeReview.mockReset();
  gradeReview.mockResolvedValue({ retired: false, dueOn: "2026-09-20" });
  claimReviewClearBonusRemote.mockReset();
  claimReviewClearBonusRemote.mockResolvedValue({ granted: false, hearts: null });
  useProgress.getState().reset();
});

describe("Review page", () => {
  it("shows a loading state before the queue resolves", () => {
    fetchDueReviews.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading your review queue…")).toBeInTheDocument();
  });

  it("shows the no-items message when nothing has ever missed a review", async () => {
    fetchDueReviews.mockResolvedValue({ due: [], total: 0 });
    renderPage();
    expect(await screen.findByText("Nothing due today")).toBeInTheDocument();
    expect(screen.getByText(/Miss a question in a lesson/)).toBeInTheDocument();
  });

  it("shows a not-due-yet message when items exist but none are due", async () => {
    fetchDueReviews.mockResolvedValue({ due: [], total: 3 });
    renderPage();
    expect(
      await screen.findByText(/You have 3 items in review — none are due yet/),
    ).toBeInTheDocument();
  });

  it("names the page for a screen reader while a question is up: one level-1 heading, Review", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    renderPage();
    await screen.findByText("Which is a formal greeting?");
    expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  });

  it("grades a correct multiple-choice answer and advances on Continue", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Which is a formal greeting?")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "u1l1:q1",
        answer: "Good morning.",
        course: "en",
        attemptId: expect.any(String),
      },
    });

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/1 correct · 0 to revisit/)).toBeInTheDocument();
  });

  // A saved word is a self-contained item like a weakness one: the page has no
  // bundled question for it, so it must build the card from the row itself. The
  // page used to do that only for source "weakness" and silently DROPPED a
  // saved_word row while still counting it in the queue total ("3 due" with 2
  // cards) -- reviewer finding on the save-any-word backend.
  it("renders and grades a saved-word item from the row itself", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [
        {
          itemKey: "savedword:0123456789abcdef",
          source: "saved_word",
          prompt: 'What does "serendipity" mean here?\nIt was pure serendipity.',
          choices: ["a sad ending", "a happy accident", "a long journey", "a loud noise"],
          answerIndex: 1,
          explanation: '"serendipity" means a happy accident.',
        },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/What does "serendipity" mean here\?/)).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "a happy accident" }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "savedword:0123456789abcdef",
        answer: "a happy accident",
        course: "en",
        attemptId: expect.any(String),
      },
    });
    // The explanation's words can be saved too (the page provides the save dialog).
    expect(screen.getByRole("button", { name: "accident" })).toBeInTheDocument();
  });

  // A missed podcast-quiz question is a self-contained row too (submit_podcast_quiz writes it), and the page must build
  // its card from the row rather than drop it while still counting it in the queue total.
  it("renders and grades a missed podcast-quiz question from the row itself", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [
        {
          itemKey: "podcast:0123456789abcdefq2",
          source: "podcast_quiz",
          prompt: "What did the speaker order?",
          choices: ["Tea", "A small coffee", "Juice"],
          answerIndex: 1,
          explanation: "Correct answer: A small coffee",
        },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("What did the speaker order?")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "A small coffee" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "podcast:0123456789abcdefq2",
        answer: "A small coffee",
        course: "en",
        attemptId: expect.any(String),
      },
    });
  });

  it("renders and grades a listening question rather than a blank card", async () => {
    // review.tsx is a SECOND renderer with its own render and grading sites.
    // A question type wired only into the lesson player renders as an empty
    // card here and the learner cannot clear their queue.
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "a1p23l1:a1p23q0" }],
      total: 1,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("What did you hear?")).toBeInTheDocument();
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play audio/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "She's a doctor." }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "a1p23l1:a1p23q0",
        answer: "She's a doctor.",
        course: "en",
        attemptId: expect.any(String),
      },
    });
  });

  it("renders and grades a speaking question rather than a blank card", async () => {
    // Same reason as the listening case above: review.tsx is a second renderer.
    // jsdom has no MediaRecorder, so this lands on the typing fallback -- and
    // the answer sent to the server is the transcript verbatim, graded
    // tolerantly on both sides rather than trimmed to match.
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "a1p24l1:a1p24q0" }],
      total: 1,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Say this aloud:")).toBeInTheDocument();
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    expect(screen.getByText("Good morning.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Type the phrase"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "a1p24l1:a1p24q0",
        answer: "good morning",
        course: "en",
        attemptId: expect.any(String),
      },
    });
  });

  it("renders a translation review item and shows the SERVER's verdict", async () => {
    // The point of this test is the disagreement it forbids. Locally "morning
    // to you all" does not match any curated phrasing, so a player computing
    // its own verdict would say "Back in the queue" -- while the server, which
    // asked the AI grader, has already scheduled it as correct. The learner
    // would be told one thing and have the opposite recorded.
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "a1p25l1:a1p25q0" }], total: 1 });
    gradeReview.mockResolvedValue({ retired: false, dueOn: "2026-09-25", correct: true });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Greet someone in the morning.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your answer"), "morning to you all");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "a1p25l1:a1p25q0",
        answer: "morning to you all",
        course: "en",
        attemptId: expect.any(String),
      },
    });
  });

  it("falls back to the local verdict when the server cannot be reached", async () => {
    // Being offline is not evidence about the learner's English, but leaving
    // them on a question that never resolves is worse than a strict verdict.
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "a1p25l1:a1p25q0" }], total: 1 });
    gradeReview.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Greet someone in the morning.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your answer"), "good morning");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
  });

  it("marks a wrong answer and shows the retired count when the item is retired", async () => {
    gradeReview.mockResolvedValue({ retired: true, dueOn: "2026-09-19" });
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Yo." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Back in the queue.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(
      await screen.findByText(/0 correct · 1 to revisit · 1 mastered and retired/),
    ).toBeInTheDocument();
  });

  it("supports fill-in-the-blank items via the word bank", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q2" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nice to ___ you.");
    await user.click(screen.getByRole("button", { name: "meet" }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: { itemKey: "u1l1:q2", answer: "meet", course: "en", attemptId: expect.any(String) },
    });
  });

  it("grants and displays the heart bonus when the queue is fully cleared", async () => {
    claimReviewClearBonusRemote.mockResolvedValue({ granted: true, hearts: 5 });
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    useProgress.setState({ hearts: 3 }); // below MAX_HEARTS so the +1 bonus is observable
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("Queue cleared: +1 heart")).toBeInTheDocument();
    expect(claimReviewClearBonusRemote).toHaveBeenCalledWith({ data: { course: "en" } });
    expect(useProgress.getState().hearts).toBe(4);
  });

  it("skips unknown item keys that no longer resolve to a real question", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:nonexistent" }],
      total: 2,
    });
    renderPage();
    expect(await screen.findByText("1/1")).toBeInTheDocument();
  });

  // Real curriculum lesson "u1l2" ("About Me"): q9 is an image-matching mc
  // question, q10 a listening mc question, q11 a reorder question -- see
  // curriculum.ts's V3 pkg 4a comment. All three can resurface here after
  // being missed in a lesson, same as any other review item.
  it("shows an image and grades an image-matching mc review item normally", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l2:q9" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("What is shown in the picture?")).toBeInTheDocument();
    // Decorative on purpose: a descriptive alt ("a doctor ...") would give the answer away.
    const img = screen.getByTestId("vocab-image").querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain("/vocab-images/en/doctor.jpg");

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: { itemKey: "u1l2:q9", answer: "Doctor", course: "en", attemptId: expect.any(String) },
    });
  });

  it("shows a play-audio button and grades a listening mc review item normally", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l2:q10" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("What is her job?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play audio/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Doctor" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
  });

  it("assembles and grades a reorder review item by tapping tokens in order", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l2:q11" }], total: 1 });
    const user = userEvent.setup();
    renderPage();

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

    expect(await screen.findByText("Still got it.")).toBeInTheDocument();
    expect(gradeReview).toHaveBeenCalledWith({
      data: {
        itemKey: "u1l2:q11",
        answer: "She is a doctor",
        course: "en",
        attemptId: expect.any(String),
      },
    });
  });

  it("marks a reorder review item wrong when tapped out of order", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l2:q11" }], total: 1 });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Put the words in order to make a sentence.");

    for (const word of ["doctor", "a", "is", "She"]) {
      await user.click(screen.getByRole("button", { name: word }));
    }
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Back in the queue.")).toBeInTheDocument();
  });
});

describe("Review page -- failures are said, never mistaken for an empty or finished queue", () => {
  it("a queue that fails to load says so with Try again, not 'Nothing due today'", async () => {
    fetchDueReviews
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Your review didn't load")).toBeInTheDocument();
    expect(screen.queryByText("Nothing due today")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Which is a formal greeting?")).toBeInTheDocument();
    expect(fetchDueReviews).toHaveBeenCalledTimes(2);
  });

  it("an answer that fails to save offers Try again and does not move on as if it counted", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    gradeReview
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ retired: false, dueOn: "2026-09-20" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This answer didn't save");
    // The sheet's main button retries; it does not advance.
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(gradeReview).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Which is a formal greeting?")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
  });

  it("Continue tapped while the save is still on its way waits for it, and stays put if it fails", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    let fail!: (e: unknown) => void;
    gradeReview.mockReturnValueOnce(new Promise((_r, reject) => (fail = reject)));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    // The tap lands while the save is still pending: the screen waits instead of moving on.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByText("Nice to ___ you.")).not.toBeInTheDocument();
    fail(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("This answer didn't save");
    expect(screen.queryByText("Nice to ___ you.")).not.toBeInTheDocument();
  });

  it("two taps on Continue while the save is on its way move on one card, not two", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    let land!: (v: unknown) => void;
    gradeReview.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    const continueButton = screen.getByRole("button", { name: "Continue" });
    await user.click(continueButton);
    await user.click(continueButton);
    land({ retired: false, dueOn: "2026-09-20" });
    // The second card, not the end of the queue that a double advance would reach.
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
    expect(screen.queryByText("Review complete")).not.toBeInTheDocument();
  });

  it("a Try again sends the same attempt id as the first try, and a new card a new one", async () => {
    fetchDueReviews.mockResolvedValue({
      due: [{ itemKey: "u1l1:q1" }, { itemKey: "u1l1:q2" }],
      total: 2,
    });
    gradeReview
      .mockRejectedValueOnce(new Error("reply lost"))
      .mockResolvedValue({ retired: false, dueOn: "2026-09-21" });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This answer didn't save");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "meet" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(gradeReview).toHaveBeenCalledTimes(3));
    const ids = gradeReview.mock.calls.map((c) => c[0].data.attemptId);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("a Try again whose first attempt did land is counted as this learner's own, not another tab's", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    gradeReview
      .mockRejectedValueOnce(new Error("reply lost"))
      .mockResolvedValue({ retired: false, dueOn: "2026-09-21", superseded: true });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This answer didn't save");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(screen.queryByText(/another tab/)).not.toBeInTheDocument();
    expect(await screen.findByText(/1 correct · 0 to revisit/)).toBeInTheDocument();
  });

  it("an answer another tab already graded is said to be superseded and is not counted", async () => {
    fetchDueReviews.mockResolvedValue({ due: [{ itemKey: "u1l1:q1" }], total: 1 });
    gradeReview.mockResolvedValue({ retired: false, dueOn: "2026-09-21", superseded: true });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/wasn't counted/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/0 correct · 0 to revisit/)).toBeInTheDocument();
  });

  it("with more due than one batch, the end of the batch says how many remain and loads the next", async () => {
    fetchDueReviews
      .mockResolvedValueOnce({ due: [{ itemKey: "u1l1:q1" }], total: 30, dueTotal: 25 })
      .mockResolvedValue({ due: [{ itemKey: "u1l1:q2" }], total: 30, dueTotal: 24 });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Good morning." }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await user.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("That's this round done")).toBeInTheDocument();
    expect(screen.getByText(/24 more are due/)).toBeInTheDocument();
    expect(screen.queryByText("Review complete")).not.toBeInTheDocument();
    // Not cleared yet, so no queue-cleared bonus is claimed.
    expect(claimReviewClearBonusRemote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Keep going/ }));
    expect(await screen.findByText("Nice to ___ you.")).toBeInTheDocument();
  });
});
