import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addSecurityHeaders } from "./security-policy";
import {
  STATIC_DIRS,
  STATIC_ROOT_FILES,
  STATIC_SECURITY_HEADERS,
  nitroStaticRoutes,
  staticHeaderRecord,
  vercelHeaderSources,
} from "./static-headers";

const root = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(root, "public");

type VercelJson = {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  [key: string]: unknown;
};
const vercelJson = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as VercelJson;

describe("static-file security headers", () => {
  it("vercel.json carries exactly the shared list, for every static source", () => {
    expect(vercelJson.headers?.map((h) => h.source)).toEqual(vercelHeaderSources());
    for (const rule of vercelJson.headers ?? []) {
      expect(rule.headers).toEqual(STATIC_SECURITY_HEADERS);
    }
  });

  it("vercel.json does not take over build or framework detection", () => {
    const keys = Object.keys(vercelJson).filter((k) => k !== "$schema");
    expect(keys).toEqual(["headers"]);
  });

  it("covers every top-level folder and root file in public/", () => {
    for (const entry of readdirSync(publicDir)) {
      const isDir = statSync(path.join(publicDir, entry)).isDirectory();
      const list: readonly string[] = isDir ? STATIC_DIRS : STATIC_ROOT_FILES;
      expect(list, `public/${entry} has no static security headers`).toContain(entry);
    }
    expect(STATIC_DIRS).toContain("assets");
  });

  it("Nitro routeRules use the same list (one rule per static path)", () => {
    const routes = nitroStaticRoutes();
    expect(routes).toContain("/assets/**");
    expect(routes).toContain("/site.webmanifest");
    expect(routes).toHaveLength(STATIC_DIRS.length + STATIC_ROOT_FILES.length);
  });

  it("HSTS includes subdomains; nosniff and Referrer-Policy match the app responses", () => {
    const record = staticHeaderRecord();
    expect(record["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const app = addSecurityHeaders(
        new Response("ok"),
        new Request("https://learn.example/"),
        "n",
      );
      expect(record["Strict-Transport-Security"]).toBe(
        app.headers.get("strict-transport-security"),
      );
      expect(record["Referrer-Policy"]).toBe(app.headers.get("referrer-policy"));
      expect(record["X-Content-Type-Options"]).toBe(app.headers.get("x-content-type-options"));
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
