// @vitest-environment jsdom
import { __resetVoicePlaybackForTests } from "@/lib/voice-playback";
import { shapeTutorReply } from "@/lib/hector-conversation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "../../lib/__testutils__/ai-consent";
import { clearOpenerSpeechCache } from "../../lib/opener-speech-cache";
import { installFakeAudioContext } from "../../lib/__testutils__/fake-audio-context";
import { HECTOR_OUT_FOR_TODAY } from "../../lib/hector-allowance";

/** Hector speaks first (BACKLOG 0.0-bp): the greeting he says when a call opens. */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: "/hector" } }),
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});
const sessionUser = vi.hoisted(() => ({ current: { id: "u1" } as Record<string, unknown> }));
const usageRows = vi.hoisted(() => ({ current: null as { count: number }[] | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: sessionUser.current } } }) },
    // ai_usage: the learner's own rows (RLS), asked for today's Hector count. null: the read fails.
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (ok: (v: unknown) => void) =>
          ok(
            table === "ai_usage" && usageRows.current
              ? { data: usageRows.current, error: null }
              : { data: null, error: { message: "unavailable" } },
          ),
      };
      return q;
    },
  },
}));
// The tapped-recording cap, shrunk for the one test that waits for it.
const cap = vi.hoisted(() => ({ ms: 60_000 }));
vi.mock("@/lib/hector-recording-cap", () => ({
  HECTOR_RECORDING_CAP_SECONDS: 60,
  get HECTOR_RECORDING_CAP_MS() {
    return cap.ms;
  },
}));
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));
const getWeaknessTrend = vi.fn();
vi.mock("@/lib/weakness-trend.functions", () => ({ getWeaknessTrend }));

const { Route } = await import("./hector");
const { useProgress } = await import("../../lib/progress");

type Handler = (body: unknown) => Response | Promise<Response>;
let routes: Record<string, Handler>;
const sent: { url: string; body: unknown }[] = [];
const realFetch = globalThis.fetch;
const players: FakeAudio[] = [];
const playRejects = { current: null as string | null };

// One persistent element plays every clip (src swapped): a clip "played" is a play() of a real source.
// A voice clip, not the tap-unlock's silent data: clip or a sound effect.
const isVoiceClip = (src: string) => !src.startsWith("data:") && !src.startsWith("/sfx/");

class FakeAudio {
  src: string;
  constructor(src = "") {
    this.src = src;
  }
  play = vi.fn(() => {
    if (!isVoiceClip(this.src)) return Promise.resolve();
    players.push(this);
    // iOS Safari without a tap: play() rejects and nothing is heard.
    if (playRejects.current) {
      return Promise.reject(Object.assign(new Error("blocked"), { name: playRejects.current }));
    }
    return Promise.resolve();
  });
  pause = vi.fn();
  onended: (() => void) | null = null;
}

const PRO = { pro: true, store: "app_store", trialEligible: false, manageUrl: null };
const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const GREETING_EN =
  "Hi Sam! Last time the past tense tripped you up. Want to practice that in conversation?";
const GENERIC_EN = "Hi Sam! Good to see you. What's been happening lately? Tell me about it.";
const tts = () => sent.filter((s) => s.url === "/api/tts");

beforeEach(() => {
  clearOpenerSpeechCache();
  localStorage.setItem("showAlphonsoWhilePractising", "false");
  useProgress.setState({ course: "en" });
  Element.prototype.scrollTo = vi.fn();
  sessionUser.current = {
    id: "u1",
    user_metadata: {
      learner_profile: { name: "Sam" },
      voices: { alphonso: { en: "aura-2-apollo-en" }, hector: { en: "aura-2-atlas-en" } },
    },
  };
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "B1" });
  getWeaknessTrend.mockReset();
  getWeaknessTrend.mockResolvedValue({
    categories: [
      {
        category: "past-tense",
        openCount: 1,
        resolvedCount: 0,
        detectedCount: 1,
        lastEventAt: recent,
      },
    ],
  });
  usageRows.current = [];
  sent.length = 0;
  players.length = 0;
  playRejects.current = null;
  routes = {
    "/api/pro-status": () => Response.json(PRO),
    // The daily limit is the server's to say; the page holds no copy.
    "/api/app-config": () => Response.json({ limits: { hectorDaily: 150 } }),
    "/api/tts": () => new Response(new Blob(["mp3"]), { status: 200 }),
    "/api/hector-respond": () =>
      Response.json(
        shapeTutorReply({
          requestId: "r",
          sessionId: "s",
          agent: "tutor",
          reply: "Sure! What did you do yesterday?",
          audioBase64: btoa("mp3"),
          ttsModel: "m",
          language: "fr",
          llmMs: 1,
          ttsMs: 1,
        }),
      ),
  };
  globalThis.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input).split("?")[0];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, body });
    const h = routes[url];
    return h ? h(body) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  __resetVoicePlaybackForTests();
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
  sessionUser.current = { id: "u1" };
});

