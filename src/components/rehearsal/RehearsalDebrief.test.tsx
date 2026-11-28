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
    search,
    children,
    onClick,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a
      href={
        Object.entries(params ?? {}).reduce((t, [k, v]) => t.replace(`$${k}`, v), to) +
        (search ? `?${JSON.stringify(search)}` : "")
      }
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
const pro = vi.hoisted(() => ({ state: "loading" as "loading" | "pro" | "free" | "error" }));
vi.mock("@/lib/use-pro-status", () => ({ useProStatus: () => ({ state: pro.state }) }));
vi.mock("../WebPaywall", () => ({ WebPaywallSheet: () => <p>paywall</p> }));

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
  pro.state = "error";
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
    expect(screen.getByRole("button", { name: "Next: The hard moments" })).toBeInTheDocument();
  });

  it("Next stage opens the partner sheet for the NEXT stage and starts no call by itself", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Next: The hard moments" }));
    expect(screen.getByRole("heading", { name: "The hard moments" })).toBeInTheDocument();
    expect(screen.getByText("Who do you want to practise with?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start with Alphonso" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/hard_moments`,
    );
    expect(props.onRunAgain).not.toHaveBeenCalled();
  });

  it("choosing Alphonso from the sheet starts the call without a persona", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Next: The hard moments" }));
    const href = screen.getByRole("link", { name: "Start with Alphonso" }).getAttribute("href");
    expect(href).toBe(`/rehearse/${ID}/hard_moments`);
    expect(href).not.toContain("persona");
  });

  it("a Pro client with hectorAvailable:false is not locked out of Hector", async () => {
    pro.state = "pro";
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { ...withRun, hectorAvailable: false },
    });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Next: The hard moments" }));
    expect(screen.getByRole("link", { name: "Start with Hector" })).toBeInTheDocument();
  });

  it("Run again after a Hector run, choosing Alphonso, restarts nothing by itself: the navigation remounts once", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} currentPartner={{ persona: "hector" }} />);
    await user.click(await screen.findByRole("button", { name: "Run this stage again" }));
    await user.click(screen.getByRole("link", { name: "Start with Alphonso" }));
    expect(props.onRunAgain).not.toHaveBeenCalled();
  });

  it("Run again with the SAME partner restarts the call, since the URL does not change", async () => {
    pro.state = "pro";
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { ...withRun, hectorAvailable: true },
    });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} currentPartner={{ persona: "hector" }} />);
    await user.click(await screen.findByRole("button", { name: "Run this stage again" }));
    await user.click(screen.getByRole("link", { name: "Start with Hector" }));
    expect(props.onRunAgain).toHaveBeenCalledTimes(1);
  });

  it("Run this stage again opens the sheet for the SAME stage; the call restarts only once a partner is chosen", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const user = userEvent.setup();
    render(<RehearsalDebrief {...props} />);
    await user.click(await screen.findByRole("button", { name: "Run this stage again" }));
    expect(props.onRunAgain).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "The real conversation" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Start with Alphonso" }));
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

describe("RehearsalDebrief: How you spoke", () => {
  const speaking = {
    notes: [
      { kind: "full_replies" as const, count: 7, total: 9, previous: 4 },
      { kind: "key_phrases" as const, count: 3, total: 8, previous: 4 },
      { kind: "english_fallback" as const, count: 2, total: 9, previous: null },
    ],
  };
  it("shows the card with the sentences, in the server's order", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    render(<RehearsalDebrief {...props} speaking={speaking} />);
    expect(await screen.findByRole("heading", { name: "How you spoke" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").slice(0, 3);
    expect(items[0]).toHaveTextContent(
      "You answered in full sentences 7 of 9 times, up from 4 last time.",
    );
    expect(items[1]).toHaveTextContent("You used 3 of your 8 key phrases, down from 4 last time.");
    expect(items[2]).toHaveTextContent("You switched to English twice.");
  });
  it("draws up, down and no arrow from count against previous, hidden from assistive technology", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const { container } = render(<RehearsalDebrief {...props} speaking={speaking} />);
    await screen.findByRole("heading", { name: "How you spoke" });
    const arrows = [...container.querySelectorAll("[data-trend]")];
    expect(arrows.map((a) => a.getAttribute("data-trend"))).toEqual(["up", "down", "first"]);
    for (const a of arrows) expect(a).toHaveAttribute("aria-hidden", "true");
  });
  it("is neutral: no red, no percentage, no score", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    const { container } = render(<RehearsalDebrief {...props} speaking={speaking} />);
    await screen.findByRole("heading", { name: "How you spoke" });
    const card = container.querySelector("#how-you-spoke")!.parentElement!;
    expect(card.innerHTML).not.toMatch(/ds-(heart|wrong|error|danger|red)/i);
    expect(card.textContent).not.toMatch(/%|score|grade/i);
  });
  it("is hidden when the server sent none", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: withRun });
    render(<RehearsalDebrief {...props} />);
    await screen.findByText("That was a full interview");
    expect(screen.queryByText("How you spoke")).toBeNull();
  });
});
