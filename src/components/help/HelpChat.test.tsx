// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  SupportError,
  type SupportConversation,
  type SupportMessage,
  type SupportUpdate,
} from "@/lib/support-client";
import type { HelpClient } from "./useHelpChat";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { HelpChat } = await import("./HelpChat");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = new Date().toISOString();
const m = (id: number, kind: SupportMessage["kind"], body: string, link: unknown = null) =>
  ({ id, kind, body, at: NOW, link }) as SupportMessage;

function conv(over: Partial<SupportConversation> = {}): SupportConversation {
  return { status: "none", unread: 0, aiAvailable: true, messages: [], ...over };
}

function fake(initial: SupportConversation, over: Partial<HelpClient> = {}) {
  const client = {
    fetchConversation: vi.fn(async () => initial),
    send: vi.fn(async (): Promise<SupportUpdate> => ({ status: "ai", messages: [] })),
    handoff: vi.fn(async (): Promise<SupportUpdate> => ({ status: "new", messages: [] })),
    ...over,
  };
  return client as unknown as HelpClient & Record<keyof HelpClient, Mock>;
}

async function open(
  c: SupportConversation,
  props: { aiDeclined?: boolean; online?: boolean } = {},
  over: Partial<HelpClient> = {},
) {
  const client = fake(c, over);
  render(<HelpChat client={client} {...props} />);
  await waitFor(() => expect(screen.queryByText("Loading your messages")).toBeNull());
  return client;
}

const box = () => screen.getByRole("textbox");
const sendButton = () => screen.getByRole("button", { name: "Send" });

