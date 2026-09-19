// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/1 correct · 0 to revisit/)).toBeInTheDocument();
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
      data: { itemKey: "u1l1:q2", answer: "meet", course: "en" },
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
});
