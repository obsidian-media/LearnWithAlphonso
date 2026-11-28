// @vitest-environment jsdom
import { __resetVoicePlaybackForTests } from "@/lib/voice-playback";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOpenerSpeechCache } from "@/lib/opener-speech-cache";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { fallbackBrief } from "@/lib/rehearsal-brief";
import { REHEARSAL_OPENERS } from "@/data/rehearsal-templates";

const ID = "00000000-0000-4000-8000-0000000000d1";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));
vi.mock("@/components/HectorInvite", () => ({ HectorInvite: () => null }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track }));
const rehearsalApi = vi.hoisted(() => ({ fetchRehearsals: vi.fn() }));
vi.mock("@/lib/rehearsal-api", () => rehearsalApi);

const { Route } = await import("./rehearse_.$id.$stage");
const { useProgress } = await import("../../lib/progress");

const params: { current: { id: string; stage: string } } = {
  current: { id: ID, stage: "conversation" },
};
// @ts-expect-error -- no RouterProvider here; the same override the Practice call's own test uses.
Route.useParams = () => params.current;
const search: { current: Record<string, unknown> } = { current: {} };
// @ts-expect-error -- same as useParams above.
Route.useSearch = () => search.current;

const active = {
  id: ID,
  course: "en",
  eventKind: "interview",
  eventDate: null,
  counterpart: "a hiring manager",
  worries: null,
  brief: fallbackBrief("interview", "en"),
  status: "active",
  free: true,
  outcome: null,
  createdAt: "2026-11-26T10:00:00Z",
  closedAt: null,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const chatCalls = () =>
  (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
    String(u).includes("/api/chat"),
  );

async function renderPage() {
  const Page = Route.options.component!;
  render(withAiConsent(<Page />, fakeConsentApi()));
  return screen.findByRole("log");
}

beforeEach(() => {
  clearOpenerSpeechCache();
  __resetVoicePlaybackForTests();
  useProgress.setState({ course: "en" });
  localStorage.setItem("showAlphonsoWhilePractising", "false");
  Element.prototype.scrollTo = vi.fn();
  navigate.mockReset();
  track.mockReset();
  params.current = { id: ID, stage: "conversation" };
  search.current = {};
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "B1" });
  rehearsalApi.fetchRehearsals.mockReset();
  rehearsalApi.fetchRehearsals.mockResolvedValue({
    ok: true,
    value: { active, history: [], freeAvailable: false },
  });
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();
    },
  );
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/tts"))
      return new Response(new Blob(["audio"]), { status: 200 });
    return jsonResponse({ content: "Please, take a seat.", verdict: "none" });
  }) as typeof fetch;
});