/** Hector's words are tappable, one element per word, so match the transcript's text. */
async function shows(text: string) {
  await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent(text));
}

function renderPage(consentApi = fakeConsentApi()) {
  const Page = Route.options.component!;
  return render(withAiConsent(<Page />, consentApi));
}

describe("Hector speaks first", () => {
  it("greets by name, names the recent weak spot, and says it in Hector's voice", async () => {
    renderPage();
    await shows(GREETING_EN);
    await waitFor(() => expect(players).toHaveLength(1));
    expect(tts()).toHaveLength(1);
    expect(tts()[0].body).toEqual({
      text: GREETING_EN,
      course: "en",
      voice: "aura-2-atlas-en",
      character: "hector",
    });
    expect(players[0].play).toHaveBeenCalled();
  });

  it("without a recent weak spot it is the generic greeting", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
  });

  it("the greeting is in the history the model gets with the learner's first turn", async () => {
    renderPage();
    await shows(GREETING_EN);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Message Hector" }),
      "Yes please{Enter}",
    );
    await waitFor(() => expect(sent.some((s) => s.url === "/api/hector-respond")).toBe(true));
    const turn = sent.find((s) => s.url === "/api/hector-respond")!.body as {
      text: string;
      history: unknown[];
    };
    expect(turn.text).toBe("Yes please");
    expect(turn.history).toEqual([{ role: "assistant", content: GREETING_EN }]);
  });

  it("is not requested before AI consent", async () => {
    renderPage(fakeConsentApi(null));
    await new Promise((r) => setTimeout(r, 300));
    expect(tts()).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Last time");
  });

  it("the mic waits while the greeting loads", async () => {
    let answer: (r: Response) => void = () => {};
    routes["/api/tts"] = () => new Promise<Response>((r) => (answer = r));
    renderPage();
    await shows(GREETING_EN);
    await waitFor(() => expect(tts()).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeDisabled();
    answer(new Response(new Blob(["mp3"]), { status: 200 }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Record a voice message" })).toBeEnabled(),
    );
  });

  it("a second call replays the greeting without asking /api/tts again", async () => {
    const first = renderPage();
    await waitFor(() => expect(players).toHaveLength(1));
    first.unmount();
    renderPage();
    await waitFor(() => expect(players).toHaveLength(2));
    expect(tts()).toHaveLength(1);
  });

  it("the greeting has no report button: it is our own text, not the model's", async () => {
    renderPage();
    await shows(GREETING_EN);
    expect(screen.queryByRole("button", { name: /Report/i })).toBeNull();
  });

  it("with today's Hector allowance used up, shows the out-for-today message and says nothing", async () => {
    usageRows.current = [{ count: 150 }];
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain(HECTOR_OUT_FOR_TODAY));
    await new Promise((r) => setTimeout(r, 200));
    expect(tts()).toHaveLength(0);
    expect(players).toHaveLength(0);
    expect(screen.getByRole("log")).not.toHaveTextContent("Last time");
  });

  it("one turn short of the allowance he still greets", async () => {
    usageRows.current = [{ count: 149 }];
    renderPage();
    await shows(GREETING_EN);
    expect(tts()).toHaveLength(1);
  });

  it("the server's limit decides, not a number in the page", async () => {
    routes["/api/app-config"] = () => Response.json({ limits: { hectorDaily: 200 } });
    usageRows.current = [{ count: 150 }];
    renderPage();
    await shows(GREETING_EN);
    expect(tts()).toHaveLength(1);
  });

  it("when the server does not say the limit he still greets, however much is used", async () => {
    routes["/api/app-config"] = () => new Response("", { status: 500 });
    usageRows.current = [{ count: 9999 }];
    renderPage();
    await shows(GREETING_EN);
    expect(tts()).toHaveLength(1);
  });

  it("when the allowance cannot be read he still greets: the server stays the real guard", async () => {
    usageRows.current = null;
    renderPage();
    await shows(GREETING_EN);
    expect(tts()).toHaveLength(1);
  });
});

