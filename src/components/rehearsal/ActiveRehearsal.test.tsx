// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";

const api = vi.hoisted(() => ({ deleteRehearsal: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => api);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a href={`${String(to)}|${JSON.stringify(params)}`} {...(rest as object)}>
      {children as never}
    </a>
  ),
}));

const { ActiveRehearsal } = await import("./ActiveRehearsal");

const rehearsal = fixture.state.active as never;
const props = {
  rehearsal,
  progress: fixture.state.progress as never,
  nextStage: "conversation" as const,
  today: "2026-11-26",
  onDeleted: vi.fn(),
  onAdjust: vi.fn(),
};

beforeEach(() => {
  api.deleteRehearsal.mockReset();
  props.onDeleted.mockReset();
  props.onAdjust.mockReset();
});

describe("ActiveRehearsal (the plan screen)", () => {
  it("shows the event, the date, the days to go and who it is with", () => {
    render(<ActiveRehearsal {...props} />);
    expect(screen.getByRole("heading", { name: "Job interview" })).toBeInTheDocument();
    expect(screen.getByText(/Tue 1 Dec/)).toBeInTheDocument();
    expect(screen.getByText(/5 days to go/)).toBeInTheDocument();
    expect(screen.getByText(/a hiring manager at a logistics company/)).toBeInTheDocument();
  });

  it("marks a done stage as done and repeatable, and the others with their minutes", () => {
    render(<ActiveRehearsal {...props} />);
    expect(screen.getByText(/Done · you can repeat it/)).toBeInTheDocument();
    expect(screen.getByText(/about 10 min/)).toBeInTheDocument();
    expect(screen.getByText(/about 8 min/)).toBeInTheDocument();
  });

  it("has ONE primary button: Next, for the server's next stage, and it asks who to practise with", async () => {
    const user = userEvent.setup();
    render(<ActiveRehearsal {...props} />);
    await user.click(screen.getByRole("button", { name: "Next: The real conversation" }));
    const alphonso = screen.getByRole("link", { name: "Start with Alphonso" });
    expect(alphonso.getAttribute("href")).toContain("/rehearse/$id/$stage");
    expect(alphonso.getAttribute("href")).toContain('"stage":"conversation"');
  });

  it("every stage can still be started or repeated", () => {
    render(<ActiveRehearsal {...props} />);
    expect(screen.getByRole("button", { name: "Repeat Warm-up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start The hard moments" })).toBeInTheDocument();
  });

  it("shows Hard mode done on the last stage only when it is done", () => {
    const { rerender } = render(<ActiveRehearsal {...props} />);
    expect(screen.queryByText("Hard mode done")).not.toBeInTheDocument();
    rerender(<ActiveRehearsal {...props} hardModeDone />);
    expect(screen.getByText("Hard mode done")).toBeInTheDocument();
  });

  it("says the tutor is an AI and that there is no readiness score, and shows no score", () => {
    render(<ActiveRehearsal {...props} />);
    expect(screen.getByText(/Alphonso is an AI/)).toBeInTheDocument();
    expect(screen.getByText(/There is no readiness score/)).toBeInTheDocument();
    expect(screen.queryByText(/stars?\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s?%/)).not.toBeInTheDocument();
  });

  it("with no date says so, and offers Adjust", async () => {
    const user = userEvent.setup();
    render(
      <ActiveRehearsal
        {...props}
        rehearsal={{ ...(rehearsal as object), eventDate: null } as never}
      />,
    );
    expect(screen.getByText(/Date not set yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adjust" }));
    expect(props.onAdjust).toHaveBeenCalledTimes(1);
  });

  it("deleting asks first, then deletes only after Yes", async () => {
    api.deleteRehearsal.mockResolvedValue({ ok: true, value: { ok: true } });
    const user = userEvent.setup();
    render(<ActiveRehearsal {...props} />);
    await user.click(screen.getByRole("button", { name: "Delete this rehearsal" }));
    expect(api.deleteRehearsal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(api.deleteRehearsal).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled());
  });

  it("a failed delete says so and keeps the rehearsal", async () => {
    api.deleteRehearsal.mockResolvedValue({ ok: false, error: "failed" });
    const user = userEvent.setup();
    render(<ActiveRehearsal {...props} />);
    await user.click(screen.getByRole("button", { name: "Delete this rehearsal" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not delete/);
    expect(props.onDeleted).not.toHaveBeenCalled();
  });
});
