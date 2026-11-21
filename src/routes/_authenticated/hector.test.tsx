// @vitest-environment jsdom
import { shapeTutorReply } from "@/lib/hector-conversation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  installFakeAudioContext,
  room,
  QUIET,
  SPEECH,
} from "../../lib/__testutils__/fake-audio-context";
import { fakeConsentApi, withAiConsent } from "../../lib/__testutils__/ai-consent";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
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
  static instances: FakeAudio[] = [];
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
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
    "/api/hector-respond": status(
      shapeTutorReply({
        requestId: "r",
        sessionId: "s",
        agent: "tutor",
        reply: "Bonjour ! Comment ça va ?",
        audioBase64: btoa("mp3"),
        ttsModel: "m",
        language: "fr",
        llmMs: 1,
        ttsMs: 1,
      }),
    ),
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

describe("web Hector always has a way back (it is full screen, with no tab bar)", () => {
  it("a free learner can close the paywall and land on Learn", async () => {
    navigate.mockReset();
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    await screen.findByText("$9.99 a month after the trial");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/learn" });
  });

  it("the paywall still has its close button when the offer cannot load", async () => {
    routes["/api/pro-status"] = status(FREE);
    routes["/api/pro-offering"] = status({ error: "unavailable" }, 503);
    await renderPage();
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("when Pro cannot be checked there is a link back to Learn", async () => {
    routes["/api/pro-status"] = status({ error: "entitlement-unavailable" }, 503);
    await renderPage();
    await screen.findByText("Couldn't check your subscription. Try again.");
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/learn");
  });

  it("the Pro text chat is a tab root: no back chevron, the Learn tab is the way out", async () => {
    await renderPage();
    await screen.findByRole("log");
    expect(screen.queryByRole("link", { name: "Back to Learn" })).toBeNull();
    expect(
      within(screen.getByRole("navigation")).getByRole("link", { name: "Learn" }),
    ).toHaveAttribute("href", "/learn");
  });
});

describe("web Hector keeps the tab bar, as on iOS and Android", () => {
  const tabBar = () => screen.queryByRole("navigation");

  it("the Pro text chat shows the tab bar with Hector selected", async () => {
    await renderPage();
    await screen.findByRole("log");
    const nav = tabBar();
    expect(nav).not.toBeNull();
    expect(nav).toHaveAccessibleName("Main");
    expect(within(nav!).getByRole("link", { name: "Hector" })).toBeInTheDocument();
    expect(within(nav!).getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
  });

  it("the composer rides above the tab bar in the same dock, so the tabs never cover it", async () => {
    await renderPage();
    await screen.findByRole("log");
    const dock = screen.getByTestId("bottom-dock");
    expect(within(dock).getByLabelText("Message Hector")).toBeInTheDocument();
    expect(dock.querySelector("nav")).not.toBeNull();
  });

  it("the check-failed state shows the tab bar too", async () => {
    routes["/api/pro-status"] = status({ error: "entitlement-unavailable" }, 503);
    await renderPage();
    await screen.findByText("Couldn't check your subscription. Try again.");
    expect(tabBar()).not.toBeNull();
  });

  it("the paywall stays full screen (it has its own close button)", async () => {
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    await screen.findByText("$9.99 a month after the trial");
    expect(tabBar()).toBeNull();
  });

  it("the live call stays full screen, as the native call does", async () => {
    localStorage.setItem("showAlphonsoWhilePractising", "true");
    await renderPage();
    await screen.findByRole("button", { name: /end call/i }).catch(() => undefined);
    expect(tabBar()).toBeNull();
  });
});

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
    // Hector speaks first (hector.greeting.test.tsx): his greeting is the first turn of the history.
    const greeting = "Salut ! Moi, c'est Hector. De quoi tu veux parler aujourd'hui ?";
    await waitFor(() => expect(screen.getByRole("log").textContent).toContain("Moi, c'est Hector"));
    await userEvent.type(box, "Salut Hector{Enter}");
    expect(await screen.findByText(/Comment ça va/)).toBeInTheDocument();
    await userEvent.type(box, "Ça va bien{Enter}");
    await waitFor(() =>
      expect(sent.filter((s) => s.url === "/api/hector-respond")).toHaveLength(2),
    );
    const turns = sent.filter((s) => s.url === "/api/hector-respond").map((s) => s.body);
    expect(turns[0]).toEqual({
      text: "Salut Hector",
      history: [{ role: "assistant", content: greeting }],
      course: "fr",
      cefr_level: "A2",
      voice: "aura-2-hector-fr",
    });
    expect(turns[1]).toEqual({
      text: "Ça va bien",
      history: [
        { role: "assistant", content: greeting },
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
  }, 30_000);

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
    // The old header bar's subscription line now lives in the overflow menu.
    const first = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More about Hector" }));
    expect(await screen.findByText("Manage it in your iPhone's Settings.")).toBeInTheDocument();
    first.unmount();
    routes["/api/pro-status"] = status(PRO_WEB);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More about Hector" }));
    expect(await screen.findByRole("menuitem", { name: "Manage Subscription" })).toHaveAttribute(
      "href",
      "https://billing.example/portal",
    );
  });
});

