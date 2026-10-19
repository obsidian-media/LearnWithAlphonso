import { afterEach, describe, expect, it } from "vitest";
import {
  addSecurityHeaders,
  contentSecurityPolicy,
  createCspNonce,
  requestWithCspNonce,
} from "./security-policy";

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.SUPABASE_URL;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
});

describe("security policy", () => {
  it("creates a cryptographically random nonce and overwrites untrusted request input", async () => {
    const first = createCspNonce();
    const second = createCspNonce();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const request = new Request("https://app.example/api", {
      headers: { "x-app-csp-nonce": "attacker-controlled" },
    });
    expect((await requestWithCspNonce(request, first)).headers.get("x-app-csp-nonce")).toBe(first);
  });

  it("preserves request method and body while adding the nonce", async () => {
    const request = new Request("https://app.example/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    const secured = await requestWithCspNonce(request, "server-nonce");
    expect(secured.method).toBe("POST");
    expect(await secured.json()).toEqual({ value: 1 });
    expect(secured.headers.get("x-app-csp-nonce")).toBe("server-nonce");
  });

  it("limits scripts to same-origin and the request nonce, while allowing only configured Supabase endpoints", () => {
    const policy = contentSecurityPolicy("nonce-value", "https://project.supabase.co");
    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(
      policy.split("; ").find((directive) => directive.startsWith("script-src")),
    ).not.toContain("unsafe-inline");
    expect(policy).toContain(
      "connect-src 'self' https://project.supabase.co wss://project.supabase.co",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy("n", "not-a-url")).not.toContain("not-a-url");
    expect(contentSecurityPolicy("n", "http://localhost:54321")).not.toContain("localhost");
  });

  it("applies CSP in production and only sends HSTS on HTTPS responses", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    const response = new Response("ok");
    const https = addSecurityHeaders(response, new Request("https://app.example/"), "nonce");
    expect(https.headers.get("content-security-policy")).toContain("nonce-nonce");
    expect(https.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(https.headers.get("x-frame-options")).toBe("DENY");

    const http = addSecurityHeaders(response, new Request("http://localhost/"), "nonce");
    expect(http.headers.get("strict-transport-security")).toBeNull();
  });
});