describe("Hector's suggestion chips", () => {
  const chipGroup = () => screen.queryByRole("group", { name: "Things to say to Hector" });
  const chip = (name: string) => screen.getByRole("button", { name });

  it("are generated from the greeting's context: his weak spot and the streak", async () => {
    useProgress.setState({ streak: 12 });
    renderPage();
    await shows(GREETING_EN);
    await waitFor(() => expect(chipGroup()).not.toBeNull());
    const labels = Array.from(chipGroup()!.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual([
      "Practice my weak words",
      "Roleplay: my weekend",
      "Keep my 12-day streak",
      "Roleplay: ordering coffee",
    ]);
    useProgress.setState({ streak: 0 });
  });

  it("fall back to the fixed set when there is no context", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    useProgress.setState({ streak: 0 });
    renderPage();
    await shows(GENERIC_EN);
    await waitFor(() => expect(chipGroup()).not.toBeNull());
    const labels = Array.from(chipGroup()!.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual([
      "Practice my weak words",
      "Roleplay: ordering coffee",
      "Explain a rule",
      "Just chat",
    ]);
  });

  it("tapping one sends it as the learner's message, and the chips go", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
    await waitFor(() => expect(chipGroup()).not.toBeNull());
    await userEvent.click(chip("Just chat"));
    await waitFor(() =>
      expect(sent.find((s) => s.url === "/api/hector-respond")?.body).toMatchObject({
        text: "Let's just chat.",
      }),
    );
    await shows("Sure! What did you do yesterday?");
    expect(chipGroup()).toBeNull();
    expect(screen.getByRole("log")).toHaveTextContent("Let's just chat.");
  });

  it("also go when the learner types their own first message", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
    await waitFor(() => expect(chipGroup()).not.toBeNull());
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "hello{Enter}");
    await waitFor(() => expect(chipGroup()).toBeNull());
  });

  it("are not shown when today's allowance is used up (no greeting, so nothing to follow)", async () => {
    usageRows.current = [{ count: 150 }];
    renderPage();
    await screen.findByText(HECTOR_OUT_FOR_TODAY);
    expect(chipGroup()).toBeNull();
  });

  it("the greeting is Hector's first bubble: a white card with his mini avatar", async () => {
    renderPage();
    await shows(GREETING_EN);
    const log = screen.getByRole("log");
    const bubble = Array.from(log.querySelectorAll("div")).find((d) =>
      d.className.includes("bg-ds-card"),
    );
    expect(bubble?.textContent).toContain("past tense");
    expect(log.querySelector('img[src="/hector/base.webp"]')).not.toBeNull();
  });

  it("the learner's bubble is the choice colour with its on-choice text", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "hello{Enter}");
    const mine = await screen.findByText("hello");
    expect(mine.className).toContain("bg-ds-choice");
    expect(mine.className).toContain("text-ds-on-choice");
  });
});

describe("Hector's type-or-talk composer", () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported = () => true;
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.onstop?.();
        }
      },
    );
  });

  it("a tapped recording that is never stopped is stopped at the cap", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    cap.ms = 300;
    try {
      renderPage();
      await shows(GENERIC_EN);
      await userEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
      await screen.findByTestId("hector-listening");
      await waitFor(() => expect(screen.queryByTestId("hector-listening")).toBeNull(), {
        timeout: 3000,
      });
    } finally {
      cap.ms = 60_000;
    }
  });

  it("idle: a text field, a gold mic, and no send button until something is typed", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
    const box = screen.getByRole("textbox", { name: "Message Hector" });
    expect(box).toHaveAttribute("placeholder", "Type or tap the mic…");
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await userEvent.type(box, "hi");
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("talk mode: the field becomes a Listening pill with a waveform, and a red stop replaces the mic", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    renderPage();
    await shows(GENERIC_EN);
    await userEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
    const pill = await screen.findByTestId("hector-listening");
    expect(pill).toHaveTextContent("Listening");
    expect(screen.getByTestId("hector-wave")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Hector" })).toBeNull();
    expect(screen.getByTestId("hector-status")).toHaveAttribute(
      "aria-label",
      "Hector is listening",
    );
    const stop = screen.getByRole("button", { name: "Stop recording and send" });
    expect(stop.className).toContain("bg-ds-wrong");
    await userEvent.click(stop);
    await waitFor(() => expect(screen.queryByTestId("hector-listening")).toBeNull());
    expect(screen.getByRole("textbox", { name: "Message Hector" })).toBeInTheDocument();
  });
});

