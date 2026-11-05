import { describe, expect, it, vi } from "vitest";
import { upstreamErrorCode, upstreamErrorResponse } from "./api-response.server";

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

  it("logs the provider, status and a short code, never the body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({
      error: { code: 403, message: "flagged", metadata: { flagged_input: "my private sentence" } },
    });
    const resp = upstreamErrorResponse("openrouter", 403, body);
    expect(spy).toHaveBeenCalledWith("[api] openrouter upstream error (403) code=403");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("my private sentence");
    expect(await resp.text()).not.toContain("flagged");
  });

  it("logs unknown for a non-JSON body and does not echo it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    upstreamErrorResponse("deepgram", 500, "secret internal details");
    expect(spy).toHaveBeenCalledWith("[api] deepgram upstream error (500) code=unknown");
  });
});

describe("upstreamErrorCode", () => {
  it("reads error.code, error.type and err_code, and rejects free text", () => {
    expect(upstreamErrorCode(JSON.stringify({ error: { code: "rate_limited" } }))).toBe(
      "rate_limited",
    );
    expect(upstreamErrorCode(JSON.stringify({ error: { type: "invalid_request" } }))).toBe(
      "invalid_request",
    );
    expect(upstreamErrorCode(JSON.stringify({ err_code: "INVALID_AUTH" }))).toBe("INVALID_AUTH");
    expect(upstreamErrorCode(JSON.stringify({ error: { code: "my private sentence here" } }))).toBe(
      "unknown",
    );
    expect(upstreamErrorCode(JSON.stringify({ error: "plain string" }))).toBe("unknown");
    expect(upstreamErrorCode("")).toBe("unknown");
  });
});