describe("first open", () => {
  it("AI on: says it is an AI, lists the starters, keeps Talk to a person in the header", async () => {
    await open(conv());
    expect(screen.getByRole("heading", { name: "How can I help?" })).toBeInTheDocument();
    expect(screen.getByText("You are chatting with an AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to a person" })).toBeEnabled();
    expect(screen.getAllByRole("button").filter((b) => b.closest("[data-starters]"))).toHaveLength(
      7,
    );
    expect(screen.getByText(/^Answers can be wrong/)).toBeInTheDocument();
  });

  it("a starter fills the box and never sends", async () => {
    const client = await open(conv());
    await userEvent.click(screen.getByRole("button", { name: "Streaks" }));
    expect(box()).toHaveValue("Streaks");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("AI off (the launch state): no AI label, no starters, replies come from a person", async () => {
    await open(conv({ aiAvailable: false }));
    expect(screen.getByRole("heading", { name: "Write to us" })).toBeInTheDocument();
    expect(screen.getByText("Replies come from a person")).toBeInTheDocument();
    expect(screen.queryByText("You are chatting with an AI")).toBeNull();
    expect(document.querySelector("[data-starters]")).toBeNull();
    expect(screen.getByText(/^Tell us what happened/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to a person" })).toBeEnabled();
  });

  it("a learner who turned AI features off is told why a person answers", async () => {
    await open(conv(), { aiDeclined: true });
    expect(screen.getByText("AI answers are off for you")).toBeInTheDocument();
    expect(document.querySelector("[data-starters]")).toBeNull();
  });
});

describe("speakers", () => {
  it("AI, person and learner bubbles carry text labels, not only colour", async () => {
    await open(
      conv({
        status: "waiting_learner",
        messages: [
          m(1, "you", "Pro is missing"),
          m(2, "ai", "Tap Restore."),
          m(3, "system", "A person will reply here."),
          m(4, "support", "Which sign-in did you use?"),
        ],
        unread: 1,
      }),
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    const ai = document.querySelector('[data-kind="ai"]') as HTMLElement;
    expect(within(ai).getByText("Alphonso AI")).toBeInTheDocument();
    expect(within(ai).getByText("AI")).toBeInTheDocument();
    const person = document.querySelector('[data-kind="support"]') as HTMLElement;
    expect(within(person).getByText("Alphonso support")).toBeInTheDocument();
    expect(within(person).getByText("Person")).toBeInTheDocument();
    expect(document.querySelector('[data-kind="system"]')).toHaveTextContent(
      "A person will reply here.",
    );
    expect(screen.getByText("Waiting for your reply")).toBeInTheDocument();
    // Unread count shows as the New reply divider before the person's reply.
    expect(document.querySelector('[data-divider="new"]')).toHaveTextContent("New reply");
  });

  it("learner and AI text is shown as text, never as HTML", async () => {
    await open(
      conv({ messages: [m(1, "you", "<img src=x onerror=alert(1)>"), m(2, "ai", "<b>hi</b>")] }),
    );
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByText("<b>hi</b>")).toBeInTheDocument();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("the link chip", () => {
  it("an allowed id opens that app screen through a fixed path", async () => {
    await open(conv({ status: "ai", messages: [m(1, "ai", "Tap Restore.", "subscription")] }));
    const chip = screen.getByRole("link", { name: /Open the subscription screen/ });
    expect(chip).toHaveAttribute("href", "/hector");
  });

  it("an unknown id, or a link on a message that is not from the AI, renders no link", async () => {
    await open(
      conv({
        status: "ai",
        messages: [
          m(1, "ai", "Bad one", "https://evil.example"),
          m(2, "ai", "Worse", "javascript:alert(1)"),
          m(3, "support", "Staff text", "settings"),
          m(4, "you", "My text", "league"),
        ],
      }),
    );
    expect(document.querySelector("[data-support-link]")).toBeNull();
    expect(screen.queryByRole("link", { name: /Open/ })).toBeNull();
  });
});

describe("ticket states", () => {
  it.each([
    ["new", "With our team", "Add something"],
    ["open", "With our team", "Add something"],
    ["waiting_learner", "Waiting for your reply", "Reply to Alphonso support"],
    ["solved", "Solved", "Still need help? Write here"],
  ] as const)("%s shows %s and the %s box", async (status, title, placeholder) => {
    await open(conv({ status, messages: [m(1, "you", "hello")] }));
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(box()).toHaveAttribute("placeholder", placeholder);
  });

  it("solved says what writing does", async () => {
    await open(
      conv({ status: "solved", messages: [m(1, "system", "This chat was marked solved.")] }),
    );
    expect(screen.getByText(/Writing within 7 days reopens this chat/)).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("sends with a client id, clears the box, and shows the answer", async () => {
    const send = vi.fn(async () => ({
      status: "ai" as const,
      messages: [m(1, "you", "Pro is missing"), m(2, "ai", "Tap Restore.", "subscription")],
    }));
    await open(conv(), {}, { send });
    await userEvent.type(box(), "Pro is missing");
    await userEvent.click(sendButton());
    await waitFor(() => expect(screen.getByText("Tap Restore.")).toBeInTheDocument());
    const arg = (send.mock.calls[0] as unknown as [{ text: string; clientId: string }])[0];
    expect(arg.text).toBe("Pro is missing");
    expect(arg.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(box()).toHaveValue("");
    expect(screen.getByText(/· Sent/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the subscription screen/ })).toBeInTheDocument();
  });

  it("Enter sends and Shift+Enter does not", async () => {
    const client = await open(conv());
    await userEvent.type(box(), "one");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}two");
    expect(client.send).not.toHaveBeenCalled();
    expect(box()).toHaveValue("one\ntwo");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
    expect((client.send.mock.calls[0] as unknown as [{ text: string }])[0].text).toBe("one\ntwo");
  });

  it("Send is off until there is text", async () => {
    await open(conv());
    expect(sendButton()).toBeDisabled();
    await userEvent.type(box(), "  ");
    expect(sendButton()).toBeDisabled();
    await userEvent.type(box(), "hi");
    expect(sendButton()).toBeEnabled();
  });

  it("shows the AI as writing while an answer is pending (AI on only)", async () => {
    let finish: (u: SupportUpdate) => void = () => {};
    const send = vi.fn(() => new Promise<SupportUpdate>((r) => (finish = r)));
    await open(conv(), {}, { send });
    await userEvent.type(box(), "hello");
    await userEvent.click(sendButton());
    const typing = await waitFor(() => {
      const el = document.querySelector("[data-typing]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(typing).toHaveTextContent("is writing");
    expect(sendButton()).toBeDisabled();
    await act(async () => finish({ status: "ai", messages: [m(1, "you", "hello")] }));
    expect(document.querySelector("[data-typing]")).toBeNull();
  });

  it("with AI off no AI is shown writing", async () => {
    let finish: (u: SupportUpdate) => void = () => {};
    const send = vi.fn(() => new Promise<SupportUpdate>((r) => (finish = r)));
    await open(conv({ aiAvailable: false }), {}, { send });
    await userEvent.type(box(), "hello");
    await userEvent.click(sendButton());
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(document.querySelector("[data-typing]")).toBeNull();
    await act(async () => finish({ status: "new", messages: [m(1, "you", "hello")] }));
  });
});

describe("errors keep the message", () => {
  it("unreachable: the message stays in the chat as Saved, Try again resends the SAME text and client id", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new SupportError("unreachable"))
      .mockResolvedValueOnce({
        status: "new",
        messages: [m(5, "you", "My streak reset"), m(6, "system", "A person will reply here.")],
      });
    await open(conv(), {}, { send });
    await userEvent.type(box(), "My streak reset");
    await userEvent.click(sendButton());
    expect(
      await screen.findByText(/We couldn't reach support\. Your message is saved/),
    ).toBeInTheDocument();
    expect(screen.getByText("My streak reset")).toBeInTheDocument();
    expect(screen.getByText(/· Saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const [first, second] = send.mock.calls.map((c) => c[0] as { text: string; clientId: string });
    expect(second).toEqual(first);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getAllByText("My streak reset")).toHaveLength(1);
    expect(screen.getByText("With our team")).toBeInTheDocument();
  });

  it("another failure marks the message Not sent and still offers Try again", async () => {
    const send = vi.fn().mockRejectedValue(new SupportError("failed"));
    await open(conv(), {}, { send });
    await userEvent.type(box(), "hello");
    await userEvent.click(sendButton());
    expect(await screen.findByText("Could not send your message. Try again.")).toBeInTheDocument();
    expect(screen.getByText(/· Not sent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("the daily limit closes the box for today with the sleepy pose and the reason", async () => {
    const send = vi.fn().mockRejectedValue(new SupportError("dailyLimit"));
    await open(conv({ status: "open", messages: [m(1, "you", "earlier")] }), {}, { send });
    await userEvent.type(box(), "one more");
    await userEvent.click(sendButton());
    expect(
      await screen.findByText(
        "You have reached today's limit of messages to Help. Try again tomorrow.",
      ),
    ).toBeInTheDocument();
    expect(box()).toBeDisabled();
    expect(box()).toHaveAttribute("placeholder", "Come back tomorrow to write again");
    expect(screen.getByText("Limit: 50 messages a day.")).toBeInTheDocument();
    expect(document.querySelector('[data-limit="daily"] img')).toHaveAttribute(
      "src",
      "/mascots/alphonso-sleepy-night.webp",
    );
  });

  it("a full conversation says so and closes the box", async () => {
    const send = vi.fn().mockRejectedValue(new SupportError("conversationLimit"));
    await open(conv({ status: "open", messages: [m(1, "you", "earlier")] }), {}, { send });
    await userEvent.type(box(), "more");
    await userEvent.click(sendButton());
    expect(await screen.findByText(/reached its message limit/)).toBeInTheDocument();
    expect(box()).toHaveAttribute("placeholder", "This chat is full");
    expect(box()).toBeDisabled();
  });

  it("a failed load shows the message and Try again reloads", async () => {
    const fetchConversation = vi
      .fn()
      .mockRejectedValueOnce(new SupportError("failed"))
      .mockResolvedValue(conv({ aiAvailable: false }));
    render(<HelpChat client={fake(conv(), { fetchConversation })} />);
    expect(await screen.findByText("Could not load your messages.")).toBeInTheDocument();
    expect(box()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Write to us" })).toBeInTheDocument();
  });
});

describe("offline", () => {
  it("replaces the mode line, turns Send off and keeps the draft", async () => {
    const client = await open(conv({ status: "open", messages: [m(1, "you", "hi")] }), {
      online: false,
    });
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.queryByText("With our team")).toBeNull();
    fireEvent.change(box(), { target: { value: "Also, my phone number" } });
    expect(box()).toHaveValue("Also, my phone number");
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(client.send).not.toHaveBeenCalled();
    expect(screen.getByText("Your draft is kept on this device.")).toBeInTheDocument();
  });
});

describe("Talk to a person", () => {
  it("hands over and shows the ticket", async () => {
    const handoff = vi.fn(async () => ({
      status: "new" as const,
      messages: [m(1, "system", "A person will reply here.")],
    }));
    await open(conv(), {}, { handoff });
    await userEvent.click(screen.getByRole("button", { name: "Talk to a person" }));
    expect(await screen.findByText("With our team")).toBeInTheDocument();
    expect(screen.getByText("A person will reply here.")).toBeInTheDocument();
    expect(handoff).toHaveBeenCalledTimes(1);
  });

  it("a failed hand-off says so and can be retried", async () => {
    const handoff = vi
      .fn()
      .mockRejectedValueOnce(new SupportError("failed"))
      .mockResolvedValueOnce({
        status: "new",
        messages: [m(1, "system", "A person will reply here.")],
      });
    await open(conv(), {}, { handoff });
    await userEvent.click(screen.getByRole("button", { name: "Talk to a person" }));
    expect(
      await screen.findByText("We couldn't reach support. Try again in a moment."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("With our team")).toBeInTheDocument();
  });
});

describe("polling", () => {
  it("polls every 20 s while a person has the chat and shows a new reply with the divider", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchConversation = vi
      .fn()
      .mockResolvedValueOnce(conv({ status: "new", messages: [m(1, "you", "hi")] }))
      .mockResolvedValue(
        conv({
          status: "waiting_learner",
          messages: [m(1, "you", "hi"), m(2, "support", "Hello, which sign-in?")],
        }),
      );
    render(<HelpChat client={fake(conv(), { fetchConversation })} />);
    await screen.findByText("With our team");
    expect(fetchConversation).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000);
    });
    expect(fetchConversation).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(fetchConversation).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Hello, which sign-in?")).toBeInTheDocument();
    expect(screen.getByText("Waiting for your reply")).toBeInTheDocument();
    expect(document.querySelector('[data-divider="new"]')).not.toBeNull();
  });

  it("pauses while the tab is hidden and refetches when it becomes visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchConversation = vi.fn(async () =>
      conv({ status: "new", messages: [m(1, "you", "hi")] }),
    );
    const setHidden = (h: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    render(<HelpChat client={fake(conv(), { fetchConversation })} />);
    await screen.findByText("With our team");
    expect(fetchConversation).toHaveBeenCalledTimes(1);
    try {
      setHidden(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(65_000);
      });
      expect(fetchConversation).toHaveBeenCalledTimes(1);
      await act(async () => {
        setHidden(false);
      });
      expect(fetchConversation).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_500);
      });
      expect(fetchConversation).toHaveBeenCalledTimes(3);
    } finally {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    }
  });

  it("does not poll while the AI has the chat", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchConversation = vi.fn(async () =>
      conv({ status: "ai", messages: [m(1, "you", "hi"), m(2, "ai", "Hello")] }),
    );
    render(<HelpChat client={fake(conv(), { fetchConversation })} />);
    await screen.findByText("Hello");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    expect(fetchConversation).toHaveBeenCalledTimes(1);
  });
});
