import { describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
const { callQualifiesForRecap, fetchCallRecap, fetchCallRecapAttempt } =
  await import("./call-recap-api");

const call = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ role: "user" as const, content: `u${i}` })).flatMap(
    (m) => [m, { role: "assistant" as const, content: "ok" }],
  );
const CALL = "00000000-0000-4000-8000-0000000000c1";
const ok = (recap: unknown) => (async () => Response.json({ recap })) as unknown as typeof fetch;

describe("when the web sends a call for a recap", () => {
  it("only a call with 3 or more learner replies qualifies, and nothing is sent otherwise", async () => {
    expect(callQualifiesForRecap(call(2))).toBe(false);
    expect(callQualifiesForRecap(call(3))).toBe(true);
    const f = vi.fn();
    expect(
      await fetchCallRecap({ callId: CALL, messages: call(2), fetchImpl: f as never }),
    ).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("posts the whole call with the session header and returns a clean recap", async () => {
    const f = vi.fn(
      ok({
        corrections: [{ said: "a", fixed: "b", why: "c", topic: "t", label: "T" }],
        phrase: null,
        reviewToken: null,
        saved: false,
        reviewCount: 1,
      }),
    );
    const r = await fetchCallRecap({ callId: CALL, messages: call(3), fetchImpl: f as never });
    expect(r?.corrections).toHaveLength(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/call-recap");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer t" });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ callId: CALL });
    expect(JSON.parse((init as RequestInit).body as string).messages).toHaveLength(6);
  });
  it.each([
    ["no recap", ok(null)],
    ["an empty recap", ok({ corrections: [], phrase: null })],
    [
      "a refusal (consent, quota, off)",
      (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch,
    ],
    [
      "offline",
      (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
    ],
  ])("%s hides the recap (null), never throws", async (_n, f) => {
    expect(await fetchCallRecap({ callId: CALL, messages: call(3), fetchImpl: f })).toBeNull();
  });
});

describe("when a recap attempt fails the screen can offer Try again", () => {
  const attempt = (f: typeof fetch) =>
    fetchCallRecapAttempt({ callId: CALL, messages: call(3), fetchImpl: f });
  it("the server's retry flag, a server error and being offline are retryable", async () => {
    expect(
      await attempt((async () => Response.json({ recap: null, retry: true })) as never),
    ).toEqual({ recap: null, retry: true });
    expect(await attempt((async () => new Response("{}", { status: 502 })) as never)).toEqual({
      recap: null,
      retry: true,
    });
    expect(
      await attempt((async () => {
        throw new TypeError("offline");
      }) as never),
    ).toEqual({ recap: null, retry: true });
  });
  it("nothing to say, consent off and over the limit are not retryable", async () => {
    expect(await attempt(ok(null))).toEqual({ recap: null, retry: false });
    expect(await attempt((async () => new Response("{}", { status: 403 })) as never)).toEqual({
      recap: null,
      retry: false,
    });
    expect(await attempt((async () => new Response("{}", { status: 429 })) as never)).toEqual({
      recap: null,
      retry: false,
    });
  });
});
