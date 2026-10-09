import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every NVIDIA request goes through one of two chokepoints, which always add SAFETY_PREAMBLE. A new call site that
 * fetches the URL itself fails here, so it cannot skip the safety rules. scripts/ is out of scope: those are offline
 * authoring tools with a human reviewing the output.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCAN = ["src", "supabase/functions", "admin"];
const CHOKEPOINTS = ["src/lib/nvidia-chat.server.ts", "supabase/functions/_shared/nvidia-chat.ts"];
// The URL, any api.nvidia.com host, or the chokepoint's exported constant: a caller cannot reach NVIDIA around it.
const NVIDIA = /integrate\.api\.nvidia\.com|\bapi\.nvidia\.com|NVIDIA_CHAT_URL/;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

describe("NVIDIA call sites", () => {
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));

  it("only the two chokepoints call NVIDIA directly", () => {
    const callers = files
      .filter((f) => NVIDIA.test(fs.readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(callers).toEqual([...CHOKEPOINTS].sort());
    // Walks three source trees: allow for a slow disk or a loaded CI runner.
  }, 30_000);

  it("each chokepoint applies the safety preamble to the messages it sends", () => {
    for (const f of CHOKEPOINTS) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), f).toMatch(
        /messages:\s*applySafety\(body\.messages\)/,
      );
    }
  });

  it("catches NVIDIA by host or constant, not only by the full URL", () => {
    expect(NVIDIA.test("fetch(NVIDIA_CHAT_URL)")).toBe(true);
    expect(NVIDIA.test('fetch("https://integrate.api.nvidia.com/v1/x")')).toBe(true);
    expect(NVIDIA.test('const host = "api.nvidia.com"')).toBe(true);
    expect(NVIDIA.test("nothing here")).toBe(false);
  });
});

/**
 * Every Deepgram request opts out of Deepgram's model improvement program (mip_opt_out=true): the privacy policy
 * says recordings are not kept or used for training. A new Deepgram call site must be registered here and carry the
 * parameter.
 */
const DEEPGRAM = /api\.deepgram\.com/;
const DEEPGRAM_SITES = [
  "src/lib/podcast-tts.ts",
  "src/routes/api/hector-respond.ts",
  "src/routes/api/stt.ts",
  "src/routes/api/tts.ts",
];
describe("Deepgram call sites", () => {
  const files = [...SCAN, "scripts"].flatMap((d) => walk(path.join(ROOT, d)));

  it("are exactly the registered ones", () => {
    const callers = files
      .filter((f) => DEEPGRAM.test(fs.readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(callers).toEqual(DEEPGRAM_SITES);
  }, 30_000);

  it("each one opts out of model improvement", () => {
    for (const f of DEEPGRAM_SITES) {
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      const urls = text.match(/https:\/\/api\.deepgram\.com[^`"']*/g) ?? [];
      expect(urls.length, f).toBeGreaterThan(0);
      for (const url of urls) expect(url, `${f}: ${url}`).toContain("mip_opt_out=true");
    }
  });
});
