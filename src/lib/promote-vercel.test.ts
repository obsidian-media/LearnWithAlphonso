import { describe, expect, it } from "vitest";
import {
  buildStatus,
  decidePromotion,
  PROJECTS,
  readToken,
  run,
  selectDeployment,
  type Deployment,
  type Deps,
} from "../../scripts/promote-vercel";

const SHA = "a".repeat(40);
const OLDER = "b".repeat(40);
const NEWER = "c".repeat(40);

function dep(
  uid: string,
  sha: string,
  created: number,
  readyState = "READY",
  target = "production",
): Deployment {
  return { uid, created, readyState, target, meta: { githubCommitSha: sha } };
}

describe("selectDeployment", () => {
  it("picks the newest production build of the commit", () => {
    const list = [dep("d1", SHA, 1), dep("d3", SHA, 3), dep("d2", SHA, 2)];
    expect(selectDeployment(list, SHA)?.uid).toBe("d3");
  });

  it("never picks another commit's build, even if the API filter let it through", () => {
    expect(selectDeployment([dep("x", OLDER, 9)], SHA)).toBeNull();
    expect(
      selectDeployment([{ uid: "y", created: 9, target: "production", readyState: "READY" }], SHA),
    ).toBeNull();
  });

  it("ignores preview builds of the same commit", () => {
    expect(selectDeployment([dep("p", SHA, 5, "READY", "preview")], SHA)).toBeNull();
  });
});

describe("buildStatus", () => {
  it("maps Vercel states", () => {
    expect(buildStatus({ readyState: "READY" })).toBe("ready");
    expect(buildStatus({ state: "READY" })).toBe("ready");
    expect(buildStatus({ readyState: "ERROR" })).toBe("failed");
    expect(buildStatus({ readyState: "CANCELED" })).toBe("canceled");
    expect(buildStatus({ readyState: "DELETED" })).toBe("failed");
    expect(buildStatus({ readyState: "BUILDING" })).toBe("pending");
    expect(buildStatus({ readyState: "QUEUED" })).toBe("pending");
  });
});

describe("decidePromotion", () => {
  const ancestry = (pairs: Array<[string, string]>) => (a: string, d: string) =>
    pairs.some(([x, y]) => x === a && y === d);

  it("does nothing when the domain already serves this build", () => {
    const d = decidePromotion({
      targetId: "t",
      targetSha: SHA,
      currentId: "t",
      currentSha: SHA,
      isAncestor: () => {
        throw new Error("must not be asked");
      },
    });
    expect(d.action).toBe("noop");
  });

  it("skips when production serves a descendant (a newer merge)", () => {
    const d = decidePromotion({
      targetId: "t",
      targetSha: SHA,
      currentId: "n",
      currentSha: NEWER,
      isAncestor: ancestry([[SHA, NEWER]]),
    });
    expect(d.action).toBe("skip-newer");
  });

  it("promotes over an older commit", () => {
    const d = decidePromotion({
      targetId: "t",
      targetSha: SHA,
      currentId: "o",
      currentSha: OLDER,
      isAncestor: ancestry([[OLDER, SHA]]),
    });
    expect(d.action).toBe("promote");
  });

  it("promotes a newer build of the same commit and a build with no git metadata", () => {
    expect(
      decidePromotion({
        targetId: "t",
        targetSha: SHA,
        currentId: "o",
        currentSha: SHA,
        isAncestor: () => true,
      }).action,
    ).toBe("promote");
    expect(
      decidePromotion({
        targetId: "t",
        targetSha: SHA,
        currentId: "o",
        currentSha: null,
        isAncestor: () => true,
      }).action,
    ).toBe("promote");
  });
});

describe("readToken", () => {
  it("treats an unset or empty secret as missing", () => {
    expect(readToken({})).toBeNull();
    expect(readToken({ VERCEL_TOKEN: "" })).toBeNull();
    expect(readToken({ VERCEL_TOKEN: "  " })).toBeNull();
    expect(readToken({ VERCEL_TOKEN: "tok" })).toBe("tok");
  });
});

/** A fake Vercel API. `aliases` maps domain -> deployment id; promote moves the domain unless `promoteMoves` is false. */
function fakeVercel(opts: {
  builds: Record<string, Deployment[]>;
  aliases: Record<string, string>;
  shas: Record<string, string>;
  promoteMoves?: boolean;
  promoteStatus?: number;
}) {
  const calls: Array<{ method: string; path: string; auth: string | null }> = [];
  const promoted: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, auth: headers.get("Authorization") });
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.searchParams.get("teamId") !== "team_b3dGeEKw3qj1ijfdY9N2KGe2") return json(403, {});

    if (method === "GET" && url.pathname === "/v7/deployments") {
      const pid = url.searchParams.get("projectId") ?? "";
      const sha = url.searchParams.get("sha");
      return json(200, {
        deployments: (opts.builds[pid] ?? []).filter((d) => d.meta?.githubCommitSha === sha),
      });
    }
    const alias = /^\/v4\/aliases\/(.+)$/.exec(url.pathname);
    if (method === "GET" && alias) {
      const id = opts.aliases[decodeURIComponent(alias[1])];
      return id ? json(200, { deploymentId: id }) : json(404, { error: { code: "not_found" } });
    }
    const one = /^\/v13\/deployments\/(.+)$/.exec(url.pathname);
    if (method === "GET" && one) {
      const id = decodeURIComponent(one[1]);
      return json(200, { id, meta: { githubCommitSha: opts.shas[id] } });
    }
    const promote = /^\/v10\/projects\/([^/]+)\/promote\/([^/]+)$/.exec(url.pathname);
    if (method === "POST" && promote) {
      promoted.push(promote[2]);
      if (opts.promoteStatus && opts.promoteStatus >= 400) {
        return json(opts.promoteStatus, {
          error: { code: "conflict", message: "secret-looking body" },
        });
      }
      if (opts.promoteMoves !== false) {
        const p = PROJECTS.find((x) => x.projectId === promote[1]);
        if (p) opts.aliases[p.domain] = promote[2];
      }
      return json(202, {});
    }
    return json(404, {});
  }) as typeof fetch;
  return { fetchImpl, calls, promoted };
}

