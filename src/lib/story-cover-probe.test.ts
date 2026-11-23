import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCoverProbe, resolveLinearCovers } from "./story-cover-probe";
import { linearCoverKey } from "./stories";

const URL_A = "https://x.supabase.co/storage/v1/object/public/story-art/en/lucys-morning/cover.jpg";

const ok = () => new Response(null, { status: 200 });
const missing = () => new Response(null, { status: 400 });

describe("linearCoverKey: the convention the content team uploads to", () => {
  it("is <course>/<slug>/cover.jpg, the same folder the branching scene art uses (<course>/<slug>/<nodeId>.jpg)", () => {
    expect(linearCoverKey("en", "lucys-morning")).toBe("en/lucys-morning/cover.jpg");
    expect(linearCoverKey("fr", "ma-famille")).toBe("fr/ma-famille/cover.jpg");
  });
});

describe("the cover existence probe", () => {
  it("sends a HEAD (never downloads the image) and says yes for a 200", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: { method: "HEAD" }) => ok());
    const probe = createCoverProbe({ fetchFn });
    expect(await probe.exists(URL_A)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
  });

  it("says no for a missing object (the library then draws its gradient)", async () => {
    const probe = createCoverProbe({ fetchFn: async () => missing() });
    expect(await probe.exists(URL_A)).toBe(false);
  });

  it("asks once, not once per render: a yes is remembered", async () => {
    const fetchFn = vi.fn(async () => ok());
    const probe = createCoverProbe({ fetchFn });
    await probe.exists(URL_A);
    await probe.exists(URL_A);
    await probe.exists(URL_A);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("remembers a no too, but only for a while, so art uploaded later shows up", async () => {
    let t = 1_000;
    let present = false;
    const fetchFn = vi.fn(async () => (present ? ok() : missing()));
    const probe = createCoverProbe({ fetchFn, now: () => t, missingTtlMs: 60_000 });
    expect(await probe.exists(URL_A)).toBe(false);
    expect(await probe.exists(URL_A)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    present = true;
    t += 30_000;
    expect(await probe.exists(URL_A)).toBe(false); // still inside the window
    t += 31_000;
    expect(await probe.exists(URL_A)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    const fetchFn = vi.fn(async () => ok());
    const probe = createCoverProbe({ fetchFn });
    const all = await Promise.all([probe.exists(URL_A), probe.exists(URL_A), probe.exists(URL_A)]);
    expect(all).toEqual([true, true, true]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("a network failure is 'no cover this time' and is NOT remembered, so the next load tries again", async () => {
    let fail = true;
    const fetchFn = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return ok();
    });
    const probe = createCoverProbe({ fetchFn });
    expect(await probe.exists(URL_A)).toBe(false);
    fail = false;
    expect(await probe.exists(URL_A)).toBe(true);
  });

  it("a server error (5xx) is also not remembered as 'missing'", async () => {
    let status = 503;
    const fetchFn = vi.fn(async () => new Response(null, { status }));
    const probe = createCoverProbe({ fetchFn });
    expect(await probe.exists(URL_A)).toBe(false);
    status = 200;
    expect(await probe.exists(URL_A)).toBe(true);
  });
});

describe("a hung HEAD", () => {
  it("is 'unknown' within the timeout (AbortSignal), is not remembered, and the next call asks again", async () => {
    let calls = 0;
    const fetchFn = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(ok());
      // Never answers until the signal aborts it, like a connection that hangs.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const probe = createCoverProbe({ fetchFn, timeoutMs: 30 });
    const started = Date.now();
    expect(await probe.exists(URL_A)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(await probe.exists(URL_A)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("the host check", () => {
  it("never requests a URL on another host", async () => {
    const fetchFn = vi.fn(async () => ok());
    const probe = createCoverProbe({ fetchFn, allowedHost: "x.supabase.co" });
    expect(
      await probe.exists("https://evil.example/storage/v1/object/public/story-art/a/b/cover.jpg"),
    ).toBe(false);
    expect(await probe.exists("not a url")).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await probe.exists(URL_A)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("an accented slug", () => {
  it("becomes a percent-encoded public URL, and that exact URL is what the probe asks about", async () => {
    const storage = createClient("https://x.supabase.co", "key").storage.from("story-art");
    const url = storage.getPublicUrl(linearCoverKey("fr", "l-\u00e9p\u00e9e")).data.publicUrl;
    expect(url).toBe(
      "https://x.supabase.co/storage/v1/object/public/story-art/fr/l-%C3%A9p%C3%A9e/cover.jpg",
    );
    const fetchFn = vi.fn(async (_u: string, _i: { method: "HEAD" }) => ok());
    await createCoverProbe({ fetchFn }).exists(url);
    expect(fetchFn.mock.calls[0][0]).toBe(url);
  });
});

describe("resolveLinearCovers: how listStories gets its covers", () => {
  const row = (id: string, slug: string, branching = false) => ({
    id,
    course: "en",
    slug,
    branching,
  });
  const urlOf = (course: string, slug: string) =>
    `https://x.supabase.co/story-art/${course}/${slug}/cover.jpg`;

  it("gives a linear story its cover when the probe says it exists, and leaves it out when not", async () => {
    const probe = { exists: async (u: string) => u.includes("has-art") };
    const out = await resolveLinearCovers([row("a", "has-art"), row("b", "no-art")], urlOf, probe);
    expect([...out.entries()]).toEqual([["a", urlOf("en", "has-art")]]);
  });

  it("never asks about a branching story (it keeps its scene art)", async () => {
    const asked: string[] = [];
    const probe = { exists: async (u: string) => (asked.push(u), true) };
    const out = await resolveLinearCovers([row("m", "mona", true), row("l", "lucy")], urlOf, probe);
    expect(asked).toEqual([urlOf("en", "lucy")]);
    expect(out.has("m")).toBe(false);
  });

  it("starts every check before any finishes (in parallel, not one after another)", async () => {
    let started = 0;
    let startedWhenFirstFinished = -1;
    const probe = {
      exists: async () => {
        started += 1;
        await new Promise((r) => setTimeout(r, 10));
        if (startedWhenFirstFinished < 0) startedWhenFirstFinished = started;
        return true;
      },
    };
    await resolveLinearCovers([row("1", "a"), row("2", "b"), row("3", "c")], urlOf, probe);
    expect(startedWhenFirstFinished).toBe(3);
  });

  it("skips a story whose URL cannot be built", async () => {
    const out = await resolveLinearCovers([row("1", "a")], () => null, {
      exists: async () => true,
    });
    expect(out.size).toBe(0);
  });
});