describe("a rehearsal stage as a call", () => {
  it("shows the event and the stage, and the stage's own fixed opening line", async () => {
    const log = await renderPage();
    expect(
      screen.getByRole("heading", { name: "Job interview: The real conversation" }),
    ).toBeVisible();
    expect(log).toHaveTextContent(REHEARSAL_OPENERS.en.conversation);
    expect(rehearsalApi.fetchRehearsals).toHaveBeenCalledWith("en");
  });

  it("sends the rehearsal id and stage, never prompt text, and not its own opening line", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(
      screen.getByPlaceholderText("Type or tap the mic"),
      "Good morning, thank you for seeing me{Enter}",
    );
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    const [, init] = chatCalls()[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.rehearsal).toEqual({ id: ID, stage: "conversation" });
    expect(body).not.toHaveProperty("systemPrompt");
    expect(body).not.toHaveProperty("course");
    expect(body.cefrLevel).toBe("B1");
    expect(body.callId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.messages).toEqual([
      { role: "user", content: "Good morning, thank you for seeing me" },
    ]);
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Please, take a seat."));
  });

  it("each stage is its own conversation: the warm-up names its stage", async () => {
    params.current = { id: ID, stage: "warmup" };
    const user = userEvent.setup();
    const log = await renderPage();
    expect(log).toHaveTextContent(REHEARSAL_OPENERS.en.warmup);
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "Hello{Enter}");
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    expect(JSON.parse(chatCalls()[0]![1].body as string).rehearsal).toEqual({
      id: ID,
      stage: "warmup",
    });
  });

  it("the free rehearsal's last run (402) says so, and is not an 'AI credits' message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat"))
        return jsonResponse({ error: "free_runs_used" }, 402);
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/free rehearsal/i);
    expect(alert).not.toHaveTextContent(/AI credits/);
  });

  it("a rehearsal that is not the learner's active one is 'not found', and no chat is possible", async () => {
    params.current = { id: "00000000-0000-4000-8000-0000000000d9", stage: "conversation" };
    const Page = Route.options.component!;
    render(withAiConsent(<Page />, fakeConsentApi()));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that rehearsal.");
    expect(screen.queryByRole("log")).toBeNull();
    expect(chatCalls()).toHaveLength(0);
  });

  it("while Rehearsals are switched off the call page says so instead of starting a call", async () => {
    rehearsalApi.fetchRehearsals.mockResolvedValue({ ok: false, error: "not_enabled" });
    const Page = Route.options.component!;
    render(withAiConsent(<Page />, fakeConsentApi()));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rehearsals are not available yet.");
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("the call screen's header is the event, with Alphonso, the stage and a three-segment bar", async () => {
    localStorage.setItem("showAlphonsoWhilePractising", "true");
    await renderPage();
    expect(screen.getByText("Job interview rehearsal")).toBeInTheDocument();
    expect(screen.getByText("Alphonso · Stage 2 of 3: The real conversation")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Rehearsal stage" })).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
  });

  it("finishing a run shows the rehearsal debrief with the stage header, never a stars result", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "Good morning{Enter}");
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Please, take a seat."));
    rehearsalApi.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: {
        active,
        progress: { warmup: "todo", conversation: "done", hard_moments: "todo" },
        nextStage: "hard_moments",
        runs: [
          {
            stage: "conversation",
            finishedAt: "2026-11-27T10:00:00Z",
            momentsShown: [],
            wentWell: ["You greeted them well"],
            corrections: [],
          },
        ],
        history: [],
        freeAvailable: false,
      },
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/practice"))
        return jsonResponse({
          stars: 2,
          replies: 1,
          rightReplies: 1,
          shortReplies: 0,
          englishReplies: 0,
          bestBefore: 0,
          bestAfter: 2,
        });
      return jsonResponse({ recap: null });
    }) as typeof fetch;
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByText("You greeted them well")).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is a score/)).toBeInTheDocument();
    expect(document.querySelector("[data-practice-result]")).toBeNull();
    expect(screen.getByRole("button", { name: "Next: The hard moments" })).toBeInTheDocument();
  });

  it("sends no Practice telemetry for a rehearsal call", async () => {
    await renderPage();
    expect(track).not.toHaveBeenCalledWith("practice_call_started", expect.anything());
  });
});

describe("a Hector rehearsal stage (Pro)", () => {
  const ttsBodies = () =>
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u]) => String(u).includes("/api/tts"))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
  const sendHi = async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "Good morning{Enter}");
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
  };

  it("sends persona hector with the rehearsal, and speaks the reply in Hector's voice", async () => {
    search.current = { persona: "hector" };
    await sendHi();
    expect(JSON.parse(chatCalls()[0]![1].body as string).rehearsal).toEqual({
      id: ID,
      stage: "conversation",
      persona: "hector",
    });
    await waitFor(() => expect(ttsBodies().some((b) => b.character === "hector")).toBe(true));
  });

  it("hard mode is sent on the last stage only", async () => {
    params.current = { id: ID, stage: "hard_moments" };
    search.current = { persona: "hector", hard: true };
    await sendHi();
    expect(JSON.parse(chatCalls()[0]![1].body as string).rehearsal).toEqual({
      id: ID,
      stage: "hard_moments",
      persona: "hector",
      hardMode: true,
    });
  });

  it("a hard flag on another stage is dropped before it is sent", async () => {
    search.current = { persona: "hector", hard: true };
    await sendHi();
    expect(JSON.parse(chatCalls()[0]![1].body as string).rehearsal).toEqual({
      id: ID,
      stage: "conversation",
      persona: "hector",
    });
  });

  it("an Alphonso stage never asks for Hector's voice", async () => {
    await sendHi();
    await waitFor(() => expect(ttsBodies().length).toBeGreaterThan(0));
    expect(ttsBodies().some((b) => "character" in b)).toBe(false);
  });

  it("a refused start (pro_required) says Hector is part of Pro, not that free runs are used up", async () => {
    search.current = { persona: "hector" };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return jsonResponse({ error: "pro_required" }, 402);
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Hector rehearsals are part of Alphonso Pro/);
    expect(alert).not.toHaveTextContent(/free rehearsal/i);
  });

  it("the header names Hector, with the stage", async () => {
    search.current = { persona: "hector" };
    localStorage.setItem("showAlphonsoWhilePractising", "true");
    await renderPage();
    expect(screen.getByText("Hector · Stage 2 of 3: The real conversation")).toBeInTheDocument();
  });
});
