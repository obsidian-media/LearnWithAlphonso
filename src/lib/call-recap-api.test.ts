import { describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
const { callQualifiesForRecap, fetchCallRecap, fetchCallRecapAttempt, fetchGoalsNote } =
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
    ).toMatchObject({ recap: null, retry: true });
    expect(await attempt((async () => new Response("{}", { status: 502 })) as never)).toMatchObject(
      {
        recap: null,
        retry: true,
      },
    );
    expect(
      await attempt((async () => {
        throw new TypeError("offline");
      }) as never),
    ).toMatchObject({ recap: null, retry: true });
  });
  it("nothing to say, consent off and over the limit are not retryable", async () => {
    expect(await attempt(ok(null))).toMatchObject({ recap: null, retry: false });
    expect(await attempt((async () => new Response("{}", { status: 403 })) as never)).toMatchObject(
      {
        recap: null,
        retry: false,
      },
    );
    expect(await attempt((async () => new Response("{}", { status: 429 })) as never)).toMatchObject(
      {
        recap: null,
        retry: false,
      },
    );
  });
});

describe("the goals line on the memory page", () => {
  it("names the learner's own interests, not an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          profile: { goal: "travel", dailyMinutes: 10, interests: ["music", "food"] },
        }),
      ),
    );
    try {
      const note = await fetchGoalsNote();
      expect(note).toContain("Travel");
      expect(note).toContain("Music");
      expect(note).toContain("food");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("How you spoke rides along with the recap answer", () => {
  const notes = { notes: [{ kind: "full_replies", count: 7, total: 9, previous: 4 }] };
  const attempt = (body: unknown) =>
    fetchCallRecapAttempt({
      callId: CALL,
      messages: call(3),
      fetchImpl: (async () => Response.json(body)) as never,
    });
  it("is carried even when the recap itself is null", async () => {
    expect(await attempt({ recap: null, rehearsalSpeaking: notes })).toEqual({
      recap: null,
      retry: false,
      speaking: notes,
    });
  });
  it("is carried next to a recap", async () => {
    const recap = {
      corrections: [{ said: "a", fixed: "b", why: "c", topic: "t", label: "T" }],
      phrase: null,
      reviewToken: null,
      saved: true,
      reviewCount: 1,
    };
    const r = await attempt({ recap, rehearsalSpeaking: notes });
    expect(r.speaking).toEqual(notes);
    expect(r.recap).toEqual(recap);
  });
  it("is null when absent or malformed", async () => {
    expect((await attempt({ recap: null })).speaking).toBeNull();
    expect((await attempt({ recap: null, rehearsalSpeaking: { notes: "x" } })).speaking).toBeNull();
  });
});

describe("reply timings ride along with the recap request", () => {
  const sent = async (replyLatenciesMs?: number[] | null) => {
    let body: Record<string, unknown> = {};
    await fetchCallRecapAttempt({
      callId: CALL,
      messages: call(3),
      replyLatenciesMs,
      fetchImpl: (async (_u: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        return Response.json({ recap: null });
      }) as never,
    });
    return body;
  };
  it("sends them when they are valid", async () => {
    expect((await sent([5000, 800])).replyLatenciesMs).toEqual([5000, 800]);
  });
  it("omits them when absent or not acceptable, so an old server and a bad list are unaffected", async () => {
    for (const v of [undefined, null, [], [-1], [60001], Array.from({ length: 61 }, () => 1)])
      expect(await sent(v as never)).not.toHaveProperty("replyLatenciesMs");
  });
});
