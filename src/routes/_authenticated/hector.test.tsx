// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeConsentApi, withAiConsent } from "../../lib/__testutils__/ai-consent";

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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: sessionUser.current } } }) },
  },
}));
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));
vi.mock("@/lib/leaderboard.functions", () => ({ getMyProfile: async () => null }));

const { Route } = await import("./hector");
const { useProgress } = await import("../../lib/progress");
const { useAvatarPreference } = await import("../../lib/avatar/preference");

type Handler = (body: unknown) => Response;
let routes: Record<string, Handler>;
const sent: { url: string; body: unknown }[] = [];
const realFetch = globalThis.fetch;

function status(body: unknown, code = 200): Handler {
  return () => Response.json(body, { status: code });
}
const PRO_APP_STORE = { pro: true, store: "app_store", trialEligible: false, manageUrl: null };
const PRO_WEB = {
  pro: true,
  store: "web",
  trialEligible: false,
  manageUrl: "https://billing.example/portal",
};
const FREE = { pro: false, store: null, trialEligible: true, manageUrl: null };
// Test fixture: a made-up offer.
const OFFER = {
  plans: [
    {
      price: "$9.99",
      amountMicros: 9_990_000,
      currency: "USD",
      period: "month",
      trialDays: 7,
      purchaseUrl: "https://pay.rev.cat/t/u",
    },
  ],
};

class FakeAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  constructor(public src: string) {}
}

beforeEach(() => {
  // The existing tests cover the classic screen; the call screen has its own describe below.
  localStorage.setItem("showAlphonsoWhilePractising", "false");
  useProgress.setState({ course: "fr" });
  Element.prototype.scrollTo = vi.fn();
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "A2" });
  sent.length = 0;
  routes = {
    "/api/pro-status": status(PRO_APP_STORE),
    "/api/pro-offering": status(OFFER),
    "/api/hector-respond": status({ reply: "Bonjour ! Comment ça va ?", audioBase64: btoa("mp3") }),
  };
  globalThis.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const path = url.split("?")[0];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, body });
    const h = routes[path];
    return h ? h(body) : new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

async function renderPage() {
  const Page = Route.options.component!;
  return render(withAiConsent(<Page />, fakeConsentApi()));
}

