import { describe, expect, it, vi } from "vitest";
import { checkAll, probeUrl, summarize, type FetchLike } from "./link-check";

const res = (status: number, type = "image/jpeg") =>
  new Response(null, { status, headers: { "content-type": type } });
const U =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd";

describe("probeUrl", () => {
  it("passes a 200 image on HEAD", async () => {
    expect(await probeUrl(U, async () => res(200))).toMatchObject({
      ok: true,
      status: 200,
      method: "HEAD",
    });
  });

  it("fails a 200 that is not an image (an HTML error page)", async () => {
    const r = await probeUrl(U, async () => res(200, "text/html"));
    expect(r).toMatchObject({ ok: false, status: 200 });
    expect(r.detail).toContain("text/html");
  });

  it("fails a 404", async () => {
    expect(await probeUrl(U, async () => res(404, "application/json"))).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("falls back to a 1-byte ranged GET when HEAD is not allowed", async () => {
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) =>
      init.method === "HEAD" ? res(405) : res(206),
    );
    expect(await probeUrl(U, fetchImpl)).toMatchObject({ ok: true, status: 206, method: "GET" });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
  });

  it("fails a redirect", async () => {
    expect(await probeUrl(U, async () => res(301, ""))).toMatchObject({ ok: false, status: 301 });
  });

  it("fails a network error with its message", async () => {
    const r = await probeUrl(U, async () => {
      throw new Error("ECONNRESET");
    });
    expect(r).toMatchObject({ ok: false, status: null, detail: "ECONNRESET" });
  });

  it("retries rate-limited and transient server responses before accepting a valid image", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(res(200));

    await expect(probeUrl(U, fetchImpl)).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns a persistent rate limit as a failure after the bounded retries", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "0" } }));

    await expect(probeUrl(U, fetchImpl)).resolves.toMatchObject({
      ok: false,
      status: 429,
      detail: 'status 429, content-type "", retry-after "0"',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("honors an HTTP-date Retry-After while capping the delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
    try {
      const fetchImpl = vi
        .fn<FetchLike>()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 429,
            headers: { "retry-after": "Mon, 19 Oct 2026 00:01:00 GMT" },
          }),
        )
        .mockResolvedValueOnce(res(200));
      const result = probeUrl(U, fetchImpl);
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(result).resolves.toMatchObject({ ok: true, status: 200 });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkAll / summarize", () => {
  it("checks every URL, in order, never above the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = async (u: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return u.endsWith("bad") ? res(404) : res(200);
    };
    const urls = ["a", "b", "c", "bad", "e"].map((s) => `${U}${s}`);
    const results = await checkAll(urls, { concurrency: 2, fetchImpl });
    expect(results.map((r) => r.url)).toEqual(urls);
    expect(peak).toBeLessThanOrEqual(2);
    const s = summarize(results);
    expect(s.ok).toBe(4);
    expect(s.failed.map((f) => f.url)).toEqual([`${U}bad`]);
  });

  it("summarize counts nothing as ok for an empty list", () => {
    expect(summarize([])).toEqual({ ok: 0, failed: [] });
  });
});
