// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const { Route } = await import("./converse_.$scenarioId");
const { getScenario } = await import("../../data/scenarios");

const scenario = getScenario("coffee")!;
// @ts-expect-error -- overriding the router-bound hook with a plain
// function; the real one needs a <RouterProvider>, which this test
// doesn't set up (nothing else here depends on router context).
Route.useLoaderData = () => ({ scenario });

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

function renderPage() {
  const Page = Route.options.component!;
  return render(<Page />);
}

beforeEach(() => {
  // jsdom doesn't implement scrollTo on elements.
  Element.prototype.scrollTo = vi.fn();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
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
  it("renders the scenario header and opener message", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: scenario.title })).toBeInTheDocument();
    expect(screen.getByText(scenario.blurb)).toBeInTheDocument();
    expect(screen.getByText(scenario.opener)).toBeInTheDocument();
  });

  it("sends a typed message and appends the assistant's reply", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/chat")) return jsonResponse({ content: "Sure, what size?" });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "A latte please");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Sure, what size?")).toBeInTheDocument();
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) =>
      String(u).includes("/api/chat"),
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(scenario.systemPrompt);
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
    renderPage();
    const textarea = screen.getByPlaceholderText("Type or tap the mic");
    await user.type(textarea, "Hello{Enter}");
    expect(await screen.findByText("Got it.")).toBeInTheDocument();
  });

  it("maps a 429 response to a daily-limit message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return new Response("", { status: 429 });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Daily limit reached — try again tomorrow.",
    );
  });

  it("maps a 402 response to an AI-credits message", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/chat")) return new Response("", { status: 402 });
      return new Response(new Blob(["audio"]), { status: 200 });
    }) as typeof fetch;
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
    await user.type(screen.getByPlaceholderText("Type or tap the mic"), "hi{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Model unavailable");
  });

  it("toggles the mute button", async () => {
    const user = userEvent.setup();
    renderPage();
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
    renderPage();

    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    expect(screen.getByRole("button", { name: "Stop recording and send" })).toBeInTheDocument();

    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByText("I'd like a latte")).toBeInTheDocument();
    expect(await screen.findByText("One latte coming up.")).toBeInTheDocument();
    expect(fakeTrack.stop).toHaveBeenCalled();
  });

  it("rejects a recording that's too short without calling the STT endpoint", async () => {
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
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
    renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    lastRecorder!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    await user.click(screen.getByRole("button", { name: "Stop recording and send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Transcription failed");
  });

  it("shows a permission message when the microphone is denied", async () => {
    getUserMedia.mockRejectedValue(new Error("Permission denied"));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone access is needed to speak.",
    );
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeInTheDocument();
  });
});
