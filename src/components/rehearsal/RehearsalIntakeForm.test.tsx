// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ createRehearsal: vi.fn(), adjustRehearsal: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => api);

const { RehearsalIntakeForm } = await import("./RehearsalIntakeForm");

const next = () => screen.getByRole("button", { name: "Next" });

beforeEach(() => {
  api.createRehearsal.mockReset();
  api.adjustRehearsal.mockReset();
});

/** Walks to step 3 with an interview picked and a date or "not sure". */
async function toStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Job interview" }));
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Not sure yet" }));
  await user.click(next());
}

describe("RehearsalIntakeForm (stepped, four screens)", () => {
  it("starts on step 1 with a progress bar and the seven kinds", () => {
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
    expect(screen.getByText("What is coming up?")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(next()).toBeDisabled();
  });

  it("each step needs its answer before Next: a kind, then a date or 'Not sure yet', then who", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    expect(next()).toBeEnabled();
    await user.click(next());
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(next()).toBeDisabled(); // no date and not "not sure" yet
    await user.click(screen.getByRole("button", { name: "Not sure yet" }));
    expect(next()).toBeEnabled();
    await user.click(next());
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    expect(next()).toBeDisabled();
    await user.type(screen.getByLabelText("Who will you be talking to?"), "   ");
    expect(next()).toBeDisabled(); // blanks are not an answer
    await user.type(screen.getByLabelText("Who will you be talking to?"), "a hiring manager");
    expect(next()).toBeEnabled();
  });

  it("puts the 'No need for real names' line on the step where names might be typed", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    expect(screen.queryByText(/No need for real names/)).not.toBeInTheDocument();
    await toStep3(user);
    expect(screen.getByText(/No need for real names/)).toBeInTheDocument();
  });

  it("limits both text answers to 200 characters", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await toStep3(user);
    const counterpart = screen.getByLabelText("Who will you be talking to?");
    expect(counterpart).toHaveAttribute("maxlength", "200");
    await user.click(counterpart);
    await user.paste("x".repeat(260));
    expect((counterpart as HTMLInputElement).value).toHaveLength(200);
    await user.click(next());
    expect(screen.getByLabelText(/What worries you most/)).toHaveAttribute("maxlength", "200");
  });

  it("sends the whole intake from step 4: kind, picked date, trimmed words, course", async () => {
    api.createRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: { id: "r1" } } });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="fr" onCreated={onCreated} today="2026-11-26" />);
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Tuesday 1 December" }));
    await user.click(next());
    await user.type(screen.getByLabelText("Who will you be talking to?"), "  a hiring manager ");
    await user.click(next());
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/What worries you most/), "the salary question");
    await user.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(api.createRehearsal).toHaveBeenCalledWith({
      course: "fr",
      eventKind: "interview",
      eventDate: "2026-12-01",
      counterpart: "a hiring manager",
      worries: "the salary question",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "r1" }));
  });

  it("step 4 is skippable: Skip sends no worries, and 'Not sure yet' sends no date", async () => {
    api.createRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: { id: "r1" } } });
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await toStep3(user);
    await user.type(screen.getByLabelText("Who will you be talking to?"), "my team");
    await user.click(next());
    await user.type(screen.getByLabelText(/What worries you most/), "something typed then skipped");
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(api.createRehearsal).toHaveBeenCalledWith(
      expect.objectContaining({ eventDate: null, worries: null, eventKind: "interview" }),
    );
  });

  it("the Skip tap target is at least 44px (min-h-11)", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await toStep3(user);
    await user.type(screen.getByLabelText("Who will you be talking to?"), "x");
    await user.click(next());
    expect(screen.getByRole("button", { name: "Skip" }).className).toMatch(/min-h-11/);
  });

  it("days before today cannot be picked", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} today="2026-11-26" />);
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    await user.click(next());
    expect(screen.getByRole("button", { name: "Wednesday 25 November" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thursday 26 November" })).toBeEnabled();
  });

  it("Back keeps the answers", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await toStep3(user);
    await user.type(screen.getByLabelText("Who will you be talking to?"), "my manager");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    await user.click(next());
    expect(screen.getByLabelText("Who will you be talking to?")).toHaveValue("my manager");
  });

  it.each([
    ["paywall", /used your free rehearsal/],
    ["retry", /try again in a moment/],
    ["blocked_text", /can't be used here/],
  ])("shows what a '%s' refusal means and does not call it created", async (error, text) => {
    api.createRehearsal.mockResolvedValue({ ok: false, error });
    const onCreated = vi.fn();
    const onPaywall = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={onCreated} onPaywall={onPaywall} />);
    await toStep3(user);
    await user.type(screen.getByLabelText("Who will you be talking to?"), "a manager");
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onPaywall).toHaveBeenCalledTimes(error === "paywall" ? 1 : 0);
  });

  it("adjusting prefills the answers and sends an adjust, not a create", async () => {
    api.adjustRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: { id: "r1" } } });
    const user = userEvent.setup();
    render(
      <RehearsalIntakeForm
        course="en"
        existing={
          {
            id: "r1",
            eventKind: "meeting",
            eventDate: "2026-12-04",
            counterpart: "my team",
            worries: "speed",
          } as never
        }
        onCreated={vi.fn()}
        today="2026-11-26"
      />,
    );
    expect(screen.getByRole("radio", { name: "Work meeting" })).toBeChecked();
    await user.click(next());
    expect(screen.getByRole("button", { name: "Friday 4 December" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(next());
    expect(screen.getByLabelText("Who will you be talking to?")).toHaveValue("my team");
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(api.adjustRehearsal).toHaveBeenCalledWith("r1", {
      course: "en",
      eventKind: "meeting",
      eventDate: "2026-12-04",
      counterpart: "my team",
      worries: "speed",
    });
    expect(api.createRehearsal).not.toHaveBeenCalled();
  });
});
