import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// js-yaml is already installed (through eslint); required untyped so no new dependency is needed.
const { load: parseYaml } = createRequire(import.meta.url)("js-yaml") as {
  load: (text: string) => unknown;
};

/**
 * The generated-types freshness check (`types-fresh`) must compare AFTER the push's migrations are deployed, and must
 * never gate anything. Both properties are about the job graph, so they are read from the workflow itself.
 * (A job's `needs:` list is what gates a deploy; reading it is the only honest check.)
 */
type Job = { needs?: string | string[]; if?: string };
const ROOT = process.env.GUARD_ROOT ?? process.cwd();

function jobsOf(text: string): Record<string, Job> {
  return (parseYaml(text) as { jobs: Record<string, Job> }).jobs;
}

function needsOf(job: Job | undefined): string[] {
  if (!job?.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

/** Returns what is wrong with the graph, empty when it is right. */
function typesFreshProblems(text: string): string[] {
  const jobs = jobsOf(text);
  const problems: string[] = [];
  if (!jobs["types-fresh"]) problems.push("there is no types-fresh job");
  if (!needsOf(jobs["types-fresh"]).includes("deploy-supabase")) {
    problems.push(
      "types-fresh does not wait for deploy-supabase, so it compares against a production without this push's migrations",
    );
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (name !== "types-fresh" && needsOf(job).includes("types-fresh")) {
      problems.push(`${name} waits for types-fresh, which would let an advisory check gate it`);
    }
  }
  return problems;
}

describe("types-fresh in the CI job graph", () => {
  const text = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

  it("waits for the deploy that applies the migrations, and nothing waits for it", () => {
    expect(typesFreshProblems(text)).toEqual([]);
  });

  it("still runs only on pushes to main (it reads the Supabase account token)", () => {
    const job = jobsOf(text)["types-fresh"];
    expect(job.if).toContain("refs/heads/main");
    expect(job.if).toContain("push");
  });

  it("the check itself catches a graph where it does not wait, or where a deploy waits for it", () => {
    const withoutNeeds = text.replace("    needs: [deploy-supabase]\n", "");
    expect(withoutNeeds).not.toBe(text);
    expect(typesFreshProblems(withoutNeeds)).toEqual([
      expect.stringContaining("does not wait for deploy-supabase"),
    ]);
    const gating = text.replace(
      "needs: [lint-and-typecheck, web-build, admin-build, e2e, deno-tests]",
      "needs: [lint-and-typecheck, web-build, admin-build, e2e, deno-tests, types-fresh]",
    );
    expect(gating).not.toBe(text);
    expect(typesFreshProblems(gating)).toEqual([
      expect.stringContaining("deploy-supabase waits for types-fresh"),
    ]);
  });
});
