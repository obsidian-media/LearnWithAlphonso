// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fallbackBrief } from "@/lib/rehearsal-brief";

const api = vi.hoisted(() => ({
  fetchRehearsals: vi.fn(),
  createRehearsal: vi.fn(),
  deleteRehearsal: vi.fn(),
}));
vi.mock("@/lib/rehearsal-api", () => api);
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

const { RehearsePage } = await import("./RehearsePage");

const ID = "00000000-0000-4000-8000-0000000000d1";
const active = {
  id: ID,
  course: "en",
  eventKind: "interview",
  eventDate: "2026-12-04",
  counterpart: "a hiring manager",
  worries: null,
  brief: fallbackBrief("interview", "en"),
  status: "active",
  free: true,
  outcome: null,
  createdAt: "2026-11-26T10:00:00Z",
  closedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RehearsePage", () => {
  it("with REHEARSALS_ENABLED off (the API says not_enabled) shows 'not available', never the form", async () => {
    api.fetchRehearsals.mockResolvedValue({ ok: false, error: "not_enabled" });
    render(<RehearsePage course="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Rehearsals are not available yet.");
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare my rehearsal" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/learn");
  });

  it("with no rehearsal shows the intake for the learner's course", async () => {
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { active: null, history: [], freeAvailable: true },
    });
    render(<RehearsePage course="es" />);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
    expect(api.fetchRehearsals).toHaveBeenCalledWith("es");
  });

  it("with an active rehearsal shows the event, the date and the three stages with a link each", async () => {
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { active, history: [], freeAvailable: false },
    });
    render(<RehearsePage course="en" />);
    expect(await screen.findByRole("heading", { name: "Job interview" })).toBeInTheDocument();
    expect(screen.getByText(/December 4|4 December/)).toBeInTheDocument();
    for (const [label, stage] of [
      ["Warm-up", "warmup"],
      ["The real conversation", "conversation"],
      ["The hard moments", "hard_moments"],
    ]) {
      expect(screen.getByRole("link", { name: `Start ${label}` })).toHaveAttribute(
        "href",
        `/rehearse/${ID}/${stage}`,
      );
    }
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("deleting asks first, then removes the rehearsal and shows the intake again", async () => {
    api.fetchRehearsals
      .mockResolvedValueOnce({ ok: true, value: { active, history: [], freeAvailable: false } })
      .mockResolvedValueOnce({
        ok: true,
        value: { active: null, history: [], freeAvailable: false },
      });
    api.deleteRehearsal.mockResolvedValue({ ok: true, value: { ok: true } });
    const user = userEvent.setup();
    render(<RehearsePage course="en" />);
    await user.click(await screen.findByRole("button", { name: "Delete this rehearsal" }));
    expect(api.deleteRehearsal).not.toHaveBeenCalled(); // one tap is not enough
    await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(api.deleteRehearsal).toHaveBeenCalledWith(ID);
    expect(await screen.findByRole("form", { name: "Plan a rehearsal" })).toBeInTheDocument();
  });

  it("a failed load says so and offers a retry", async () => {
    api.fetchRehearsals.mockResolvedValueOnce({ ok: false, error: "failed" });
    api.fetchRehearsals.mockResolvedValueOnce({
      ok: true,
      value: { active: null, history: [], freeAvailable: true },
    });
    const user = userEvent.setup();
    render(<RehearsePage course="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("form")).toBeInTheDocument());
  });
});
