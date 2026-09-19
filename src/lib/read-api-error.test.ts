import { describe, expect, it } from "vitest";
import { readApiError } from "./read-api-error";

describe("readApiError", () => {
  it("extracts the error field from a JSON body", async () => {
    const resp = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    expect(await readApiError(resp)).toBe("Not found");
  });

  it("falls back to the raw text for JSON without an error field", async () => {
    const resp = new Response(JSON.stringify({ ok: false }), { status: 500 });
    expect(await readApiError(resp)).toBe(JSON.stringify({ ok: false }));
  });

  it("falls back to raw text when the body isn't JSON", async () => {
    const resp = new Response("Bad gateway", { status: 502 });
    expect(await readApiError(resp)).toBe("Bad gateway");
  });

  it("returns an empty string for an empty body", async () => {
    const resp = new Response("", { status: 500 });
    expect(await readApiError(resp)).toBe("");
  });

  it("returns an empty string when reading the body throws", async () => {
    const resp = { text: () => Promise.reject(new Error("stream error")) } as Response;
    expect(await readApiError(resp)).toBe("");
  });
});
