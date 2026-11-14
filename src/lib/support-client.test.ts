import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));

const {
  SupportError,
  fetchConversation,
  mergeMessages,
  requestSupportHandoff,
  sendSupportMessage,
} = await import("./support-client");

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const msg = (id: number, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  body: `m${id}`,
  at: "2026-11-14T10:00:00Z",
  ...extra,
});
const CID = "20000000-0000-4000-8000-000000000001";

async function kindOf(p: Promise<unknown>) {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof SupportError ? e.kind : "other";
  }
}

describe("the conversation read", () => {
  it("returns status, unread, availability and messages, with the session's bearer token", async () => {
    const f = vi.fn(() =>
      json(200, { status: "open", unread: 1, aiAvailable: false, messages: [msg(1, "you")] }),
    );
    const c = await fetchConversation(f as unknown as typeof fetch);
    expect(c).toMatchObject({ status: "open", unread: 1, aiAvailable: false });
    expect(c.messages[0]).toMatchObject({ id: 1, kind: "you", link: null });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/support/conversation");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("a link survives only on an AI message and only if it is on the allow-list", async () => {
    const f = vi.fn(() =>
      json(200, {
        status: "ai",
        unread: 0,
        aiAvailable: true,
        messages: [
          msg(1, "ai", { link: "subscription" }),
          msg(2, "ai", { link: "https://evil.example" }),
          msg(3, "ai", { link: "nope" }),
          msg(4, "support", { link: "settings" }),
          msg(5, "you", { link: "league" }),
        ],
      }),
    );
    const c = await fetchConversation(f as unknown as typeof fetch);
    expect(c.messages.map((m) => m.link)).toEqual(["subscription", null, null, null, null]);
  });

  it("a bad shape or a server error is `failed`; a network error is `offline`", async () => {
    expect(await kindOf(fetchConversation((() => json(200, { status: "weird" })) as never))).toBe(
      "failed",
    );
    expect(await kindOf(fetchConversation((() => json(500, { error: "x" })) as never))).toBe(
      "failed",
    );
    expect(
      await kindOf(
        fetchConversation((() => Promise.reject(new TypeError("Failed to fetch"))) as never),
      ),
    ).toBe("offline");
  });
});

describe("sending", () => {
  let f: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    f = vi.fn();
  });

  it("posts the text and the client id, nothing else", async () => {
    f.mockImplementation(() =>
      json(200, { status: "ai", messages: [msg(2, "you"), msg(3, "ai")] }),
    );
    const u = await sendSupportMessage({ text: "hi", clientId: CID }, f as never);
    expect(u.messages.map((m) => m.id)).toEqual([2, 3]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/support/message");
    expect(JSON.parse(String(init.body))).toEqual({ text: "hi", clientId: CID });
  });

  it("maps 503 support-unreachable to `unreachable` (the message is saved)", async () => {
    f.mockImplementation(() => json(503, { error: "support-unreachable", message: "x" }));
    expect(await kindOf(sendSupportMessage({ text: "hi", clientId: CID }, f as never))).toBe(
      "unreachable",
    );
  });

  it("maps 429 support-message-limit to the daily or the conversation limit", async () => {
    f.mockImplementation(() => json(429, { error: "support-message-limit", which: "daily" }));
    expect(await kindOf(sendSupportMessage({ text: "hi", clientId: CID }, f as never))).toBe(
      "dailyLimit",
    );
    f.mockImplementation(() =>
      json(429, { error: "support-message-limit", which: "conversation" }),
    );
    expect(await kindOf(sendSupportMessage({ text: "hi", clientId: CID }, f as never))).toBe(
      "conversationLimit",
    );
  });

  it("any other failure (500, 429 with another code, 503 with another code) is `failed`", async () => {
    for (const [s, b] of [
      [500, { error: "boom" }],
      [429, { error: "ai-quota" }],
      [503, { error: "other" }],
    ] as const) {
      f.mockImplementation(() => json(s, b));
      expect(await kindOf(sendSupportMessage({ text: "hi", clientId: CID }, f as never))).toBe(
        "failed",
      );
    }
  });

  it("a thrown fetch is `offline`", async () => {
    f.mockImplementation(() => Promise.reject(new TypeError("down")));
    expect(await kindOf(sendSupportMessage({ text: "hi", clientId: CID }, f as never))).toBe(
      "offline",
    );
  });
});

describe("the hand-off", () => {
  it("posts to /api/support/handoff and returns the whole conversation", async () => {
    const f = vi.fn(() =>
      json(200, { status: "new", messages: [msg(1, "you"), msg(2, "system")] }),
    );
    const u = await requestSupportHandoff(f as never);
    expect(u.status).toBe("new");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/support/handoff");
  });
});

describe("merging messages", () => {
  it("unions by id, newer copy wins, oldest first", () => {
    const a = { id: 2, kind: "you", body: "old", at: "t", link: null } as const;
    const b = { id: 1, kind: "ai", body: "x", at: "t", link: null } as const;
    const merged = mergeMessages([a], [b, { ...a, body: "new" }]);
    expect(merged.map((m) => `${m.id}:${m.body}`)).toEqual(["1:x", "2:new"]);
  });
});
