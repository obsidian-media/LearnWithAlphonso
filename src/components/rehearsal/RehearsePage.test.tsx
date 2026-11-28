// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";

const api = vi.hoisted(() => ({
  fetchRehearsals: vi.fn(),
  fetchPresets: vi.fn(),
  createRehearsalFromPreset: vi.fn(),
  createRehearsal: vi.fn(),
  adjustRehearsal: vi.fn(),
  deleteRehearsal: vi.fn(),
  rehearsalOutcome: vi.fn(),
  cancelRehearsal: vi.fn(),
}));
const proState = vi.hoisted(() => ({ state: "free" as string }));
vi.mock("@/lib/rehearsal-api", () => api);
vi.mock("@/lib/use-pro-status", () => ({ useProStatus: () => ({ state: proState.state }) }));
vi.mock("../WebPaywall", () => ({ WebPaywallSheet: () => <div role="dialog" aria-label="Pro" /> }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
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
  };
});

import { presetSummaries } from "@/lib/rehearsal-presets";

const { RehearsePage } = await import("./RehearsePage");

const ID = "11111111-1111-4111-8111-111111111111";
const state = fixture.state;
const empty = fixture.stateEmpty;

beforeEach(() => {
  vi.clearAllMocks();
  proState.state = "free";
  api.fetchPresets.mockResolvedValue({ ok: true, value: [] });
});

describe("RehearsePage", () => {
  it("with REHEARSALS_ENABLED off (the API says not_enabled) shows 'not available', never the form", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: false, error: "not_enabled" });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Rehearsals are not available yet.");
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/learn");
  });

  it("with no rehearsal and the free one still there shows the intake for the learner's course", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: empty });
    render(<RehearsePage course="es" today="2026-11-26" />);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
    expect(api.fetchRehearsals).toHaveBeenCalledWith("es");
  });

  it("with an active rehearsal shows the plan: done and next stages, a link to each", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("heading", { name: "Job interview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next: The real conversation" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/conversation`,
    );
    expect(screen.getByRole("link", { name: "Repeat Warm-up" })).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("Adjust opens the four questions again, filled in", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    const user = userEvent.setup();
    render(<RehearsePage course="en" today="2026-11-26" />);
    await user.click(await screen.findByRole("button", { name: "Adjust" }));
    expect(screen.getByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Job interview" })).toBeChecked();
  });

  it("the day after the event shows 'How did it go?' instead of the plan", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    render(<RehearsePage course="en" today="2026-12-02" />);
    expect(await screen.findByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Next:/ })).toBeNull();
  });

  it("on the event day itself it is still the plan", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    render(<RehearsePage course="en" today="2026-12-01" />);
    expect(await screen.findByRole("heading", { name: "Job interview" })).toBeInTheDocument();
  });

  it("answering 'How did it go?' reloads the state", async () => {
    api.fetchRehearsals
      .mockResolvedValueOnce({ ok: true, value: state })
      .mockResolvedValueOnce({ ok: true, value: { ...empty, freeAvailable: false } });
    api.rehearsalOutcome.mockResolvedValue({ ok: true, value: { rehearsal: {} } });
    const user = userEvent.setup();
    render(<RehearsePage course="en" today="2026-12-02" />);
    await user.click(await screen.findByRole("button", { name: /^Went well/ }));
    await waitFor(() => expect(api.fetchRehearsals).toHaveBeenCalledTimes(2));
  });

  it("deleting asks first, then removes the rehearsal and shows the intake again (free one unused)", async () => {
    api.fetchRehearsals
      .mockResolvedValueOnce({ ok: true, value: state })
      .mockResolvedValueOnce({ ok: true, value: empty });
    api.deleteRehearsal.mockResolvedValue({ ok: true, value: { ok: true } });
    const user = userEvent.setup();
    render(<RehearsePage course="en" today="2026-11-26" />);
    await user.click(await screen.findByRole("button", { name: "Delete this rehearsal" }));
    expect(api.deleteRehearsal).not.toHaveBeenCalled(); // one tap is not enough
    await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(api.deleteRehearsal).toHaveBeenCalledWith(ID);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });

  it("a non-Pro learner who used the free rehearsal sees their finished ones and the Pro sheet, never the intake", async () => {
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { ...empty, freeAvailable: false, history: state.history },
    });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(
      await screen.findByRole("dialog", { name: "Rehearsals are part of Pro" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 stages/)).toBeInTheDocument(); // the history stays readable
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("a Pro learner whose free rehearsal is used gets the intake", async () => {
    proState.state = "pro";
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: { ...empty, freeAvailable: false } });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });

  it("when Pro cannot be checked it says to try again and shows neither the intake nor the sheet", async () => {
    proState.state = "error";
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: { ...empty, freeAvailable: false } });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again in a moment/);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a failed load says so and offers a retry", async () => {
    api.fetchRehearsals.mockResolvedValueOnce({ ok: false, error: "failed" });
    api.fetchRehearsals.mockResolvedValueOnce({ ok: true, value: empty });
    const user = userEvent.setup();
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("form")).toBeInTheDocument());
  });
});

describe("RehearsePage quick-starts", () => {
  const presets = presetSummaries("en");
  const created = { ...state.active, id: ID };
  const open = async () => {
    api.fetchPresets.mockResolvedValue({ ok: true, value: presets });
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: empty });
    const user = userEvent.setup();
    render(<RehearsePage course="en" today="2026-11-26" />);
    await screen.findByRole("region", { name: "Choose a rehearsal" });
    return user;
  };

  it("shows the eight presets first, and 'Something else' for the four questions", async () => {
    const user = await open();
    for (const p of presets) expect(screen.getByRole("button", { name: p.title })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("form")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Something else/ }));
    expect(screen.getByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });

  it("a preset opens a preview with the three stages, an optional date, Start now and Personalise", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Doctor's appointment" }));
    expect(screen.getByRole("list", { name: "The three stages" }).children).toHaveLength(3);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Personalise" })).toBeEnabled();
    expect(api.createRehearsalFromPreset).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("region", { name: "Choose a rehearsal" })).toBeInTheDocument();
  });

  it("Start now creates from the preset with no date and reloads the plan", async () => {
    const user = await open();
    api.createRehearsalFromPreset.mockResolvedValue({ ok: true, value: { rehearsal: created } });
    await user.click(screen.getByRole("button", { name: "Job interview" }));
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    await user.click(screen.getByRole("button", { name: "Start now" }));
    expect(api.createRehearsalFromPreset).toHaveBeenCalledWith("en", "job_interview", null);
    expect(await screen.findByText(/3 stages|Warm-up/)).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("Personalise creates, then opens the same four questions as Adjust", async () => {
    const user = await open();
    api.createRehearsalFromPreset.mockResolvedValue({ ok: true, value: { rehearsal: created } });
    await user.click(screen.getByRole("button", { name: "Job interview" }));
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: state });
    await user.click(screen.getByRole("button", { name: "Personalise" }));
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });

  it("a refused create (one already active) says so and stays on the preview", async () => {
    const user = await open();
    api.createRehearsalFromPreset.mockResolvedValue({ ok: false, error: "active_exists" });
    await user.click(screen.getByRole("button", { name: "Job interview" }));
    await user.click(screen.getByRole("button", { name: "Start now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have a rehearsal/);
    expect(screen.getByRole("button", { name: "Start now" })).toBeEnabled();
  });

  it("with no presets offered (an older server) the four questions come straight away", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: empty });
    render(<RehearsePage course="en" today="2026-11-26" />);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });
});
