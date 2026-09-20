// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

const savePlacementResult = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ savePlacementResult }));

// A fixed, deterministic 2-question A1 set instead of the real random
// 15-question pool, so the placement flow (score -> next-level placement)
// is exercised without depending on which questions get sampled.
const FIXED_QUESTIONS = [
  { id: "p1", level: "A1", prompt: "Pick 2", choices: ["wrong", "right"], answer: 1 },
  {
    id: "p2",
    level: "A1",
    prompt: "Pick 4",
    choices: ["wrong", "wrong2", "wrong3", "right"],
    answer: 3,
  },
];
const pickPlacement = vi.fn(() => FIXED_QUESTIONS);
vi.mock("../../data/courses", () => ({ getCourse: () => ({ pickPlacement }) }));

const { Route } = await import("./placement");
const { useProgress } = await import("../../lib/progress");

function renderPage() {
  const PlacementPage = Route.options.component!;
  return render(<PlacementPage />);
}

beforeEach(() => {
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
