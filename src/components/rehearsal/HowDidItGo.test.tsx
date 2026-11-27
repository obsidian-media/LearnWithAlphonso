// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";

const api = vi.hoisted(() => ({ rehearsalOutcome: vi.fn(), cancelRehearsal: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => api);

const { HowDidItGo } = await import("./HowDidItGo");

const rehearsal = fixture.state.active as never;
const onDone = vi.fn();

beforeEach(() => {
  api.rehearsalOutcome.mockReset();
  api.cancelRehearsal.mockReset();
  api.rehearsalOutcome.mockResolvedValue({ ok: true, value: { rehearsal: {} } });
  onDone.mockReset();
});

describe("HowDidItGo (four taps, no words)", () => {
  it("names the event and the day, and says the tutor is an AI that remembers", () => {
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    expect(screen.getByRole("heading", { name: "How did it go?" })).toBeInTheDocument();
    expect(screen.getByText(/Wednesday 2 December · Job interview/)).toBeInTheDocument();
    expect(screen.getByText(/Alphonso \(AI\) will remember it/)).toBeInTheDocument();
    expect(screen.getByText(/No words are stored/)).toBeInTheDocument();
  });

  it("has four taps and no text field", () => {
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each([
    ["Went well", "well"],
    ["OK", "ok"],
    ["It was hard", "hard"],
  ])("'%s' sends the choice '%s' and finishes", async (label, choice) => {
    const user = userEvent.setup();
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    await user.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
    expect(api.rehearsalOutcome).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      choice,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("says what 'It was hard' leads to", () => {
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    expect(screen.getByText("Alphonso can help you practise those parts")).toBeInTheDocument();
  });

  it("the moved-date line names the plan's actual next stage, not a fixed one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <HowDidItGo
        rehearsal={rehearsal}
        nextStage="hard_moments"
        onDone={onDone}
        today="2026-12-02"
      />,
    );
    await user.click(screen.getByRole("button", { name: /It didn.t happen/ }));
    expect(screen.getByText(/The hard moments comes back before the new date/)).toBeInTheDocument();
    expect(screen.queryByText(/Stage 2/)).toBeNull();
    unmount();
    render(
      <HowDidItGo rehearsal={rehearsal} nextStage="warmup" onDone={onDone} today="2026-12-02" />,
    );
    await user.click(screen.getByRole("button", { name: /It didn.t happen/ }));
    expect(screen.getByText(/Warm-up comes back before the new date/)).toBeInTheDocument();
  });

  it("'moved' opens the date picker and sends the new date, keeping the rehearsal going", async () => {
    const user = userEvent.setup();
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    await user.click(screen.getByRole("button", { name: /It didn.t happen/ }));
    expect(screen.getByText("When is it now?")).toBeInTheDocument();
    expect(api.rehearsalOutcome).not.toHaveBeenCalled();
    // Days up to and including today cannot be picked: it has to be a future day.
    expect(screen.getByRole("button", { name: "Wednesday 2 December" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Friday 4 December" }));
    await user.click(screen.getByRole("button", { name: "Move my rehearsal to Fri 4 Dec" }));
    expect(api.rehearsalOutcome).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "moved",
      "2026-12-04",
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("from the date picker, 'close the rehearsal' cancels it and records no outcome", async () => {
    // The server closes with an outcome only on well, ok or hard. "It didn't happen" is a cancel: the app must not
    // invent an outcome the learner did not give.
    api.cancelRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: {} } });
    const user = userEvent.setup();
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    await user.click(screen.getByRole("button", { name: /It didn.t happen/ }));
    await user.click(screen.getByRole("button", { name: "It didn't happen, close the rehearsal" }));
    expect(api.cancelRehearsal).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(api.rehearsalOutcome).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("a refused tap says so and stays on the screen", async () => {
    api.rehearsalOutcome.mockResolvedValue({ ok: false, error: "failed" });
    const user = userEvent.setup();
    render(<HowDidItGo rehearsal={rehearsal} onDone={onDone} today="2026-12-02" />);
    await user.click(screen.getByRole("button", { name: /^Went well/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(onDone).not.toHaveBeenCalled();
  });
});
