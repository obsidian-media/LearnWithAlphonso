import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// scripts/ is outside the typecheck include and has no tests of its own, so the wiring
// that the lib modules depend on is pinned here as text.
const tool = readFileSync(
  path.resolve(import.meta.dirname, "../../scripts/podcast-tool.ts"),
  "utf8",
);

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
    // The dry-run message must be followed by a return BEFORE the synthesise call; deleting
    // the `return;` would still print the message and then bill the synthesis.
    expect(tool).toMatch(
      /Synthesis is billed, so it runs only with --confirm\.[\s\S]{0,40}?return;[\s\S]*?await synthesise\(/,
    );
    const dryRun = tool.indexOf("Synthesis is billed, so it runs only with --confirm.");
    const synth = tool.indexOf("await synthesise(");
    expect(dryRun).toBeGreaterThan(-1);
    expect(synth).toBeGreaterThan(dryRun);
  });

  it("checks add --file --provider deepgram against the course before anything is written", () => {
    expect(tool).toMatch(
      /fileProviderProblem\(\{[^}]*provider[^}]*\}\);\s*if \(problem\) fail\(problem\);/,
    );
    const check = tool.indexOf("fileProviderProblem(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(tool.indexOf("await db.storage"));
  });

  it("warns for a course left with fewer than three published, as well as an empty one", () => {
    expect(tool).toMatch(/for \(const \{ course, count \} of coursesLow\(counts\)\)/);
    expect(tool).toMatch(/WARNING: only \$\{count\} would stay published for/);
  });

  it("--remove-audio deletes only the paths removableAudioPaths allows", () => {
    expect(tool).toMatch(/removableAudioPaths\(plan, episodes\)/);
    expect(tool).toMatch(/\.remove\(removable\.paths\)/);
    expect(tool).not.toMatch(/\.remove\(audioPaths\)/);
  });

  it("routes the unpublish command and lists it in the usage text", () => {
    expect(tool).toMatch(/case "unpublish":\s*await cmdUnpublish\(flags\);/);
    expect(tool).toMatch(/podcast-tool\.ts unpublish/);
  });

  it("publish is the only command that sets published to true", () => {
    expect(tool.match(/published: true/g)?.length).toBe(1);
    expect(tool.indexOf("published: true")).toBeGreaterThan(
      tool.indexOf("async function cmdPublish"),
    );
  });
});
