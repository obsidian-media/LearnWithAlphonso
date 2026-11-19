import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// js-yaml is already installed (through eslint); required untyped so no new dependency is needed.
const { load: parseYaml } = createRequire(import.meta.url)("js-yaml") as {
  load: (text: string) => unknown;
};

/**
 * The PR-time types regeneration (`types-gen` + `types-push` in ci.yml). `types-push` holds the deploy key that can push
 * to this repository, so it must never run repository code (an install, a script, a build): the regenerated file arrives
 * as an artifact from `types-gen`, which has no secrets. These properties live in the job graph and step list, so they are
 * read from the workflow itself.
 */
type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: unknown;
};
type Job = { needs?: string | string[]; if?: string; steps?: Step[] };
const ROOT = process.env.GUARD_ROOT ?? process.cwd();

function jobsOf(text: string): Record<string, Job> {
  return (parseYaml(text) as { jobs: Record<string, Job> }).jobs;
}

function needsOf(job: Job | undefined): string[] {
  if (!job?.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

const ALLOWED_PUSH_ACTIONS = ["actions/checkout@", "actions/download-artifact@"];
/** Anything that would run code from the checked-out repository (or fetch and run a package). */
const RUNS_REPO_CODE =
  /\b(bun|bunx|npm|npx|node|yarn|pnpm|deno|make|python3?|sh|bash|source)\b|(^|[\s;&|])\.\/|scripts\//m;

/** Returns what is wrong, empty when it is right. */
function typesPushProblems(text: string): string[] {
  const jobs = jobsOf(text);
  const problems: string[] = [];
  const gen = jobs["types-gen"];
  const push = jobs["types-push"];
  if (!gen) problems.push("there is no types-gen job");
  if (!push) return [...problems, "there is no types-push job"];

  if (gen && JSON.stringify(gen).includes("secrets."))
    problems.push("types-gen reads a secret, so fork PRs cannot run it");
  if (gen?.if && !/^github\.event_name == 'pull_request'$/.test(gen.if.trim())) {
    problems.push(
      "types-gen is skipped on some pull requests, so it could not be a required check",
    );
  }

  if (!needsOf(push).includes("types-gen"))
    problems.push("types-push does not take its file from types-gen");
  const cond = push.if ?? "";
  if (!cond.includes("github.event.pull_request.head.repo.full_name == github.repository")) {
    problems.push("types-push is not limited to PRs from this repository");
  }
  if (!cond.includes("needs.types-gen.outputs.stale == 'true'"))
    problems.push("types-push runs when nothing is stale");

  const steps = push.steps ?? [];
  steps.forEach((step, i) => {
    if (step.uses && !ALLOWED_PUSH_ACTIONS.some((a) => step.uses!.startsWith(a))) {
      problems.push(
        `types-push step ${i} uses ${step.uses}, which is not checkout or download-artifact`,
      );
    }
    if (step.run && RUNS_REPO_CODE.test(step.run)) {
      problems.push(`types-push step ${i} (${step.name ?? "unnamed"}) runs repository code`);
    }
  });
  const keyAt = steps.findIndex((s) =>
    JSON.stringify(s).includes("secrets.TYPES_REGEN_DEPLOY_KEY"),
  );
  const checkAt = steps.findIndex((s) => s.run?.includes('!= "./types.ts"'));
  if (keyAt < 0) problems.push("types-push does not use the deploy key");
  if (checkAt < 0 || checkAt > keyAt) {
    problems.push(
      "types-push does not check the artifact is exactly types.ts before the key is loaded",
    );
  }
  if (steps.filter((s) => JSON.stringify(s).includes("secrets.")).length > 1) {
    problems.push("more than one types-push step holds a secret");
  }

  // Neither job may gate a deploy.
  for (const [name, job] of Object.entries(jobs)) {
    for (const gated of ["types-gen", "types-push"]) {
      if (name !== "types-push" && needsOf(job).includes(gated))
        problems.push(`${name} waits for ${gated}`);
    }
  }
  return problems;
}

describe("types-gen / types-push in the CI job graph", () => {
  const text = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

  it("the key-holding push job runs no repository code, and neither job gates a deploy", () => {
    expect(typesPushProblems(text)).toEqual([]);
  });

  it("types-gen skips cheaply only by its first step, and generates from local migrations with the real CLI", () => {
    const steps = jobsOf(text)["types-gen"].steps ?? [];
    const runs = steps.map((s) => s.run ?? "").join("\n");
    expect(runs).toContain("supabase db start");
    expect(runs).toContain(
      "supabase gen types typescript --local > src/integrations/supabase/types.ts",
    );
    expect(runs).toMatch(/supabase\/migrations\//);
    expect(runs).not.toContain("--project-id");
  });

  it("the check itself catches a push job that installs, a fork-reachable push, a missing file check, or a gate", () => {
    const installs = text.replace(
      '          cp "$RUNNER_TEMP/supabase-types/types.ts"',
      '          bun install\n          cp "$RUNNER_TEMP/supabase-types/types.ts"',
    );
    expect(installs).not.toBe(text);
    expect(typesPushProblems(installs)).toEqual([expect.stringContaining("runs repository code")]);

    const forkReachable = text.replace(
      "      github.event.pull_request.head.repo.full_name == github.repository &&\n",
      "",
    );
    expect(forkReachable).not.toBe(text);
    expect(typesPushProblems(forkReachable)).toEqual([
      expect.stringContaining("not limited to PRs from this repository"),
    ]);

    const noCheck = text.replace(
      'if [ "$files" != "./types.ts" ]; then',
      'if [ -z "$files" ]; then',
    );
    expect(noCheck).not.toBe(text);
    expect(typesPushProblems(noCheck)).toEqual([expect.stringContaining("exactly types.ts")]);

    const gating = text.replace(
      "needs: [lint-and-typecheck, web-build, admin-build, e2e, deno-tests]",
      "needs: [lint-and-typecheck, web-build, admin-build, e2e, deno-tests, types-gen]",
    );
    expect(gating).not.toBe(text);
    expect(typesPushProblems(gating)).toEqual([
      expect.stringContaining("deploy-supabase waits for types-gen"),
    ]);
  });
});
