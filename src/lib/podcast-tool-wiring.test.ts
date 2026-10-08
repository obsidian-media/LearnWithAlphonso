import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// scripts/ is outside the typecheck include and has no tests of its own, so the wiring
// that the lib modules depend on is pinned here as text.
const tool = readFileSync(path.resolve(import.meta.dirname, "../../scripts/podcast-tool.ts"), "utf8");

describe("podcast-tool.ts wiring", () => {
  it("builds every Deepgram URL through deepgramSpeakUrl, so mip_opt_out cannot be dropped", () => {
    expect(tool).toContain("deepgramSpeakUrl(voice)");
    expect(tool).not.toMatch(/api\.deepgram\.com/);
  });

  it("checks the voice against the course before synthesising", () => {
    expect(tool).toMatch(/voiceMatchesCourse\(voice, course\)/);
  });

  it("records provenance on every episode insert", () => {
    expect(tool).toMatch(/voice_provider: provider,/);
    expect(tool).toMatch(/voice_model: voiceModel,/);
  });

  it("refuses to publish unlicensed audio", () => {
    expect(tool).toMatch(/isPublishableProvider\(/);
  });

  it("does not pay for synthesis on a dry run", () => {
    const dryRun = tool.indexOf("Synthesis is billed, so it runs only with --confirm.");
    const synth = tool.indexOf("await synthesise(");
    expect(dryRun).toBeGreaterThan(-1);
    expect(synth).toBeGreaterThan(dryRun);
  });

  it("routes the unpublish command and lists it in the usage text", () => {
    expect(tool).toMatch(/case "unpublish":\s*await cmdUnpublish\(flags\);/);
    expect(tool).toMatch(/podcast-tool\.ts unpublish/);
  });

  it("publish is the only command that sets published to true", () => {
    expect(tool.match(/published: true/g)?.length).toBe(1);
    expect(tool.indexOf("published: true")).toBeGreaterThan(tool.indexOf("async function cmdPublish"));
  });
});
