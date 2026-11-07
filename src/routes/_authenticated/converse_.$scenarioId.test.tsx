// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOpenerSpeechCache } from "@/lib/opener-speech-cache";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

// V3 package 3a: adaptive difficulty fetches the user's CEFR level on
// mount, same mocking pattern learn.test.tsx already established.
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));

const invite = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("@/components/HectorInvite", async () => {
  const { useEffect } = await import("react");
  return {
    HectorInvite: ({ source }: { source: string }) => {
      useEffect(() => {
        invite.mounts += 1;
      }, []);
      return <div data-testid="hector-invite" data-source={source} />;
    },
  };
});
const { Route } = await import("./converse_.$scenarioId");
const { getScenario, localizeScenario, scenarioPrompt } = await import("../../data/scenarios");
const { useProgress } = await import("../../lib/progress");

const rawScenario = getScenario("coffee")!;
// Existing assertions read the flat English view; the loader returns the raw record.
const scenario = localizeScenario(rawScenario, "en");
// @ts-expect-error -- overriding the router-bound hook with a plain
// function; the real one needs a <RouterProvider>, which this test
// doesn't set up (nothing else here depends on router context).
Route.useLoaderData = () => ({ scenario: rawScenario });

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mime: string) => mime === "audio/webm");
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: MediaStream,
    opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? "";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

let lastRecorder: FakeMediaRecorder | null = null;
const RecorderSpy = vi.fn(function (this: unknown, ...args: [MediaStream, { mimeType?: string }?]) {
  const rec = new FakeMediaRecorder(...args);
  lastRecorder = rec;
  return rec;
}) as unknown as typeof MediaRecorder & {
  isTypeSupported: typeof FakeMediaRecorder.isTypeSupported;
};
RecorderSpy.isTypeSupported = FakeMediaRecorder.isTypeSupported;

const getUserMedia = vi.fn();
const fakeTrack = { stop: vi.fn() };
const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;

