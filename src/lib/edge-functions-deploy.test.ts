import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const functionsDir = path.join(root, "supabase/functions");
/** Directories that are not deployable functions. Add to this only with a reason. */
const NOT_FUNCTIONS = new Set(["_shared"]);

const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const deployed = new Set(
  [...ci.matchAll(/^\s*supabase functions deploy ([a-z0-9-]+)\s*$/gm)].map((m) => m[1]!),
);
const functions = readdirSync(functionsDir).filter(
  (d) => statSync(path.join(functionsDir, d)).isDirectory() && !NOT_FUNCTIONS.has(d),
);

describe("every Edge Function is deployed by CI", () => {
  it("found the functions and the deploy list", () => {
    expect(functions.length).toBeGreaterThan(4);
    expect(deployed.size).toBeGreaterThan(4);
  });

  it.each(functions)("%s is in deploy-supabase's deploy list", (name) => {
    expect(deployed.has(name), `add "supabase functions deploy ${name}" to ci.yml`).toBe(true);
  });

  it("deploys nothing that does not exist", () => {
    for (const name of deployed) expect(functions, name).toContain(name);
  });
});