describe("Hector is always heard", () => {
  const spoken: { text: string; lang: string }[] = [];
  beforeEach(() => {
    spoken.length = 0;
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onstart: (() => void) | null = null;
        constructor(public text: string) {}
        lang = "";
      },
    );
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: (u: { text: string; lang: string }) => spoken.push({ text: u.text, lang: u.lang }),
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis,
      configurable: true,
    });
  });

  it("a greeting the browser refuses to play is read by the device voice, with a Tap to hear Hector button", async () => {
    playRejects.current = "NotAllowedError";
    renderPage();
    await shows(GENERIC_EN);
    expect(await screen.findByRole("button", { name: "Tap to hear Hector" })).toBeInTheDocument();
    expect(spoken.map((s) => s.text)).toContain(GENERIC_EN);
  });

  it("the tap plays the greeting (a gesture is what the browser wanted) and the button goes away", async () => {
    playRejects.current = "NotAllowedError";
    renderPage();
    const tap = await screen.findByRole("button", { name: "Tap to hear Hector" });
    playRejects.current = null;
    const before = players.length;
    await userEvent.click(tap);
    await waitFor(() => expect(players.length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Tap to hear Hector" })).toBeNull(),
    );
  });

  it("a reply that comes back with no audio (the server's voice failed) is still shown and is read by the device voice", async () => {
    getWeaknessTrend.mockResolvedValue({ categories: [] });
    routes["/api/hector-respond"] = () =>
      Response.json({ reply: "Sure! What did you do yesterday?", state: "ok" });
    renderPage();
    await shows(GENERIC_EN);
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "Hello{Enter}");
    await shows("What did you do yesterday?");
    await waitFor(() =>
      expect(spoken.map((s) => s.text)).toContain("Sure! What did you do yesterday?"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the call screen carries the hands-free chip itself, and the tap button on the call", async () => {
    localStorage.removeItem("showAlphonsoWhilePractising");
    installFakeAudioContext();
    playRejects.current = "NotAllowedError";
    renderPage();
    expect(await screen.findByTestId("hands-free-chip")).toHaveTextContent("Hands-free: Off");
    expect(await screen.findByTestId("tap-to-hear")).toHaveTextContent("Tap to hear Hector");
  });

  it("a split turn shows the text at once, then speaks it from /api/tts with the turn token, first sentence first", async () => {
    routes["/api/hector-respond"] = (body) => {
      expect((body as { split_tts?: boolean }).split_tts).toBe(true);
      return Response.json({
        reply: "Very good, you did it! Now tell me what you ate.",
        audio_base64: "",
        tts_token: "123.sig",
        state: "ok",
      });
    };
    renderPage();
    await shows(GENERIC_EN);
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    const before = players.length;
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "Hello{Enter}");
    await shows("Very good, you did it!");
    const turnCalls = () =>
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes("turn="));
    await waitFor(() =>
      expect(turnCalls()).toEqual(["/api/tts?turn=123.sig&part=0", "/api/tts?turn=123.sig&part=1"]),
    );
    // Both pieces play, in order, on the one element (the first as soon as it arrives).
    await waitFor(() => expect(players.length).toBeGreaterThan(before));
    const body = sent.filter((s) => s.url === "/api/tts").at(-1)!.body as { text: string };
    expect(body.text).toBe("Very good, you did it! Now tell me what you ate.");
  });

  it("if the turn token is refused the reply is still read, by the device voice", async () => {
    routes["/api/hector-respond"] = () =>
      Response.json({
        reply: "Sure! What did you do yesterday?",
        audio_base64: "",
        tts_token: "9.bad",
      });
    const original = routes["/api/tts"];
    let greeted = false;
    routes["/api/tts"] = (b) => {
      if (!greeted) {
        greeted = true;
        return original!(b);
      }
      return new Response("no", { status: 403 });
    };
    renderPage();
    await shows(GENERIC_EN);
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "Hello{Enter}");
    await shows("What did you do yesterday?");
    await waitFor(() =>
      expect(spoken.map((s) => s.text).join(" ")).toContain("Sure! What did you do yesterday?"),
    );
  });
});