describe("web Hector in the new look", () => {
  it("the header shows his real cut-out, the course tutor line and a status pill that follows him", async () => {
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

    const header = await screen.findByTestId("hector-header");
    expect(within(header).getByRole("heading", { name: "Hector" })).toBeInTheDocument();
    expect(within(header).getByText("Your French tutor")).toBeInTheDocument();
    // Uncropped: the whole cut-out (contain, bottom edge), not a cover crop.
    const figure = within(header).getByTestId("hector-figure");
    expect(figure.getAttribute("src")).toBe("/hector/base.webp");
    expect(figure.className).toContain("object-contain");
    expect(figure.className).toContain("object-bottom");
    const pill = () => screen.getByTestId("hector-status");
    // Idle: green "Ready", announced.
    await waitFor(() => expect(pill()).toHaveTextContent("Ready"));
    expect(pill()).toHaveAttribute("aria-label", "Hector is ready");

    await userEvent.type(screen.getByLabelText("Message Hector"), "Bonjour");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(pill()).toHaveTextContent("Thinking…"));
    expect(pill()).toHaveAttribute("aria-label", "Hector is thinking");

    answer(
      Response.json(
        shapeTutorReply({
          requestId: "r",
          sessionId: "s",
          agent: "tutor",
          reply: "Salut !",
          audioBase64: btoa("mp3"),
          ttsModel: "m",
          language: "fr",
          llmMs: 1,
          ttsMs: 1,
        }),
      ),
    );
    await waitFor(() => expect(pill()).toHaveTextContent("Speaking…"));

    players[players.length - 1].onended?.();
    await waitFor(() => expect(pill()).toHaveTextContent("Ready"));
  });

  it("the overflow button holds the old header bar's actions and closes on Escape", async () => {
    await renderPage();
    const button = await screen.findByRole("button", { name: "More about Hector" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Hector options" });
    expect(within(menu).getByRole("menuitem", { name: "Settings and voices" })).toHaveAttribute(
      "href",
      "/profile",
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    // Escape hands focus back to the button that opened it.
    expect(button).toHaveFocus();
  });

  it("the menu takes focus on open, moves with the arrow keys, and hides a subscription row with nothing to say", async () => {
    routes["/api/pro-status"] = status({
      pro: true,
      store: null,
      trialEligible: false,
      manageUrl: null,
    });
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More about Hector" }));
    const menu = screen.getByRole("menu", { name: "Hector options" });
    // Only "Settings and voices": there is no empty subscription row.
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveFocus();
    expect(menu.textContent).not.toMatch(/Manage/i);
    await userEvent.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
  });

  it("with a web subscription the manage link is a menu item, and arrows move between the two", async () => {
    routes["/api/pro-status"] = status(PRO_WEB);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "More about Hector" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Manage Subscription", "Settings and voices"]);
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(items[0]).toHaveFocus();
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

  it("a Pro learner talks to Hector under his navy header", async () => {
    await renderPage();
    await screen.findByLabelText("Message Hector");
    expect(screen.getByTestId("hector-header")).toBeInTheDocument();
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
    // The call bar's name, and the hidden page heading.
    expect(screen.getAllByText("Hector")).toHaveLength(2);
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

  it("has one page heading, and every button on it has a name", async () => {
    await renderCall();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Hector",
    ]);
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("aria-label") || b.textContent?.trim()).toBeTruthy();
    }
  });

  it("the transcript for assistive technology calls Hector's turns Hector, never Alphonso", async () => {
    await renderCall();
    await userEvent.click(screen.getByRole("button", { name: "Show the conversation" }));
    const sheet = await screen.findByRole("dialog", { name: "Conversation" });
    await userEvent.type(
      within(sheet).getByRole("textbox", { name: "Message Hector" }),
      "Salut{Enter}",
    );
    await within(sheet).findByText(/Comment ça va/);
    const list = document.querySelector('ul[aria-label="Conversation so far"]')!;
    expect(list.textContent).toContain("Hector: Bonjour");
    expect(list.textContent).not.toContain("Alphonso");
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

  it("with the setting off it is the classic screen, header and status pill included", async () => {
    localStorage.setItem("showAlphonsoWhilePractising", "false");
    await renderPage();
    // Wait for something only the classic screen has: the call screen also mounts "Message Hector" (in its closed
    // sheet), so waiting for that box would resolve on either screen.
    expect(await screen.findByText("Your French tutor")).toBeInTheDocument();
    expect(screen.getByTestId("hector-header")).toBeInTheDocument();
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
      await screen.findByText("Your French tutor");
      scan(observer.takeRecords());
    } finally {
      observer.disconnect();
    }
    expect(stageMounted).toBe(false);
  });
});

describe("web Hector hands-free", () => {
  const NOTE_KEY = "handsFree.safetyNoteSeen.v2";
  const getUserMedia = vi.fn();
  const recorders: { state: string }[] = [];

  beforeEach(() => {
    localStorage.removeItem("showAlphonsoWhilePractising");
    localStorage.removeItem("handsFree.preferred.v1");
    localStorage.removeItem(NOTE_KEY);
    installFakeAudioContext();
    recorders.length = 0;
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
        constructor() {
          recorders.push(this);
        }
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

  const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

  async function openCall() {
    await renderPage();
    await screen.findByTestId("call-caption");
    // His greeting has no voice in this test (no /api/tts route), so it is said and the call is idle.
    await waitFor(() => expect(screen.getByTestId("call-caption")).toHaveTextContent(/Hector/));
  }

  async function turnOn(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Show the conversation" }));
    await user.click(await screen.findByRole("switch", { name: "Hands-free" }));
    const note = await screen.findByRole("dialog", { name: "Talk without holding the button" });
    expect(note).toHaveTextContent(/^Talk without holding the button\s*Hector listens/);
    await user.click(within(note).getByRole("button", { name: "Turn on hands-free" }));
    await user.click(screen.getByRole("button", { name: "Back to call" }));
  }

  it("a Pro learner has the switch, off to start, and the first turn opens the mic by itself once on", async () => {
    const user = userEvent.setup();
    await openCall();
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    await wait(300);
    expect(getUserMedia).not.toHaveBeenCalled();
    await turnOn(user);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recorders[0]?.state).toBe("recording"));
  });

  it("Hector ends the turn after 1.2 s of quiet (shorter than Practice's 2.5 s)", async () => {
    const user = userEvent.setup();
    await openCall();
    await turnOn(user);
    await waitFor(() => expect(recorders[0]?.state).toBe("recording"));
    await wait(500);
    room.rms = SPEECH;
    await wait(700);
    room.rms = QUIET;
    await wait(500);
    expect(recorders[0].state).toBe("recording");
    await waitFor(() => expect(recorders[0].state).toBe("inactive"), { timeout: 1500 });
  }, 15_000);

  it("the Pro gate is kept: a free learner gets the paywall, no call and no switch", async () => {
    routes["/api/pro-status"] = status(FREE);
    await renderPage();
    await screen.findByText("$9.99 a month after the trial");
    expect(screen.queryByRole("switch", { name: "Hands-free" })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("web Hector correction card", () => {
  const getUserMedia = vi.fn();
  const recorders: { state: string }[] = [];
  const cancel = vi.fn();
  const speakCalls: { text: string; lang: string }[] = [];
  const voices: { lang: string }[] = [{ lang: "fr-FR" }];
  const FIX = "Je suis fatigué";

  beforeEach(() => {
    installFakeAudioContext();
    recorders.length = 0;
    speakCalls.length = 0;
    cancel.mockClear();
    FakeAudio.instances.length = 0;
    voices.splice(0, voices.length, { lang: "fr-FR" });
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
        constructor() {
          recorders.push(this);
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.onstop?.();
        }
      },
    );
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal("speechSynthesis", {
      cancel,
      getVoices: () => voices,
      speak: (u: { text: string; lang: string }) => speakCalls.push({ text: u.text, lang: u.lang }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  const correction = { slip: "Je suis fatiguée", fix: FIX, note: "Hector is a man's name." };

  async function sayOne(reply: Record<string, unknown>) {
    routes["/api/hector-respond"] = status(reply);
    await renderPage();
    const box = await screen.findByRole("textbox", { name: "Message Hector" });
    await waitFor(() => expect(screen.getByRole("log").textContent).toContain("Moi, c'est Hector"));
    await userEvent.type(box, "Je suis fatiguée{Enter}");
    await screen.findByText(/Bonjour/);
  }

  it("shows the card under the learner's message when the reply carries a correction", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    const card = await screen.findByTestId("hector-correction");
    expect(card).toHaveTextContent("Almost — one fix");
    // Read aloud as "You said …; better: …" (the arrow is for the eyes only).
    expect(card.textContent).toContain("You said Je suis fatiguée; better: ");
    expect(card).toHaveTextContent(FIX);
    expect(card).toHaveTextContent("Hector is a man's name.");
    expect(within(card).getByRole("button", { name: /Hear it/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    // After the learner's bubble, before Hector's answer.
    const text = screen.getByRole("log").textContent ?? "";
    expect(text.indexOf("Je suis fatiguée")).toBeLessThan(text.indexOf("Almost"));
    expect(text.indexOf("Almost")).toBeLessThan(text.indexOf("Bonjour ! Pourquoi"));
  });

  it("a clean message gets no card", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?" });
    expect(screen.queryByTestId("hector-correction")).not.toBeInTheDocument();
  });

  it("a raw tag in the reply is never shown; a valid one still makes the card", async () => {
    const raw = `Bonjour ! Pourquoi ?\n<correction>{"slip":"a","fix":"b"}</correction>`;
    await sayOne({ reply: raw });
    expect(screen.getByRole("log").textContent).not.toMatch(/<correction|\{"slip"/);
    expect(await screen.findByTestId("hector-correction")).toHaveTextContent(/better:\s*→\s*b/);
  });

  it("a cut-off or malformed block is dropped without a card or a fragment", async () => {
    await sayOne({ reply: 'Bonjour ! Pourquoi ?\n<correction>{"slip":"a","fi' });
    expect(screen.getByRole("log").textContent).not.toMatch(/<correction|slip/);
    expect(screen.queryByTestId("hector-correction")).not.toBeInTheDocument();
  });

  it("the learner's own text is shown as typed, tag and all, and is never parsed", async () => {
    routes["/api/hector-respond"] = status({ reply: "Bonjour ! Pourquoi ?" });
    await renderPage();
    const box = await screen.findByRole("textbox", { name: "Message Hector" });
    await waitFor(() => expect(screen.getByRole("log").textContent).toContain("Moi, c'est Hector"));
    await userEvent.type(box, 'x <correction>{{"slip":"a","fix":"b"}</correction>{Enter}');
    await screen.findByText(/Bonjour/);
    expect(screen.getByRole("log").textContent).toContain(
      '<correction>{"slip":"a","fix":"b"}</correction>',
    );
    expect(screen.queryByTestId("hector-correction")).not.toBeInTheDocument();
  });

  it("the correction is never sent back to the server as history", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "Merci{Enter}");
    await waitFor(() =>
      expect(sent.filter((s) => s.url === "/api/hector-respond")).toHaveLength(2),
    );
    const second = sent.filter((s) => s.url === "/api/hector-respond")[1]!.body as {
      history: Record<string, unknown>[];
    };
    expect(second.history.every((m) => Object.keys(m).sort().join() === "content,role")).toBe(true);
  });

  it("Hear it speaks the fix with the device's voice, in the course language, and makes no request", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    const before = sent.length;
    await userEvent.click(await screen.findByRole("button", { name: /Hear it/ }));
    expect(speakCalls).toEqual([{ text: FIX, lang: "fr-FR" }]);
    expect(sent).toHaveLength(before);
  });

  it("with no voice for the course Hear it is left out; the written fix and Try again stay", async () => {
    voices.splice(0, voices.length, { lang: "en-US" });
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    const card = await screen.findByTestId("hector-correction");
    expect(within(card).queryByRole("button", { name: /Hear it/ })).not.toBeInTheDocument();
    expect(card).toHaveTextContent(FIX);
    expect(within(card).getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("Try again starts a recording, the tap-to-talk path", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await waitFor(() => expect(recorders.some((r) => r.state === "recording")).toBe(true));
  });

  it("Try again puts the cursor in the composer where there is no microphone", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("textbox", { name: "Message Hector" })).toHaveFocus();
  });
  it("Hear it first stops Hector's own reply audio, and is disabled while the mic is open", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction, audio_base64: btoa("mp3") });
    await waitFor(() => expect(FakeAudio.instances.length).toBeGreaterThan(0));
    const reply = FakeAudio.instances[FakeAudio.instances.length - 1]!;
    reply.pause.mockClear();
    await userEvent.click(await screen.findByRole("button", { name: /Hear it/ }));
    expect(reply.pause).toHaveBeenCalled();
    expect(speakCalls).toHaveLength(1);
  });

  it("Try again cancels the device speech before the mic opens, and Hear it is then disabled", async () => {
    await sayOne({ reply: "Bonjour ! Pourquoi ?", correction });
    cancel.mockClear();
    await userEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(cancel).toHaveBeenCalled();
    await waitFor(() => expect(recorders.some((r) => r.state === "recording")).toBe(true));
    expect(await screen.findByRole("button", { name: /Hear it/ })).toBeDisabled();
  });

  it("leaving the screen cancels the fix being spoken", async () => {
    const view = await (async () => {
      routes["/api/hector-respond"] = status(
        shapeTutorReply({
          requestId: "r",
          sessionId: "s",
          agent: "tutor",
          reply: "Bonjour ! Pourquoi ?",
          audioBase64: "",
          ttsModel: "m",
          language: "fr",
          llmMs: 1,
          ttsMs: 1,
          correction,
        }),
      );
      return renderPage();
    })();
    await screen.findByRole("textbox", { name: "Message Hector" });
    cancel.mockClear();
    view.unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
