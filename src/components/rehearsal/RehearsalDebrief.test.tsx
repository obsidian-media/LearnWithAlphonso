// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";

const api = vi.hoisted(() => ({ fetchRehearsals: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => api);
vi.mock("@tanstack/react-router", () => ({
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
    <a
      href={Object.entries(params ?? {}).reduce((t, [k, v]) => t.replace(`$${k}`, v), to)}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const { RehearsalDebrief } = await import("./RehearsalDebrief");

const ID = "11111111-1111-4111-8111-111111111111";
const withRun = {
  ...fixture.state,
  nextStage: "hard_moments",
  runs: [
    {
      stage: "conversation",
      finishedAt: "2026-11-27T10:00:00Z",
      momentsShown: ["The salary question"],
      wentWell: ["You answered in full sentences", "You asked a question back"],
      corrections: ["I am hoping for around 3000", "I managed a team"],
    },
  ],
};

const props = {
  course: "en" as const,
  rehearsalId: ID,
  stage: "conversation" as const,
  seconds: 540,
  turns: 14,
  recapStatus: "ready" as const,
  fixCount: 2,
  onRunAgain: vi.fn(),
  onDone: vi.fn(),
};

beforeEach(() => {
  api.fetchRehearsals.mockReset();
  props.onRunAgain.mockReset();
  props.onDone.mockReset();
});

describe("RehearsalDebrief (after a run, in place of stars)", () => {
  it("shows the stage, the time and the turns, what went well and what to try next time", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    render(<RehearsalDebrief {...props} />);
    expect(await screen.findByText("That was a full interview")).toBeInTheDocument();
    expect(screen.getByText("Stage 2 · The real conversation")).toBeInTheDocument();
    expect(screen.getByText("9 minutes · 14 turns")).toBeInTheDocument();
    expect(screen.getByText("What went well")).toBeInTheDocument();
    expect(screen.getByText("You asked a question back")).toBeInTheDocument();
    expect(screen.getByText("Try again next time")).toBeInTheDocument();
    expect(screen.getByText("I am hoping for around 3000")).toBeInTheDocument();
  });

  it("names where the trouble spots went, and the one obvious next step", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    render(<RehearsalDebrief {...props} />);
    expect(await screen.findByText(/2 items\. They will come back in Review/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next: The hard moments" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/hard_moments`,
    );
  });

  it("'Run this stage again' starts a fresh call", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Run this stage again" }));
    expect(props.onRunAgain).toHaveBeenCalledTimes(1);
  });

  it("labels the writer an AI, says it can be wrong, and shows no score of any kind", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const { container } = render(<RehearsalDebrief {...props} />);
    expect(
      await screen.findByText(
        /Written by Alphonso, an AI, from this conversation\. It can be wrong\. Nothing here is a score\./,
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-practice-result]")).toBeNull();
    expect(container.textContent).not.toMatch(/stars?\b|readiness|\d\s?%/i);
  });

  it("says nothing about Fix before it sticks when the recap added no items", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    render(<RehearsalDebrief {...props} fixCount={0} />);
    await screen.findByText("That was a full interview");
    expect(screen.queryByText(/Fix before it sticks/)).toBeNull();
  });

  it("waits for the recap before it reads the run, and shows a quiet placeholder meanwhile", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const { rerender } = render(<RehearsalDebrief {...props} recapStatus="pending" />);
    expect(screen.getByText("Alphonso is writing it up")).toBeInTheDocument();
    expect(api.fetchRehearsals).not.toHaveBeenCalled();
    rerender(<RehearsalDebrief {...props} recapStatus="ready" />);
    await waitFor(() => expect(api.fetchRehearsals).toHaveBeenCalledWith("en"));
    expect(await screen.findByText("That was a full interview")).toBeInTheDocument();
  });

  it("a run too short to count says so plainly and offers to run it again, without inventing results", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: { ...fixture.state, runs: [] } });
    render(<RehearsalDebrief {...props} recapStatus="off" turns={3} />);
    expect(await screen.findByText(/too short to count/)).toBeInTheDocument();
    expect(screen.queryByText("What went well")).toBeNull();
    expect(screen.getByRole("button", { name: "Run this stage again" })).toBeInTheDocument();
  });

  it("only the run for THIS stage is shown, never another stage's", async () => {
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: {
        ...withRun,
        runs: [{ ...withRun.runs[0], stage: "warmup", wentWell: ["a warm-up thing"] }],
      },
    });
    render(<RehearsalDebrief {...props} />);
    expect(await screen.findByText(/too short to count/)).toBeInTheDocument();
    expect(screen.queryByText("a warm-up thing")).toBeNull();
  });

  it("when the state cannot be read it still offers Run again and Done", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: false, error: "failed" });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Done" }));
    expect(props.onDone).toHaveBeenCalled();
  });
});
