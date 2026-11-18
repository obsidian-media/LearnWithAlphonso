/**
 * Points the production domains of the web and admin Vercel projects at the build of THIS commit, after CI has applied
 * the commit's database migrations and Edge Functions.
 *
 * Why: Vercel's git integration builds every main commit and, by default, assigns the production domains as soon as
 * the build is ready. That can put new web code live before the "Deploy Supabase migrations + Edge Functions" job
 * (deploy-supabase in .github/workflows/ci.yml) has created the tables and functions it calls. This script runs in a
 * job that `needs: [deploy-supabase]`, so with "Auto-assign Custom Production Domains" turned off on both projects the
 * domains move only once the database is ready.
 *
 * Safe in every intermediate state:
 * - VERCEL_TOKEN unset: warns and exits 0 (the job can merge before the secret exists).
 * - Auto-assign still on: Vercel has already pointed the domain at this build, so the script sees that and does
 *   nothing (no promote request is sent).
 * - No Vercel build for this commit (Vercel skipped it): warns and skips that project.
 * - A newer main commit is already live: skips, so an older build never replaces a newer one.
 *
 * Usage (CI): VERCEL_TOKEN=... GITHUB_SHA=... bun scripts/promote-vercel.ts
 * The token is read from the environment only and never printed. Response bodies are never printed either; errors
 * show the HTTP status and Vercel's short error code.
 *
 * Vercel REST API (docs checked 2026-11-18):
 * - GET  /v7/deployments?projectId&target=production&sha&teamId   list builds of a commit (meta.githubCommitSha)
 * - GET  /v4/aliases/{domain}?teamId                               deploymentId the domain serves now
 * - GET  /v13/deployments/{id}?teamId                              meta.githubCommitSha of that deployment
 * - POST /v10/projects/{projectId}/promote/{deploymentId}?teamId   point production domains at a deployment (201/202)
 */
import { execFileSync } from "node:child_process";

export const VERCEL_API = "https://api.vercel.com";
export const TEAM_ID = "team_b3dGeEKw3qj1ijfdY9N2KGe2";

export type VercelProject = { name: string; projectId: string; domain: string };

export const PROJECTS: readonly VercelProject[] = [
  {
    name: "web",
    projectId: "prj_how8TU8niiUjV2FHf0oAezHXrOSp",
    domain: "learn.alphonsoecosystem.app",
  },
  {
    name: "admin",
    projectId: "prj_atzbsZv03JBDuqxCKuMKlb7BeZV7",
    domain: "admin.alphonsoecosystem.app",
  },
];

export type Deployment = {
  uid?: string;
  id?: string;
  created?: number;
  readyState?: string;
  state?: string;
  target?: string | null;
  meta?: Record<string, unknown>;
};

export function deploymentId(d: Deployment): string {
  return d.uid ?? d.id ?? "";
}

