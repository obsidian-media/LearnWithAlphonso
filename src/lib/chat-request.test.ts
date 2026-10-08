import { describe, expect, it, vi } from "vitest";
import { postChat } from "./chat-request";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe("postChat", () => {
  it("retries exactly once on 502 empty-reply and returns the second response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "empty-reply" }, 502))
      .mockResolvedValueOnce(json({ content: "Hola" }, 200));
    const res = await postChat({ messages: [] }, { Authorization: "Bearer t" }, fetchImpl);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toEqual(fetchImpl.mock.calls[1][1]);
  });
  it("does not retry a second empty-reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "empty-reply" }, 502));
    const res = await postChat({ messages: [] }, {}, fetchImpl);
    expect(res.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("does not retry any other failure", async () => {
    for (const [body, status] of [
      [{ error: "quota-exceeded" }, 429],
      [{ error: "upstream" }, 502],
      [{}, 500],
    ] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(json(body, status));
      await postChat({}, {}, fetchImpl);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
});
