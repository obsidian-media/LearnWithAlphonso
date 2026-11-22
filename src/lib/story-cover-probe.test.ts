import { describe, expect, it, vi } from "vitest";
import { createCoverProbe } from "./story-cover-probe";
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