const audioInstances: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
class FakeAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  constructor(public src: string) {
    audioInstances.push(this);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Renders the page inside the consent provider. A consenting learner (the default) gets the chat; the helper waits
 * for the consent read so every test starts from an open page. Pass fakeConsentApi(null) for the gate instead.
 */
async function renderPage(consentApi = fakeConsentApi(), { waitForChat = true } = {}) {
  const Page = Route.options.component!;
  const result = render(withAiConsent(<Page />, consentApi));
  if (waitForChat) await screen.findByRole("log");
  return result;
}

beforeEach(() => {
  clearOpenerSpeechCache();
  useProgress.setState({ course: "en" });
  // These tests cover the classic screen; the call screen has its own describe below.
  localStorage.setItem("showAlphonsoWhilePractising", "false");
  // jsdom doesn't implement scrollTo on elements.
  Element.prototype.scrollTo = vi.fn();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "B1" });
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue(fakeStream);
  fakeTrack.stop.mockClear();
  audioInstances.length = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  vi.stubGlobal("MediaRecorder", RecorderSpy);
  vi.stubGlobal("Audio", FakeAudio);
  Object.defineProperty(global.URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock-url"),
    configurable: true,
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/tts")) return new Response(new Blob(["audio"]), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

describe("Converse chat page", () => {
  it("offers 'Continue with Hector' only after the learner has sent 3 messages", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Nice." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    for (const [i, text] of ["one", "two", "three"].entries()) {
      expect(screen.queryByTestId("hector-invite")).toBeNull();
      await user.type(screen.getByPlaceholderText("Type or tap the mic"), text);
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => {
        const chats = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
          String(u).includes("/api/chat"),
        );
        expect(chats).toHaveLength(i + 1);
        expect(screen.getByPlaceholderText("Type or tap the mic")).toBeEnabled();
      });
    }
    expect(screen.getByTestId("hector-invite")).toHaveAttribute(
      "data-source",
      "practice_end_prompt",
    );
  });

  it("keeps the 'Continue with Hector' prompt mounted across later turns (no Pro re-check, an open paywall stays open)", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Nice." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    invite.mounts = 0;
    const user = userEvent.setup();
    await renderPage();
    for (const [i, text] of ["one", "two", "three", "four", "five"].entries()) {
      await user.type(screen.getByPlaceholderText("Type or tap the mic"), text);
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => {
        const chats = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
          String(u).includes("/api/chat"),
        );
        expect(chats).toHaveLength(i + 1);
        expect(screen.getByPlaceholderText("Type or tap the mic")).toBeEnabled();
      });
    }
    expect(screen.getByTestId("hector-invite")).toBeInTheDocument();
    expect(invite.mounts).toBe(1);
  });

  it("renders the scenario header and opener message", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: scenario.title })).toBeInTheDocument();
    expect(screen.getByText(scenario.blurb)).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent(scenario.opener);
  });

  it("lets the learner tap the tutor's words to save them, but not their own", async () => {
    const user = userEvent.setup();
    await renderPage();
    const firstWord = scenario.opener.match(/\p{L}+/u)![0];
    await user.click(screen.getAllByRole("button", { name: firstWord })[0]);
    expect(screen.getByRole("dialog", { name: /save this word/i })).toHaveTextContent(firstWord);
  });

  it("leaves the learner's own message as plain text", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "A latte please");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const mine = await screen.findByText("A latte please");
    expect(mine.querySelector("button")).toBeNull();
  });

  it("sends a typed message and appends the assistant's reply", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Sure, what size?" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "A latte please");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Sure, what size?"));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) =>
      String(u).includes("/api/chat"),
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(scenario.systemPrompt);
    expect(body.cefrLevel).toBe("B1");
    expect(body.messages).toEqual([
      { role: "assistant", content: scenario.opener },
      { role: "user", content: "A latte please" },
    ]);
  });

  it("sends on Enter without Shift", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return jsonResponse({ content: "Got it." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    const textarea = screen.getByPlaceholderText("Type or tap the mic");
    await user.type(textarea, "Hello{Enter}");
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Got it."));
  });

  it("maps a 429 response to a daily-limit message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return new Response("", { status: 429 });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Daily limit reached — try again tomorrow.",
    );
  });

  it("a 403 ai-consent-required (withdrawn on another device) returns the page to the gate", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) {
        return new Response(JSON.stringify({ error: "ai-consent-required" }), { status: 403 });
      }
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("button", { name: "Review and allow" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("maps a 402 response to an AI-credits message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return new Response("", { status: 402 });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI credits exhausted. Add credits to keep chatting.",
    );
  });

  it("surfaces the server's own error message for other failures", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) {
        return new Response(JSON.stringify({ error: "Model unavailable" }), { status: 500 });
      }
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Model unavailable");
  });

  it("toggles the mute button", async () => {
    const user = userEvent.setup();
    await renderPage();
    const muteButton = screen.getByRole("button", { name: "Mute voice" });
    expect(muteButton).toHaveAttribute("aria-pressed", "true");
    await user.click(muteButton);
    expect(screen.getByRole("button", { name: "Unmute voice" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("records, transcribes, and sends the resulting text", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/stt")) return jsonResponse({ text: "I'd like a latte" });
      if (url.includes("/api/chat")) return jsonResponse({ content: "One latte coming up." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    expect(screen.getByRole("button", { name: "Stop recording and send" })).toBeInTheDocument();

    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByText("I'd like a latte")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("One latte coming up."));
    expect(fakeTrack.stop).toHaveBeenCalled();
  });

  it("shows a pronunciation-clarity badge on a voice-transcribed message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/stt")) return jsonResponse({ text: "good morning", confidence: 0.4 });
      if (url.includes("/api/chat")) return jsonResponse({ content: "Hi there!" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByText("good morning")).toBeInTheDocument();
    expect(await screen.findByText("Unclear pronunciation")).toBeInTheDocument();
  });

  it("rejects a recording that's too short without calling the STT endpoint", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    lastRecorder!.ondataavailable?.({ data: new Blob(["short"]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That was too short");
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) =>
        String(u).includes("/api/stt"),
      ),
    ).toBe(false);
  });

  it("shows an empty-transcript message when STT returns no text", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/stt")) return jsonResponse({ text: "" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Didn't catch that");
  });

  it("shows a transcription-failed message when STT errors", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/stt")) return new Response("", { status: 500 });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Transcription failed");
  });

  it("shows a permission message when the microphone is denied", async () => {
    getUserMedia.mockRejectedValue(new Error("Permission denied"));
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone access is needed to speak.",
    );
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeInTheDocument();
  });

  it("shows the French variant and sends the French prompt when the course is French", async () => {
    useProgress.setState({ course: "fr" });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Très bien, et avec ceci ?" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const fr = localizeScenario(rawScenario, "fr");
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByRole("heading", { name: "Au café" })).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent(fr.opener);
    await waitFor(() => expect(fetchProgress).toHaveBeenCalledWith({ data: { course: "fr" } }));

    await user.type(
      screen.getByPlaceholderText("Type or tap the mic"),
      "Un crème, s'il vous plaît",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByRole("log")).toHaveTextContent("Très bien, et avec ceci ?"),
    );
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) =>
      String(u).includes("/api/chat"),
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(scenarioPrompt("coffee", "fr"));
    expect(body.messages[0]).toEqual({ role: "assistant", content: fr.opener });
  });

  it("starts a fresh conversation in the new language when the course changes mid-chat", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Sure, what size?" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "A latte please");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Sure, what size?"));

    act(() => useProgress.setState({ course: "es" }));

    const log = screen.getByRole("log");
    expect(log).toHaveTextContent(localizeScenario(rawScenario, "es").opener);
    expect(log).not.toHaveTextContent("A latte please");
    expect(log).not.toHaveTextContent(scenario.opener);
  });

  it("shows the AI gate instead of the chat without consent, and sends nothing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage(fakeConsentApi(null), { waitForChat: false });
    expect(await screen.findByRole("button", { name: "Review and allow" })).toBeInTheDocument();
    expect(screen.queryByRole("log")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("withdrawing mid-chat and allowing again keeps the transcript and the unsent text", async () => {
    let chatCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) {
        chatCalls += 1;
        if (chatCalls === 1) return jsonResponse({ content: "First reply" });
        return new Response(JSON.stringify({ error: "ai-consent-required" }), { status: 403 });
      }
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hello there");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("First reply"));

    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "second line{Enter}");
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(await screen.findByRole("button", { name: "Allow" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("log")).toHaveTextContent("hello there");
    expect(screen.getByRole("log")).toHaveTextContent("First reply");
    expect(screen.getByPlaceholderText("Type or tap the mic")).toHaveValue("second line");
  });

  it("has no Report button on the fixed opening line, but has one on a model reply", async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(screen.queryByRole("button", { name: "Report this response" })).toBeNull();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Report this response" })).toHaveLength(1),
    );
  });

  it("asks /api/tts for the course's voice and sends the course to /api/chat", async () => {
    useProgress.setState({ course: "fr" });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Très bien." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    await user.type(
      screen.getByPlaceholderText("Type or tap the mic"),
      "Un crème, s'il vous plaît",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Très bien."));

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const chat = calls.find(([u]) => String(u).includes("/api/chat"))!;
    expect(JSON.parse(chat[1].body as string).course).toBe("fr");
    await waitFor(() => expect(calls.some(([u]) => String(u).includes("/api/tts"))).toBe(true));
    for (const [, init] of calls.filter(([u]) => String(u).includes("/api/tts"))) {
      expect(JSON.parse(init.body as string).course).toBe("fr");
    }
  });

  it("speaks with Alphonso's chosen voice for the course, never Hector's", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            user_metadata: {
              voices: {
                alphonso: { fr: "aura-2-agathe-fr" },
                hector: { fr: "aura-2-hector-fr" },
              },
            },
          },
        },
      },
    });
    useProgress.setState({ course: "fr" });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Très bien." });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    await user.type(
      screen.getByPlaceholderText("Type or tap the mic"),
      "Un crème, s'il vous plaît",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Très bien."));

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const chat = calls.find(([u]) => String(u).includes("/api/chat"))!;
    expect(JSON.parse(chat[1].body as string).course).toBe("fr");
    await waitFor(() => expect(calls.some(([u]) => String(u).includes("/api/tts"))).toBe(true));
    const tts = calls.filter(([u]) => String(u).includes("/api/tts"));
    expect(tts.length).toBeGreaterThan(0);
    for (const [, init] of tts) {
      expect(JSON.parse(init.body as string).voice).toBe("aura-2-agathe-fr");
    }
  });
});

