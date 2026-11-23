// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const memory = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("../../lib/call-recap-api", () => ({
  fetchTutorMemory: vi.fn(async () => memory.result),
}));

const { HectorPanel } = await import("./HectorPanel");
const { useProgress } = await import("../../lib/progress");

const chips = [
  { id: "coffee", label: "Roleplay: ordering coffee", message: "Let's roleplay.", icon: "coffee" },
  { id: "chat", label: "Just chat", message: "Let's just chat.", icon: "chat" },
] as const;

function panel(onPick = vi.fn(), disabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HectorPanel course="en" chips={chips} disabled={disabled} onPick={onPick} />
    </QueryClientProvider>,
  );
  return onPick;
}

beforeEach(() => {
  useProgress.getState().reset();
  useProgress.setState({ cefrLevel: "A2" });
});

describe("HectorPanel", () => {
  it("shows the scenario starters the page generated, and sends one when picked", () => {
    memory.result = { status: "not-pro" };
    const onPick = panel();
    const card = screen.getByLabelText("Scenario");
    expect(card).toHaveTextContent("English");
    expect(card).toHaveTextContent("Level A2");
    fireEvent.click(within(card).getByRole("button", { name: "Roleplay: ordering coffee" }));
    expect(onPick).toHaveBeenCalledWith(chips[0]);
  });

  it("disables the starters while Hector is busy", () => {
    memory.result = { status: "not-pro" };
    panel(vi.fn(), true);
    expect(screen.getByRole("button", { name: "Just chat" })).toBeDisabled();
  });

  it("lists what Hector remembers, from the real notes, for this course only", async () => {
    memory.result = {
      status: "ok",
      data: {
        goals: { goal: "travel", dailyMinutes: 10, interests: ["food"] },
        mistakes: [
          {
            id: "m1",
            course: "en",
            topic: "past",
            label: "past simple",
            example: "",
            seenCount: 2,
            lastSeenAt: "",
          },
          {
            id: "m2",
            course: "fr",
            topic: "x",
            label: "le passe",
            example: "",
            seenCount: 1,
            lastSeenAt: "",
          },
        ],
        phrases: [
          { id: "p1", course: "en", text: "a table for two", meaning: "" },
          { id: "p2", course: "es", text: "la cuenta", meaning: "" },
        ],
      },
    };
    panel();
    const card = await screen.findByLabelText("What Hector remembers");
    expect(await within(card).findByText("Practising: past simple")).toBeInTheDocument();
    expect(within(card).getByText("10 minutes a day")).toBeInTheDocument();
    expect(within(card).getByText("a table for two")).toBeInTheDocument();
    expect(within(card).queryByText("la cuenta")).toBeNull();
    expect(within(card).queryByText(/le passe/)).toBeNull();
    expect(within(card).getByRole("link", { name: "Manage" })).toHaveAttribute(
      "href",
      "/profile/memory",
    );
  });

  it("is honest when there is nothing yet, and when the notes are a Pro feature", async () => {
    memory.result = {
      status: "ok",
      data: { goals: { goal: null, dailyMinutes: null, interests: [] }, mistakes: [], phrases: [] },
    };
    panel();
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("says so when the notes are Pro only", async () => {
    memory.result = { status: "not-pro" };
    panel();
    expect(
      await screen.findByText(/Hector keeps notes between calls with Pro/),
    ).toBeInTheDocument();
  });
});
