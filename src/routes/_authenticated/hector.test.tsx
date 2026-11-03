// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) } },
}));
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));

const { Route } = await import("./hector");
const { useProgress } = await import("../../lib/progress");

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
const OFFER = {
  price: "$9.99",
  period: "month",
  trialDays: 7,
  purchaseUrl: "https://pay.rev.cat/t/u",
};

class FakeAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  constructor(public src: string) {}
}

beforeEach(() => {
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
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
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
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
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
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
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
    expect(turns[0]).toEqual({ text: "Salut Hector", history: [], course: "fr", cefr_level: "A2" });
    expect(turns[1]).toEqual({
      text: "Ça va bien",
      history: [
        { role: "user", content: "Salut Hector" },
        { role: "assistant", content: "Bonjour ! Comment ça va ?" },
      ],
      course: "fr",
      cefr_level: "A2",
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
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
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
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
