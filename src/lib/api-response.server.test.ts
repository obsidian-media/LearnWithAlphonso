import { describe, expect, it, vi } from "vitest";
import { upstreamErrorResponse } from "./api-response.server";

describe("upstreamErrorResponse", () => {
  it("returns a rate-limit-specific message for 429", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resp = upstreamErrorResponse("nvidia", 429, "raw upstream body");
    expect(resp.status).toBe(429);
    expect(await resp.json()).toEqual({ error: "Rate limited, please try again shortly" });
  });

  it("returns a generic message for other statuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resp = upstreamErrorResponse("deepgram", 503, "raw upstream body");
    expect(resp.status).toBe(503);
    expect(await resp.json()).toEqual({ error: "Request failed" });
  });

  it("logs the provider, status, and truncated body without leaking it to the response", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resp = upstreamErrorResponse("nvidia", 500, "secret internal details");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("nvidia upstream error (500)"),
      "secret internal details",
    );
    const body = await resp.text();
    expect(body).not.toContain("secret internal details");
  });
});
