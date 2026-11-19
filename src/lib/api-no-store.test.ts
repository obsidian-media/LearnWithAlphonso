import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { noStoreJson } from "./api-json";

/**
 * Every authenticated JSON answer from /api/* carries Cache-Control: no-store. The helper (api-json.ts) is the one way
 * a route builds JSON; this reads each route's source (TanStack does not expose a route's responses at runtime) and
 * fails if one builds JSON another way, so a new route that forgets cannot pass.
 */
const ROUTES = path.resolve(import.meta.dirname, "../routes/api");
/** Shared modules whose responses reach the routes above (quota, consent, upstream errors, speech budget, Help chat). */
const HELPERS = [
  "ai-consent.server.ts",
  "ai-quota-response.ts",
  "api-response.server.ts",
  "stt-audio-budget.server.ts",
  "support-chat-runtime.server.ts",
].map((f) => path.resolve(import.meta.dirname, f));

/**
 * Not authenticated learner JSON: the public app config (cached for five minutes on purpose) and the routes that
 * authenticate with a shared secret and set their own no-store (internal/), plus the demo-code route, whose
 * `new Response` calls each name no-store (checked below like tts.ts).
 */
const PUBLIC = new Set(["app-config.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "internal" ? [] : routeFiles(full);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [full] : [];
  });
}
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** What is wrong with a source, as readable lines (empty = fine). */
function noStoreViolations(src: string): string[] {
  const code = strip(src);
  const problems: string[] = [];
  const bare = code.match(/\bResponse\.json\(/g)?.length ?? 0;
  if (bare > 0) problems.push(`${bare} call(s) to Response.json( (use noStoreJson)`);
  const raw = code.match(/new Response\(/g)?.length ?? 0;
  const named = code.match(/["']Cache-Control["']:\s*["']no-store["']/g)?.length ?? 0;
  if (raw > named) problems.push(`${raw} new Response( but only ${named} no-store header(s)`);
  return problems;
}

describe("every authenticated API answer is no-store", () => {
  const files = routeFiles(ROUTES).filter((f) => !PUBLIC.has(path.basename(f)));

  it("covers the routes (guards the guard: an empty list would pass everything)", () => {
    expect(files.length).toBeGreaterThan(15);
    const names = files.map((f) => path.basename(f));
    for (const n of [
      "chat.ts",
      "stt.ts",
      "tts.ts",
      "hector-respond.ts",
      "pro-status.ts",
      "message.ts",
    ]) {
      expect(names).toContain(n);
    }
  });

  it.each(files.map((f) => [path.relative(ROUTES, f), f]))("%s", (_name, file) => {
    expect(noStoreViolations(readFileSync(file as string, "utf8"))).toEqual([]);
  });

  it.each(HELPERS.map((f) => [path.basename(f), f]))("helper %s", (_name, file) => {
    expect(noStoreViolations(readFileSync(file as string, "utf8"))).toEqual([]);
  });

  it("the check itself can fail: a route that builds bare JSON, or an untagged raw Response, is caught", () => {
    expect(noStoreViolations(`return Response.json({ a: 1 });`)).toHaveLength(1);
    expect(noStoreViolations(`return new Response(body, { status: 200 });`)).toHaveLength(1);
    expect(
      noStoreViolations(`// Response.json( in a comment is fine\nreturn noStoreJson({});`),
    ).toEqual([]);
    expect(
      noStoreViolations(`new Response(b, { headers: { "Cache-Control": "no-store" } })`),
    ).toEqual([]);
  });

  it("the public config keeps its own cache header (it is the one exception)", () => {
    expect(readFileSync(path.join(ROUTES, "app-config.ts"), "utf8")).toContain(
      "public, max-age=300",
    );
  });
});

describe("noStoreJson", () => {
  it("adds no-store and keeps the status and body", async () => {
    const res = noStoreJson({ error: "x" }, { status: 403 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "x" });
  });
  it("keeps other headers, and a Cache-Control the route sets itself", () => {
    const a = noStoreJson({}, { headers: { "X-Test": "1" } });
    expect(a.headers.get("X-Test")).toBe("1");
    expect(a.headers.get("Cache-Control")).toBe("no-store");
    expect(
      noStoreJson({}, { headers: { "Cache-Control": "private, max-age=5" } }).headers.get(
        "Cache-Control",
      ),
    ).toBe("private, max-age=5");
  });
});
