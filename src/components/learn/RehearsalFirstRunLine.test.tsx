// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  goal: "work" as string | null,
  entry: { status: "ready", state: null } as unknown,
}));
vi.mock("@/lib/use-learner-goal", () => ({ useLearnerGoal: () => h.goal }));
vi.mock("@/lib/use-rehearsal-entry", () => ({ useRehearsalEntry: () => h.entry }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { RehearsalFirstRunLine } = await import("./RehearsalFirstRunLine");

const ready = (over: object = {}) => ({
  status: "ready",
  state: {
    active: null,
    freeAvailable: true,
    history: [],
    runs: [],
    progress: null,
    nextStage: null,
    ...over,
  },
});

beforeEach(() => {
  localStorage.clear();
  h.goal = "work";
  h.entry = ready();
});

describe("RehearsalFirstRunLine (work-goal learners)", () => {
  it("offers the line to a learner whose goal is work, linking to Rehearsals", () => {
    render(<RehearsalFirstRunLine course="en" />);
    expect(
      screen.getByText("Got a real conversation coming up? Rehearse it with Alphonso."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rehearse" })).toHaveAttribute("href", "/rehearse");
  });

  it.each(["travel", "school", "family", "exam", "fun", null])("is not shown for goal %s", (g) => {
    h.goal = g;
    const { container } = render(<RehearsalFirstRunLine course="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is not shown while Rehearsals is off, or once a rehearsal exists", () => {
    h.entry = { status: "off", state: null };
    expect(render(<RehearsalFirstRunLine course="en" />).container).toBeEmptyDOMElement();
    h.entry = ready({ active: { id: "r" } });
    expect(render(<RehearsalFirstRunLine course="en" />).container).toBeEmptyDOMElement();
  });

  it("is not shown to someone who has used their free rehearsal", () => {
    h.entry = ready({ freeAvailable: false });
    expect(render(<RehearsalFirstRunLine course="en" />).container).toBeEmptyDOMElement();
  });

  it("can be dismissed, and stays dismissed", async () => {
    const user = userEvent.setup();
    const first = render(<RehearsalFirstRunLine course="en" />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    expect(render(<RehearsalFirstRunLine course="en" />).container).toBeEmptyDOMElement();
  });
});
