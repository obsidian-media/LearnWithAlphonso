// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ createRehearsal: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => api);

const { RehearsalIntakeForm } = await import("./RehearsalIntakeForm");

const submit = () => screen.getByRole("button", { name: "Prepare my rehearsal" });

beforeEach(() => {
  api.createRehearsal.mockReset();
});

describe("RehearsalIntakeForm", () => {
  it("asks the four questions and says no real names are needed", () => {
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    expect(screen.getByText("What's coming up?")).toBeInTheDocument();
    expect(screen.getByLabelText("When?")).toBeInTheDocument();
    expect(screen.getByLabelText("Who will you be talking to?")).toBeInTheDocument();
    expect(screen.getByLabelText(/What worries you most/)).toBeInTheDocument();
    expect(screen.getByText(/No need for real names/)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
  });

  it("cannot be submitted until a kind and a counterpart are given", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText("Who will you be talking to?"), "   ");
    expect(submit()).toBeDisabled(); // blanks are not an answer
    await user.type(screen.getByLabelText("Who will you be talking to?"), "a hiring manager");
    expect(submit()).toBeEnabled();
  });

  it("limits both text answers to 200 characters", async () => {
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    const counterpart = screen.getByLabelText("Who will you be talking to?");
    const worries = screen.getByLabelText(/What worries you most/);
    expect(counterpart).toHaveAttribute("maxlength", "200");
    expect(worries).toHaveAttribute("maxlength", "200");
    await user.click(counterpart);
    await user.paste("x".repeat(260));
    expect((counterpart as HTMLInputElement).value).toHaveLength(200);
    expect(screen.getByText(/200\/200/)).toBeInTheDocument();
  });

  it("sends the intake: the kind, the date, the trimmed words, and the course", async () => {
    api.createRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: { id: "r1" } } });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="fr" onCreated={onCreated} />);
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    await user.type(screen.getByLabelText("When?"), "2026-12-04");
    await user.type(screen.getByLabelText("Who will you be talking to?"), "  a hiring manager ");
    await user.type(screen.getByLabelText(/What worries you most/), "the salary question");
    await user.click(submit());
    expect(api.createRehearsal).toHaveBeenCalledWith({
      course: "fr",
      eventKind: "interview",
      eventDate: "2026-12-04",
      counterpart: "a hiring manager",
      worries: "the salary question",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "r1" }));
  });

  it("'Not sure yet' sends no date, and an empty worries field sends none", async () => {
    api.createRehearsal.mockResolvedValue({ ok: true, value: { rehearsal: { id: "r1" } } });
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Work meeting" }));
    await user.type(screen.getByLabelText("When?"), "2026-12-04");
    await user.click(screen.getByLabelText("Not sure yet"));
    expect(screen.getByLabelText("When?")).toBeDisabled();
    await user.type(screen.getByLabelText("Who will you be talking to?"), "my team");
    await user.click(submit());
    expect(api.createRehearsal).toHaveBeenCalledWith(
      expect.objectContaining({ eventDate: null, worries: null, eventKind: "meeting" }),
    );
  });

  it.each([
    ["paywall", /used your free rehearsal/],
    ["retry", /try again in a moment/],
    ["blocked_text", /can't be used here/],
  ])("shows what a '%s' refusal means and does not call it created", async (error, text) => {
    api.createRehearsal.mockResolvedValue({ ok: false, error });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalIntakeForm course="en" onCreated={onCreated} />);
    await user.click(screen.getByRole("radio", { name: "Job interview" }));
    await user.type(screen.getByLabelText("Who will you be talking to?"), "a manager");
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(onCreated).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled(); // the learner can fix and resend
  });
});