export function commitShaOf(d: Deployment | null | undefined): string | null {
  const sha = d?.meta?.githubCommitSha;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

/**
 * The newest production deployment built from `sha`. The API is also filtered by sha, but the commit is checked here
 * too: promoting the wrong commit's build is the one mistake this script must not make.
 */
export function selectDeployment(
  deployments: readonly Deployment[],
  sha: string,
): Deployment | null {
  let best: Deployment | null = null;
  for (const d of deployments) {
    if (d.target !== "production") continue;
    if (commitShaOf(d) !== sha) continue;
    if (!deploymentId(d)) continue;
    if (best === null || (d.created ?? 0) > (best.created ?? 0)) best = d;
  }
  return best;
}

export type BuildStatus = "ready" | "failed" | "pending";

export function buildStatus(d: Deployment): BuildStatus {
  const s = d.readyState ?? d.state;
  if (s === "READY") return "ready";
  if (s === "ERROR" || s === "CANCELED" || s === "DELETED") return "failed";
  return "pending";
}

export type Decision =
  | { action: "noop"; reason: string }
  | { action: "skip-newer"; reason: string }
  | { action: "promote"; reason: string };

/**
 * What to do once this commit's build is ready.
 * - The domain already serves it: nothing (this is the case while Auto-assign is still on).
 * - The domain serves a build of a commit that DESCENDS from ours: a newer merge already went live; leave it.
 * - Otherwise: promote.
 */
export function decidePromotion(input: {
  targetId: string;
  targetSha: string;
  currentId: string | null;
  currentSha: string | null;
  isAncestor: (ancestor: string, descendant: string) => boolean;
}): Decision {
  const { targetId, targetSha, currentId, currentSha, isAncestor } = input;
  if (currentId !== null && currentId === targetId) {
    return { action: "noop", reason: "the production domain already serves this build" };
  }
  if (currentSha !== null && currentSha !== targetSha && isAncestor(targetSha, currentSha)) {
    return {
      action: "skip-newer",
      reason: `production already serves a newer commit (${currentSha.slice(0, 12)})`,
    };
  }
  return { action: "promote", reason: "production serves an older or unrelated build" };
}

/** The token, or null when the secret is not configured (an unset secret arrives as an empty string). */
export function readToken(env: Record<string, string | undefined>): string | null {
  const t = env.VERCEL_TOKEN?.trim();
  return t ? t : null;
}

export type Deps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  isAncestor: (ancestor: string, descendant: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
};

export const TIMINGS = {
  pollMs: 15_000,
  /** How long to wait for the build to reach READY. */
  buildTimeoutMs: 15 * 60_000,
  /** How long to wait for a build of this commit to appear at all before treating it as skipped by Vercel. */
  notFoundGraceMs: 2 * 60_000,
  /** How long to wait for the domain to switch after the promote request (promotion runs as a background job). */
  aliasTimeoutMs: 5 * 60_000,
  aliasPollMs: 10_000,
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api(
  deps: Deps,
  token: string,
  method: "GET" | "POST",
  path: string,
): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await deps.fetch(`${VERCEL_API}${path}${sep}teamId=${TEAM_ID}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    // Only the short error code, never the body.
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    const safeCode = typeof code === "string" && /^[\w.-]{1,64}$/.test(code) ? ` (${code})` : "";
    throw new ApiError(
      res.status,
      `${method} ${path.split("?")[0]} -> HTTP ${res.status}${safeCode}`,
    );
  }
  return body;
}

async function listCommitDeployments(deps: Deps, token: string, p: VercelProject, sha: string) {
  const q = new URLSearchParams({ projectId: p.projectId, target: "production", sha, limit: "20" });
  const body = (await api(deps, token, "GET", `/v7/deployments?${q}`)) as {
    deployments?: Deployment[];
  } | null;
  return body?.deployments ?? [];
}

async function currentProduction(deps: Deps, token: string, p: VercelProject) {
  let alias: { deploymentId?: string | null } | null;
  try {
    alias = (await api(
      deps,
      token,
      "GET",
      `/v4/aliases/${encodeURIComponent(p.domain)}`,
    )) as typeof alias;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { id: null, sha: null };
    throw e;
  }
  const id = alias?.deploymentId ?? null;
  if (!id) return { id: null, sha: null };
  const dep = (await api(
    deps,
    token,
    "GET",
    `/v13/deployments/${encodeURIComponent(id)}`,
  )) as Deployment | null;
  return { id, sha: commitShaOf(dep) };
}

export type ProjectResult = "promoted" | "noop" | "skipped" | "failed";

export async function promoteProject(
  deps: Deps,
  token: string,
  p: VercelProject,
  sha: string,
): Promise<ProjectResult> {
  const label = `${p.name} (${p.domain})`;
  const start = deps.now();
  let target: Deployment | null = null;

  for (;;) {
    const found = selectDeployment(await listCommitDeployments(deps, token, p, sha), sha);
    const elapsed = deps.now() - start;
    if (found === null) {
      if (elapsed >= TIMINGS.notFoundGraceMs) {
        deps.log(
          `::warning::${label}: Vercel has no production build for ${sha.slice(0, 12)}; skipped.`,
        );
        return "skipped";
      }
    } else {
      const status = buildStatus(found);
      if (status === "ready") {
        target = found;
        break;
      }
      if (status === "failed") {
        deps.log(
          `::error::${label}: the Vercel build ${deploymentId(found)} ended as ${found.readyState ?? found.state}.`,
        );
        return "failed";
      }
      if (elapsed >= TIMINGS.buildTimeoutMs) {
        deps.log(
          `::error::${label}: the Vercel build ${deploymentId(found)} was not ready within 15 minutes.`,
        );
        return "failed";
      }
    }
    await deps.sleep(TIMINGS.pollMs);
  }

  const targetId = deploymentId(target);
  const current = await currentProduction(deps, token, p);
  const decision = decidePromotion({
    targetId,
    targetSha: sha,
    currentId: current.id,
    currentSha: current.sha,
    isAncestor: deps.isAncestor,
  });
  deps.log(`${label}: ${decision.reason}.`);
  if (decision.action === "noop") return "noop";
  if (decision.action === "skip-newer") return "skipped";

  try {
    await api(
      deps,
      token,
      "POST",
      `/v10/projects/${p.projectId}/promote/${encodeURIComponent(targetId)}`,
    );
  } catch (e) {
    // A concurrent assignment (for example Auto-assign landing at the same moment) can reject the request; the
    // alias check below decides whether production ended up on the right build.
    if (!(e instanceof ApiError) || e.status !== 409) throw e;
    deps.log(
      `${label}: the promote request was rejected as a conflict (409); checking the domain.`,
    );
  }

  const verifyStart = deps.now();
  for (;;) {
    const now = await currentProduction(deps, token, p);
    if (now.id === targetId) {
      deps.log(`${label}: now serves ${targetId} (${sha.slice(0, 12)}).`);
      return "promoted";
    }
    if (deps.now() - verifyStart >= TIMINGS.aliasTimeoutMs) {
      deps.log(
        `::error::${label}: still serves ${now.id ?? "nothing"} after promoting ${targetId}.`,
      );
      return "failed";
    }
    await deps.sleep(TIMINGS.aliasPollMs);
  }
}

/** Exit code: 0 when every project is promoted, already live, or deliberately skipped. */
export async function run(deps: Deps): Promise<number> {
  const token = readToken(deps.env);
  if (token === null) {
    deps.log(
      "::warning::VERCEL_TOKEN is not set, so production domains were not moved by CI. See docs/ENV-SETUP.md (GitHub Actions secrets).",
    );
    return 0;
  }
  const sha = deps.env.GITHUB_SHA?.trim();
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    deps.log("::error::GITHUB_SHA must be a full commit sha.");
    return 2;
  }
  let failed = false;
  for (const p of PROJECTS) {
    try {
      const r = await promoteProject(deps, token, p, sha);
      if (r === "failed") failed = true;
    } catch (e) {
      deps.log(`::error::${p.name}: ${e instanceof Error ? e.message : "unexpected error"}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

function gitOk(args: string[]): number {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** `git merge-base --is-ancestor`, fetching the descendant first if this checkout does not have it yet. */
export function gitIsAncestor(ancestor: string, descendant: string): boolean {
  if (gitOk(["cat-file", "-e", `${descendant}^{commit}`]) !== 0) {
    gitOk(["fetch", "--no-tags", "--quiet", "origin", descendant]);
  }
  const status = gitOk(["merge-base", "--is-ancestor", ancestor, descendant]);
  if (status === 0) return true;
  if (status !== 1) {
    console.log(
      `::warning::Could not compare ${ancestor.slice(0, 12)} with ${descendant.slice(0, 12)} in git; treating production as older.`,
    );
  }
  return false;
}

if (import.meta.main) {
  const code = await run({
    env: process.env,
    fetch: globalThis.fetch,
    isAncestor: gitIsAncestor,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
  });
  process.exit(code);
}
