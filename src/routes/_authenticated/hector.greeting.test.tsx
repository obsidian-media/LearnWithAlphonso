// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "../../lib/__testutils__/ai-consent";
import { clearOpenerSpeechCache } from "../../lib/opener-speech-cache";
import { HECTOR_OUT_FOR_TODAY } from "../../lib/hector-allowance";

/** Hector speaks first (BACKLOG 0.0-bp): the greeting he says when a call opens. */

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

class FakeAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  constructor(public src: string) {
    players.push(this);
  }
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
  routes = {
    "/api/pro-status": () => Response.json(PRO),
    // The daily limit is the server's to say; the page holds no copy.
    "/api/app-config": () => Response.json({ limits: { hectorDaily: 150 } }),
    "/api/tts": () => new Response(new Blob(["mp3"]), { status: 200 }),
    "/api/hector-respond": () =>
      Response.json({ reply: "Sure! What did you do yesterday?", audioBase64: btoa("mp3") }),
  };
  globalThis.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input).split("?")[0];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, body });
    const h = routes[url];
    return h ? h(body) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
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