describe("web Hector", () => {
  it("a learner without Pro sees the paywall, opened from the Hector tab", async () => {
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    expect(await screen.findByText("$9.99 a month after the trial")).toBeInTheDocument();
    expect(sent.some((s) => s.url === "/api/pro-offering?source=hector_tab")).toBe(true);
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("right after paying, a not-yet-active learner sees 'activating', never the paywall again", async () => {
    sessionStorage.setItem(
      "alphonso.pro.justPaidAt",
      JSON.stringify({ at: Date.now(), user: "u1" }),
    );
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    expect(await screen.findByText("Payment received, activating…")).toBeInTheDocument();
    expect(sent.some((s) => s.url.startsWith("/api/pro-offering"))).toBe(false);
    sessionStorage.removeItem("alphonso.pro.justPaidAt");
  });

  it("another account's recent payment in this tab does not hide the paywall", async () => {
    sessionStorage.setItem(
      "alphonso.pro.justPaidAt",
      JSON.stringify({ at: Date.now(), user: "u0" }),
    );
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    expect(await screen.findByText("$9.99 a month after the trial")).toBeInTheDocument();
    expect(screen.queryByText("Payment received, activating…")).toBeNull();
    sessionStorage.removeItem("alphonso.pro.justPaidAt");
  });

  it("a payment flag older than an hour no longer holds back the paywall", async () => {
    sessionStorage.setItem(
      "alphonso.pro.justPaidAt",
      JSON.stringify({ at: Date.now() - 2 * 3_600_000, user: "u1" }),
    );
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    expect(await screen.findByText("$9.99 a month after the trial")).toBeInTheDocument();
    sessionStorage.removeItem("alphonso.pro.justPaidAt");
  });

  it("when Pro cannot be checked it says so and offers a retry, never the paywall", async () => {
    routes["/api/pro-status"] = status({ error: "entitlement-unavailable" }, 503);
    await renderPage();
    expect(
      await screen.findByText("Couldn't check your subscription. Try again."),
    ).toBeInTheDocument();
    expect(sent.some((s) => s.url.startsWith("/api/pro-offering"))).toBe(false);
    routes["/api/pro-status"] = status(PRO_APP_STORE);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("log")).toBeInTheDocument();
  });

  it("Pro: a typed turn sends text, history, course and level, shows the reply and plays its voice", async () => {
    await renderPage();
    const box = await screen.findByRole("textbox", { name: "Message Hector" });
    await waitFor(() => expect(fetchProgress).toHaveBeenCalled());
    await userEvent.type(box, "Salut Hector{Enter}");
    expect(await screen.findByText(/Comment ça va/)).toBeInTheDocument();
    await userEvent.type(box, "Ça va bien{Enter}");
    await waitFor(() =>
      expect(sent.filter((s) => s.url === "/api/hector-respond")).toHaveLength(2),
    );
    const turns = sent.filter((s) => s.url === "/api/hector-respond").map((s) => s.body);
    expect(turns[0]).toEqual({
      text: "Salut Hector",
      history: [],
      course: "fr",
      cefr_level: "A2",
      voice: "aura-2-hector-fr",
    });
    expect(turns[1]).toEqual({
      text: "Ça va bien",
      history: [
        { role: "user", content: "Salut Hector" },
        { role: "assistant", content: "Bonjour ! Comment ça va ?" },
      ],
      course: "fr",
      cefr_level: "A2",
      voice: "aura-2-hector-fr",
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("Pro: a turn sends Hector's chosen voice for the course, never Alphonso's", async () => {
    sessionUser.current = {
      id: "u1",
      user_metadata: {
        voices: { alphonso: { fr: "aura-2-hector-fr" }, hector: { fr: "aura-2-agathe-fr" } },
      },
    };
    try {
      await renderPage();
      const box = await screen.findByRole("textbox", { name: "Message Hector" });
      await waitFor(() => expect(fetchProgress).toHaveBeenCalled());
      await userEvent.type(box, "Salut Hector{Enter}");
      await waitFor(() =>
        expect(sent.filter((s) => s.url === "/api/hector-respond")).toHaveLength(1),
      );
      const turn = sent.find((s) => s.url === "/api/hector-respond")!.body as { voice: string };
      expect(turn.voice).toBe("aura-2-agathe-fr");
    } finally {
      sessionUser.current = { id: "u1" };
    }
  });

  it("history sent to the server is capped at 40 messages", async () => {
    await renderPage();
    const box = await screen.findByRole("textbox", { name: "Message Hector" });
    for (let i = 0; i < 22; i++) {
      await userEvent.type(box, `turn ${i}{Enter}`);
      await waitFor(() =>
        expect(sent.filter((s) => s.url === "/api/hector-respond")).toHaveLength(i + 1),
      );
    }
    const last = sent.filter((s) => s.url === "/api/hector-respond").at(-1)!.body as {
      history: unknown[];
    };
    expect(last.history).toHaveLength(40);
  });

  it("a 403 not-entitled mid-conversation swaps in the paywall with its own source", async () => {
    routes["/api/hector-respond"] = status({ error: "not-entitled" }, 403);
    await renderPage();
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Message Hector" }),
      "hola{Enter}",
    );
    expect(await screen.findByText("$9.99 a month after the trial")).toBeInTheDocument();
    expect(sent.some((s) => s.url === "/api/pro-offering?source=hector_not_entitled")).toBe(true);
  });

  it("a 503 entitlement-unavailable keeps the learner's words and says it couldn't check", async () => {
    routes["/api/hector-respond"] = status({ error: "entitlement-unavailable" }, 503);
    await renderPage();
    const box = await screen.findByRole("textbox", { name: "Message Hector" });
    await userEvent.type(box, "hola{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't check your subscription. Try again.",
    );
    expect(box).toHaveValue("hola");
  });

  it("when the microphone is unavailable the text box still works", async () => {
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Record a voice message" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "Message Hector" });
    expect(box).toBeEnabled();
    await userEvent.type(box, "salut{Enter}");
    expect(await screen.findByText(/Comment ça va/)).toBeInTheDocument();
  });

  it("App Store Pro is told to manage it on the iPhone; web Pro gets a Manage Subscription link", async () => {
    const first = await renderPage();
    expect(await screen.findByText("Manage it in your iPhone's Settings.")).toBeInTheDocument();
    first.unmount();
    routes["/api/pro-status"] = status(PRO_WEB);
    await renderPage();
    expect(await screen.findByRole("link", { name: "Manage Subscription" })).toHaveAttribute(
      "href",
      "https://billing.example/portal",
    );
  });
});

describe("web Hector in the new look", () => {
  it("hector page shows the mascot art and status pill", async () => {
    const { mascotArt } = await import("../../lib/mascot-poses");
    const players: FakeAudio[] = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        constructor(src: string) {
          super(src);
          players.push(this);
        }
      },
    );
    let answer: (r: Response) => void = () => {};
    routes["/api/hector-respond"] = (() =>
      new Promise<Response>((r) => (answer = r))) as unknown as Handler;
    await renderPage();

    const art = () => screen.getByRole("img", { name: "Hector" });
    expect((await screen.findByRole("img", { name: "Hector" })).getAttribute("src")).toBe(
      mascotArt("hectorIdle").src,
    );
    expect(screen.queryByText("Thinking", { exact: true })).toBeNull();

    await userEvent.type(screen.getByLabelText("Message Hector"), "Bonjour");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Thinking", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(art().getAttribute("src")).toBe(mascotArt("hectorThinking").src));

    answer(Response.json({ reply: "Salut !", audioBase64: btoa("mp3") }));
    expect(await screen.findByText("Speaking", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(art().getAttribute("src")).toBe(mascotArt("hectorSpeaking").src));

    players[players.length - 1].onended?.();
    await waitFor(() => expect(screen.queryByText("Speaking", { exact: true })).toBeNull());
    await waitFor(() => expect(art().getAttribute("src")).toBe(mascotArt("hectorIdle").src));
  });
});

describe("web Hector in his library", () => {
  it("a free learner meets Hector standing in his library above the offer", async () => {
    routes["/api/pro-status"] = status(FREE);
    const { container } = await renderPage();
    // Round 6 (BACKLOG 0.0-bk): the paywall paints Hector in his library itself, in light cream, with no clip.
    const hector = await screen.findByRole("img", { name: "Hector in his library" });
    expect(hector.getAttribute("src")).toBe("/paywall/hector-talk.webp");
    const room = container.querySelector("[data-paywall-room] img");
    expect(room?.getAttribute("src")).toBe("/avatar/scenes/library.webp");
    expect(container.querySelector('[data-scene="hector"] video')).toBeNull();
    expect(container.querySelector("[data-pro-tag]")).not.toBeNull();
  });

  it("a Pro learner talks to Hector in front of the library", async () => {
    const { container } = await renderPage();
    await screen.findByLabelText("Message Hector");
    expect(container.querySelector('[data-scene="hector"]')).not.toBeNull();
  });
});

describe("web Hector as a full-screen call (the setting on, the default)", () => {
  beforeEach(() => {
    localStorage.removeItem("showAlphonsoWhilePractising");
  });

  async function renderCall() {
    await renderPage();
    await screen.findByTestId("call-caption");
  }

  it("is a call with Hector in his own kit, hidden from assistive technology", async () => {
    await renderCall();
    expect(screen.getByText("Hector")).toBeInTheDocument();
    const stage = screen.getByTestId("alphonso-stage");
    expect(stage).toHaveAttribute("aria-hidden", "true");
    for (const img of stage.querySelectorAll("img"))
      expect(img.getAttribute("src")).toMatch(/^\/hector\//);
    expect(stage.querySelector('img[src$="eyes-lowered.webp"]')).not.toBeNull();
    expect(stage.querySelector('img[src*="ear-"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "End the call" })).toHaveAttribute("href", "/learn");
    // Hector has no voice mute and never did.
    expect(screen.queryByRole("button", { name: /Mute voice/ })).toBeNull();
  });

  it("keeps the typed message, the transcript, the report button and the subscription link in the sheet", async () => {
    await renderCall();
    await userEvent.click(screen.getByRole("button", { name: "Show the conversation" }));
    const sheet = await screen.findByRole("dialog", { name: "Conversation" });
    const box = within(sheet).getByRole("textbox", { name: "Message Hector" });
    await userEvent.type(box, "Salut Hector{Enter}");
    expect(await within(sheet).findByText(/Comment ça va/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Report/i })).toBeInTheDocument();
    // App Store Pro: told where to manage it.
    expect(within(sheet).getByText(/iPhone/i)).toBeInTheDocument();
    // The call itself shows Hector's reply as the live caption.
    await userEvent.click(within(sheet).getByRole("button", { name: "Back to call" }));
    expect(screen.getByTestId("call-caption")).toHaveTextContent("Comment ça va");
  });

  it("Hector does not react to right or wrong: his endpoint returns no verdict", async () => {
    await renderCall();
    await userEvent.click(screen.getByRole("button", { name: "Show the conversation" }));
    const sheet = await screen.findByRole("dialog", { name: "Conversation" });
    await userEvent.type(
      within(sheet).getByRole("textbox", { name: "Message Hector" }),
      "Salut{Enter}",
    );
    await within(sheet).findByText(/Comment ça va/);
    await new Promise((r) => setTimeout(r, 200));
    const stage = screen.getByTestId("alphonso-stage");
    // No reaction mouth or raised eyes is ever shown while idle after a reply.
    expect(stage.querySelector('img[src$="mouth-ee.webp"]') as HTMLImageElement).toHaveStyle({
      opacity: "0",
    });
    // The rendered check above cannot see a reaction that jsdom never plays out, so pin the source too: the verdict
    // handed to the call is a constant "none" that no reply ever bumps.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.join(import.meta.dirname, "hector.tsx"), "utf8");
    expect(source).toContain('replyVerdict: { serial: 0, verdict: "none" }');
    expect(source).not.toMatch(/verdict: "(correct|corrected)"/);
  });

  it("Pro gating is unchanged: a free learner still sees the paywall, not the call", async () => {
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    expect(screen.queryByTestId("call-caption")).toBeNull();
  });

  it("with the setting off it is the classic screen, mascot and status pill included", async () => {
    localStorage.setItem("showAlphonsoWhilePractising", "false");
    await renderPage();
    // Wait for something only the classic screen has: the call screen also mounts "Message Hector" (in its closed
    // sheet), so waiting for that box would resolve on either screen.
    expect(await screen.findByText("Your tutor")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hector" })).toBeInTheDocument();
    expect(screen.queryByTestId("alphonso-stage")).toBeNull();
    expect(screen.queryByTestId("call-sheet")).toBeNull();
  });

  it("with the setting off the call stage never flashes up before the stored choice is read", async () => {
    // The in-memory switch still says "on" (the default, or a call earlier in this visit) when the page opens.
    useAvatarPreference.setState({ enabled: true });
    localStorage.setItem("showAlphonsoWhilePractising", "false");
    // Record every stage ever attached, however briefly: a one-frame flash is still a flash.
    let stageMounted = false;
    const scan = (records: MutationRecord[]) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (
            n instanceof Element &&
            (n.matches('[data-testid="alphonso-stage"]') ||
              n.querySelector('[data-testid="alphonso-stage"]'))
          )
            stageMounted = true;
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      await renderPage();
      await screen.findByText("Your tutor");
      scan(observer.takeRecords());
    } finally {
      observer.disconnect();
    }
    expect(stageMounted).toBe(false);
  });
});
