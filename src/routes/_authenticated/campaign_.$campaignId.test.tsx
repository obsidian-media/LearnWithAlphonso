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

const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));

const { Route } = await import("./campaign_.$campaignId");
const { getCampaign } = await import("../../data/campaigns");

const campaign = getCampaign("city-day")!;
// @ts-expect-error -- same override pattern as converse_.$scenarioId.test.tsx.
Route.useLoaderData = () => ({ campaign });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderPage() {
  const Page = Route.options.component!;
  return render(<Page />);
}

/** Types and sends `text`, then waits for `reply` to appear as an assistant bubble. */
async function sendAndAwaitReply(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  reply: string,
) {
  await user.type(screen.getByPlaceholderText("Type or tap the mic"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(reply)).toBeInTheDocument();
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "B1" });
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      onended: (() => void) | null = null;
      constructor(public src: string) {}
    },
  );
  Object.defineProperty(global.URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock-url"),
    configurable: true,
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  let n = 0;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/tts")) return new Response(new Blob(["audio"]), { status: 200 });
    if (url.includes("/api/chat")) {
      n += 1;
      return jsonResponse({ content: `Reply ${n}` });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

describe("Campaign chat page", () => {
  it("renders the campaign header, first scene's progress label, and opener", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: campaign.title })).toBeInTheDocument();
    expect(
      screen.getByText(`Scene 1 of ${campaign.scenes.length} — ${campaign.scenes[0].title}`),
    ).toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[0].opener)).toBeInTheDocument();
  });

  it("sends the composed premise+scene systemPrompt and the full transcript so far", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendAndAwaitReply(user, "One latte please", "Reply 1");

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) =>
      String(u).includes("/api/chat"),
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(`${campaign.premise}\n\n${campaign.scenes[0].systemPrompt}`);
    expect(body.messages).toEqual([
      { role: "assistant", content: campaign.scenes[0].opener },
      { role: "user", content: "One latte please" },
    ]);
  });

  it("does not show Continue until the scene's minTurns is reached, then advances and carries the transcript forward", async () => {
    const user = userEvent.setup();
    renderPage();
    const scene = campaign.scenes[0];

    expect(screen.queryByRole("button", { name: /Continue:/ })).not.toBeInTheDocument();

    for (let i = 0; i < scene.minTurns; i++) {
      await sendAndAwaitReply(user, `turn ${i}`, `Reply ${i + 1}`);
    }

    const continueButton = await screen.findByRole("button", { name: /Continue:/ });
    await user.click(continueButton);

    // Now on scene 2: progress label updated, its opener shown.
    expect(
      screen.getByText(`Scene 2 of ${campaign.scenes.length} — ${campaign.scenes[1].title}`),
    ).toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[1].opener)).toBeInTheDocument();
    // Scene 1's transcript is still visible/sent -- continuity across scenes.
    expect(screen.getByText(scene.opener)).toBeInTheDocument();

    await sendAndAwaitReply(user, "excuse me", `Reply ${scene.minTurns + 1}`);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u]) => String(u).includes("/api/chat"))
      .pop()!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(`${campaign.premise}\n\n${campaign.scenes[1].systemPrompt}`);
    // First message in the sent history is still scene 1's opener.
    expect(body.messages[0]).toEqual({ role: "assistant", content: scene.opener });
  });

  it("restarting the current scene truncates the transcript back to that scene's opener", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendAndAwaitReply(user, "hello there", "Reply 1");
    expect(screen.getByText("hello there")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart this scene" }));

    expect(screen.queryByText("hello there")).not.toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[0].opener)).toBeInTheDocument();
  });

  it("shows a completion state after finishing the last scene", async () => {
    const user = userEvent.setup();
    renderPage();

    for (const scene of campaign.scenes) {
      for (let i = 0; i < scene.minTurns; i++) {
        await user.type(screen.getByPlaceholderText("Type or tap the mic"), `msg ${i}`);
        await user.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() =>
          expect(
            (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
              String(u).includes("/api/chat"),
            ).length,
          ).toBeGreaterThan(0),
        );
      }
      const button = await screen.findByRole("button", { name: /Continue:|Finish campaign/ });
      await user.click(button);
    }

    expect(await screen.findByText("Nice work — campaign complete!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Practice" })).toHaveAttribute(
      "href",
      "/converse",
    );
    // The composer is gone once the campaign is finished.
    expect(screen.queryByPlaceholderText("Type or tap the mic")).not.toBeInTheDocument();
  });

  // --- voice + error paths (coverage gap, 2026-09-24) ---
  // These were the bulk of what was untested here (41.5% branch coverage):
  // every one is a user-facing failure message, i.e. exactly the code a
  // user only ever meets when something has already gone wrong.

  /** Installs a controllable MediaRecorder and returns the live instance. */
  function stubMediaRecorder() {
    const instances: FakeRecorder[] = [];
    class FakeRecorder {
      state = "inactive";
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: unknown, opts?: { mimeType?: string }) {
        this.mimeType = opts?.mimeType ?? "";
        instances.push(this);
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
      static isTypeSupported() {
        return true;
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    return instances;
  }

  function stubMicrophone(granted: boolean) {
    const track = { stop: vi.fn() };
    Object.defineProperty(global.navigator, "mediaDevices", {
      value: {
        getUserMedia: granted
          ? vi.fn().mockResolvedValue({ getTracks: () => [track] })
          : vi.fn().mockRejectedValue(new Error("denied")),
      },
      configurable: true,
    });
  }

  it("explains that the mic is needed when permission is refused", async () => {
    const user = userEvent.setup();
    stubMicrophone(false);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Record a voice message" }));

    expect(await screen.findByText("Microphone access is needed to speak.")).toBeInTheDocument();
    // The button must fall back out of the recording state, or the user is
    // stuck looking at a Stop button that can never stop anything.
    expect(
      await screen.findByRole("button", { name: "Record a voice message" }),
    ).toBeInTheDocument();
  });

  it("rejects a clip too short to be speech instead of sending it", async () => {
    const user = userEvent.setup();
    stubMicrophone(true);
    const recorders = stubMediaRecorder();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(recorders.length).toBe(1));
    recorders[0]!.ondataavailable?.({ data: new Blob(["x"]) });
    recorders[0]!.stop();

    expect(await screen.findByText("That was too short — try again.")).toBeInTheDocument();
  });

  it("says it didn't catch anything when transcription comes back empty", async () => {
    const user = userEvent.setup();
    stubMicrophone(true);
    const recorders = stubMediaRecorder();
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/stt")) return jsonResponse({ text: "   " });
      return realFetch(input, init);
    }) as typeof fetch;
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(recorders.length).toBe(1));
    recorders[0]!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    recorders[0]!.stop();

    expect(await screen.findByText("Didn't catch that — try again.")).toBeInTheDocument();
  });

  it("surfaces the server's message when transcription fails outright", async () => {
    const user = userEvent.setup();
    stubMicrophone(true);
    const recorders = stubMediaRecorder();
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/stt")) {
        return jsonResponse({ error: "Speech service unavailable" }, 503);
      }
      return realFetch(input, init);
    }) as typeof fetch;
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Record a voice message" }));
    await waitFor(() => expect(recorders.length).toBe(1));
    recorders[0]!.ondataavailable?.({ data: new Blob(["x".repeat(2000)]) });
    recorders[0]!.stop();

    expect(await screen.findByText("Speech service unavailable")).toBeInTheDocument();
  });

  it("stops requesting speech audio once voice is muted", async () => {
    const user = userEvent.setup();
    renderPage();
    // The opener is spoken on a timer after mount; wait for that first so
    // the assertion below is about the mute, not about timing.
    await waitFor(() =>
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
          String(c[0]).includes("/api/tts"),
        ),
      ).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: "Mute voice" }));
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    await sendAndAwaitReply(user, "hello there", "Reply 1");

    const ttsCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("/api/tts"),
    );
    expect(ttsCalls).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Unmute voice" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows an error when the reply request fails, without losing the transcript", async () => {
    const user = userEvent.setup();
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/chat")) {
        return jsonResponse({ error: "Model is busy" }, 503);
      }
      return realFetch(input, init);
    }) as typeof fetch;
    renderPage();

    await user.type(await screen.findByPlaceholderText("Type or tap the mic"), "bonjour");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Model is busy")).toBeInTheDocument();
    // The user's own turn stays on screen -- losing it would make the
    // failure look like the message was never sent.
    expect(screen.getByText("bonjour")).toBeInTheDocument();
  });
});