function deps(fetchImpl: typeof fetch, overrides: Partial<Deps> = {}) {
  const lines: string[] = [];
  let clock = 0;
  const d: Deps = {
    env: { VERCEL_TOKEN: "secret-token-value", GITHUB_SHA: SHA },
    fetch: fetchImpl,
    isAncestor: () => false,
    changedFiles: () => ["ios/App/A.swift"],
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: (l) => lines.push(l),
    ...overrides,
  };
  return { d, lines };
}

const [WEB, ADMIN] = PROJECTS;

describe("run", () => {
  it("warns and exits 0 without calling Vercel when the token is missing", async () => {
    const v = fakeVercel({ builds: {}, aliases: {}, shas: {} });
    const { d, lines } = deps(v.fetchImpl, { env: { GITHUB_SHA: SHA, VERCEL_TOKEN: "" } });
    expect(await run(d)).toBe(0);
    expect(v.calls).toHaveLength(0);
    expect(lines.join("\n")).toMatch(/::warning::VERCEL_TOKEN is not set/);
  });

  it("promotes this commit's build over an older one and confirms the domain moved", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-new", SHA, 2)],
        [ADMIN.projectId]: [dep("adm-new", SHA, 2)],
      },
      aliases: { [WEB.domain]: "web-old", [ADMIN.domain]: "adm-old" },
      shas: { "web-old": OLDER, "adm-old": OLDER, "web-new": SHA, "adm-new": SHA },
    });
    const { d, lines } = deps(v.fetchImpl, { isAncestor: (a, b) => a === OLDER && b === SHA });
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual(["web-new", "adm-new"]);
    expect(v.calls.every((c) => c.auth === "Bearer secret-token-value")).toBe(true);
    expect(lines.join("\n")).not.toContain("secret-token-value");
  });

  it("sends no promote request when Auto-assign already moved the domain (the no-op path)", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-new", SHA, 2)],
        [ADMIN.projectId]: [dep("adm-new", SHA, 2)],
      },
      aliases: { [WEB.domain]: "web-new", [ADMIN.domain]: "adm-new" },
      shas: { "web-new": SHA, "adm-new": SHA },
    });
    const { d } = deps(v.fetchImpl);
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual([]);
    expect(v.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("never promotes over a newer commit that is already live", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-mine", SHA, 2)],
        [ADMIN.projectId]: [dep("adm-mine", SHA, 2)],
      },
      aliases: { [WEB.domain]: "web-newer", [ADMIN.domain]: "adm-newer" },
      shas: { "web-newer": NEWER, "adm-newer": NEWER },
    });
    const { d } = deps(v.fetchImpl, { isAncestor: (a, b) => a === SHA && b === NEWER });
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual([]);
  });

  it("waits for a build that is still running", async () => {
    const building = dep("web-new", SHA, 2, "BUILDING");
    const v = fakeVercel({
      builds: { [WEB.projectId]: [building], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-old" },
      shas: { "web-old": OLDER },
    });
    let sleeps = 0;
    const { d } = deps(v.fetchImpl, {
      isAncestor: () => false,
      sleep: async () => {
        sleeps++;
        if (sleeps === 3) building.readyState = "READY";
      },
      now: () => sleeps * 15_000,
    });
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual(["web-new"]);
  });

  it("skips a project Vercel did not build, with a warning", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [], [ADMIN.projectId]: [] },
      aliases: {},
      shas: {},
    });
    const { d, lines } = deps(v.fetchImpl);
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual([]);
    expect(
      lines.filter((l) => l.startsWith("::warning::") && l.includes("no production build")),
    ).toHaveLength(2);
  });

  it("skips, and stays green, when Vercel skipped the main build via the ignored build step (CANCELED)", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-skipped", SHA, 2, "CANCELED")],
        [ADMIN.projectId]: [dep("admin-skipped", SHA, 2, "CANCELED")],
      },
      aliases: { [WEB.domain]: "web-old", [ADMIN.domain]: "admin-old" },
      shas: { "web-old": OLDER, "admin-old": OLDER },
    });
    const { d, lines } = deps(v.fetchImpl);
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual([]);
    expect(lines.filter((l) => l.startsWith("::warning::") && l.includes("skipped"))).toHaveLength(
      2,
    );
    expect(lines.some((l) => l.startsWith("::error::"))).toBe(false);
  });

  it("still promotes admin when only web was skipped", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-skipped", SHA, 2, "CANCELED")],
        [ADMIN.projectId]: [dep("admin-new", SHA, 2)],
      },
      aliases: { [WEB.domain]: "web-old", [ADMIN.domain]: "admin-old" },
      shas: { "web-old": OLDER, "admin-old": OLDER },
    });
    const { d } = deps(v.fetchImpl, { isAncestor: () => false });
    expect(await run(d)).toBe(0);
    expect(v.promoted).toEqual(["admin-new"]);
  });

  it("FAILS when a canceled build carried a real src change (superseded or manual cancel)", async () => {
    const v = fakeVercel({
      builds: {
        [WEB.projectId]: [dep("web-canceled", SHA, 2, "CANCELED")],
        [ADMIN.projectId]: [dep("admin-canceled", SHA, 2, "CANCELED")],
      },
      aliases: { [WEB.domain]: "web-old", [ADMIN.domain]: "admin-old" },
      shas: { "web-old": OLDER, "admin-old": OLDER },
    });
    const asked: Array<[string, string]> = [];
    const { d, lines } = deps(v.fetchImpl, {
      changedFiles: (from, to) => {
        asked.push([from, to]);
        return ["ios/App/A.swift", "src/lib/x.ts"];
      },
    });
    expect(await run(d)).toBe(1);
    expect(asked[0]).toEqual([OLDER, SHA]);
    expect(v.promoted).toEqual([]);
    expect(
      lines.filter((l) => l.startsWith("::error::") && l.includes("needed a build")),
    ).toHaveLength(2);
  });

  it("fails a canceled build when the live commit or the diff is unknown", async () => {
    const noLive = fakeVercel({
      builds: { [WEB.projectId]: [dep("w", SHA, 2, "CANCELED")], [ADMIN.projectId]: [] },
      aliases: {},
      shas: {},
    });
    expect(await run(deps(noLive.fetchImpl).d)).toBe(1);
    const noDiff = fakeVercel({
      builds: { [WEB.projectId]: [dep("w", SHA, 2, "CANCELED")], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-old" },
      shas: { "web-old": OLDER },
    });
    expect(await run(deps(noDiff.fetchImpl, { changedFiles: () => null }).d)).toBe(1);
  });

  it("stays green for a canceled build that is older than the live commit", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [dep("w", SHA, 2, "CANCELED")], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-newer" },
      shas: { "web-newer": NEWER },
    });
    const { d } = deps(v.fetchImpl, {
      isAncestor: (a, b) => a === SHA && b === NEWER,
      changedFiles: () => ["src/lib/x.ts"],
    });
    expect(await run(d)).toBe(0);
  });

  it("fails when the build failed", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [dep("web-new", SHA, 2, "ERROR")], [ADMIN.projectId]: [] },
      aliases: {},
      shas: {},
    });
    const { d } = deps(v.fetchImpl);
    expect(await run(d)).toBe(1);
    expect(v.promoted).toEqual([]);
  });

  it("fails when the domain does not move after the promote request", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [dep("web-new", SHA, 2)], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-old" },
      shas: { "web-old": OLDER },
      promoteMoves: false,
    });
    const { d, lines } = deps(v.fetchImpl);
    expect(await run(d)).toBe(1);
    expect(lines.join("\n")).toMatch(/::error::web .*still serves web-old/);
  });

  it("fails on a rejected promote without printing the response body", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [dep("web-new", SHA, 2)], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-old" },
      shas: { "web-old": OLDER },
      promoteStatus: 403,
    });
    const { d, lines } = deps(v.fetchImpl);
    expect(await run(d)).toBe(1);
    const out = lines.join("\n");
    expect(out).toMatch(/HTTP 403 \(conflict\)/);
    expect(out).not.toContain("secret-looking body");
  });

  it("fails without promoting when git cannot compare the live commit", async () => {
    const v = fakeVercel({
      builds: { [WEB.projectId]: [dep("web-new", SHA, 2)], [ADMIN.projectId]: [] },
      aliases: { [WEB.domain]: "web-live" },
      shas: { "web-live": NEWER },
    });
    const { d, lines } = deps(v.fetchImpl, {
      isAncestor: () => {
        throw new Error("could not fetch the live commit");
      },
    });
    expect(await run(d)).toBe(1);
    expect(v.promoted).toEqual([]);
    expect(lines.join("\n")).toMatch(/::error::web: could not fetch/);
  });

  it("rejects a missing or short GITHUB_SHA", async () => {
    const v = fakeVercel({ builds: {}, aliases: {}, shas: {} });
    const { d } = deps(v.fetchImpl, { env: { VERCEL_TOKEN: "t", GITHUB_SHA: "abc" } });
    expect(await run(d)).toBe(2);
    expect(v.calls).toHaveLength(0);
  });
});