describe("Converse call screen (setting on, the default)", () => {
  beforeEach(() => {
    localStorage.removeItem("showAlphonsoWhilePractising");
  });

  async function renderCall() {
    const Page = Route.options.component!;
    const result = render(withAiConsent(<Page />, fakeConsentApi()));
    await screen.findByTestId("call-caption");
    return result;
  }

  it("is a full-screen call: Alphonso hidden from assistive technology, the three controls labelled", async () => {
    await renderCall();
    expect(screen.getByTestId("alphonso-stage")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show the conversation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "End the call" })).toHaveAttribute("href", "/converse");
    expect(screen.getByText(scenario.title)).toBeInTheDocument();
    expect(screen.getByTestId("call-timer")).toHaveTextContent("0:00");
    // The caption is a polite live region showing the current utterance only.
    const caption = screen.getByTestId("call-caption");
    expect(caption).toHaveAttribute("aria-live", "polite");
    expect(caption).toHaveTextContent(scenario.opener);
  });

  it("keeps the conversation reachable as text while the sheet is closed, and opens it as a dialog", async () => {
    const user = userEvent.setup();
    await renderCall();
    expect(screen.getByRole("list", { name: "Conversation so far" })).toHaveTextContent(
      scenario.opener,
    );
    expect(screen.queryByRole("dialog", { name: "Conversation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show the conversation" }));
    const sheet = await screen.findByRole("dialog", { name: "Conversation" });
    expect(sheet).toBeVisible();
    expect(within(sheet).getByRole("log", { name: "Conversation" })).toBeInTheDocument();
    expect(within(sheet).getByPlaceholderText("Type or tap the mic")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Back to call" }));
    expect(screen.queryByRole("dialog", { name: "Conversation" })).toBeNull();
  });

  it("a typed message from the sheet reaches the caption in the learner's green tint, then the reply replaces it", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat"))
        return jsonResponse({ content: "One latte.", verdict: "correct" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    await renderCall();
    await user.click(screen.getByRole("button", { name: "Show the conversation" }));
    const sheet = await screen.findByRole("dialog", { name: "Conversation" });
    await user.type(within(sheet).getByPlaceholderText("Type or tap the mic"), "A latte please");
    await user.click(within(sheet).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByTestId("call-caption")).toHaveTextContent("One latte."));
    expect(screen.getByTestId("call-caption")).toHaveAttribute("data-mine", "false");
  });

  it("puts the voice mute control in the call bar", async () => {
    const user = userEvent.setup();
    await renderCall();
    await user.click(screen.getByRole("button", { name: "Mute voice" }));
    expect(screen.getByRole("button", { name: "Unmute voice" })).toBeInTheDocument();
  });

  it("holding the talk button records, and releasing it stops", async () => {
    await renderCall();
    const talk = screen.getByRole("button", { name: "Hold to talk" });
    fireEvent.pointerDown(talk);
    await waitFor(() => expect(lastRecorder?.state).toBe("recording"));
    await waitFor(() =>
      expect(screen.getByTestId("call-state")).toHaveTextContent(/listening to you/i),
    );
    expect(screen.getByTestId("you-tile")).toHaveAttribute("data-live", "true");
    fireEvent.pointerUp(talk);
    expect(lastRecorder?.state).toBe("inactive");
  });

  it("says the scenario's opener out loud when the call starts, in Alphonso's voice", async () => {
    getSession.mockResolvedValue({
      data: {
        session: { user: { user_metadata: { voices: { alphonso: { en: "aura-2-thalia-en" } } } } },
      },
    });
    await renderCall();
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    const tts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
      String(u).includes("/api/tts"),
    );
    expect(tts).toHaveLength(1);
    expect(JSON.parse(tts[0][1].body as string)).toMatchObject({
      text: scenario.opener,
      course: "en",
      voice: "aura-2-thalia-en",
    });
    expect(audioInstances[0].play).toHaveBeenCalled();
  });

  it("fetches the opener's voice once: a second call replays it", async () => {
    const first = await renderCall();
    await waitFor(() => expect(audioInstances.length).toBe(1));
    first.unmount();
    await renderCall();
    await waitFor(() => expect(audioInstances.length).toBe(2));
    const tts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
      String(u).includes("/api/tts"),
    );
    expect(tts).toHaveLength(1);
  });

  it("a voice changed in Settings fetches the opener again, in the new voice", async () => {
    const withVoice = (id: string) =>
      getSession.mockResolvedValue({
        data: { session: { user: { user_metadata: { voices: { alphonso: { en: id } } } } } },
      });
    withVoice("aura-2-thalia-en");
    const first = await renderCall();
    await waitFor(() => expect(audioInstances.length).toBe(1));
    first.unmount();
    withVoice("aura-2-apollo-en");
    await renderCall();
    await waitFor(() => expect(audioInstances.length).toBe(2));
    const voices = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u]) => String(u).includes("/api/tts"))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string).voice);
    expect(voices).toEqual(["aura-2-thalia-en", "aura-2-apollo-en"]);
  });

  it("talking over Alphonso cuts his voice off, so it is not recorded", async () => {
    await renderCall();
    await waitFor(() => expect(audioInstances.length).toBeGreaterThan(0));
    const opener = audioInstances[audioInstances.length - 1];
    expect(opener.pause).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    expect(opener.pause).toHaveBeenCalled();
  });

  it("a voice that finishes loading after the learner hung up is never played", async () => {
    let release: (r: Response) => void = () => {};
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/tts")) return new Promise<Response>((r) => (release = r));
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;
    const { unmount } = await renderCall();
    await waitFor(() =>
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) =>
          String(u).includes("/api/tts"),
        ),
      ).toBe(true),
    );
    unmount();
    await act(async () => {
      release(new Response(new Blob(["audio"]), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(audioInstances).toHaveLength(0);
  });

  it("a keyboard or screen-reader activation (a click with no pointer) toggles recording", async () => {
    await renderCall();
    const talk = screen.getByRole("button", { name: "Hold to talk" });
    fireEvent.click(talk, { detail: 0 });
    await waitFor(() => expect(lastRecorder?.state).toBe("recording"));
    fireEvent.click(talk, { detail: 0 });
    expect(lastRecorder?.state).toBe("inactive");
  });

  it("with the setting off it is the classic screen: the header, no stage", async () => {
    localStorage.setItem("showAlphonsoWhilePractising", "false");
    await renderPage();
    expect(screen.queryByTestId("alphonso-stage")).toBeNull();
    expect(screen.getByRole("heading", { name: scenario.title })).toBeInTheDocument();
  });
});
