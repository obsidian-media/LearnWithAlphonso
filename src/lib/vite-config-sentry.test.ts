import { afterEach, describe, expect, it } from "vitest";
import type { UserConfig } from "vite";

type ConfigFn = (env: { command: "build" | "serve"; mode: string }) => Promise<UserConfig>;

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["VERCEL_GIT_COMMIT_SHA", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function loadConfig(command: "build" | "serve" = "serve"): Promise<UserConfig> {
  const mod = (await import("../../vite.config")) as { default: ConfigFn };
  return mod.default({ command, mode: "test" });
}

describe("vite.config.ts Sentry wiring", () => {
  it("bakes VERCEL_GIT_COMMIT_SHA into the bundle as VITE_SENTRY_RELEASE", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "0123abc";
    const config = await loadConfig();
    expect(config.define?.["import.meta.env.VITE_SENTRY_RELEASE"]).toBe(JSON.stringify("0123abc"));
  });

  it("defines an empty release (not undefined) outside Vercel", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const config = await loadConfig();
    expect(config.define?.["import.meta.env.VITE_SENTRY_RELEASE"]).toBe('""');
  });

  it("builds hidden source maps and adds the upload plugin only when all three Sentry settings are set", async () => {
    process.env.SENTRY_AUTH_TOKEN = "t";
    process.env.SENTRY_ORG = "o";
    delete process.env.SENTRY_PROJECT;
    const partial = await loadConfig("build");
    expect(partial.build?.sourcemap).toBe(false);
    process.env.SENTRY_PROJECT = "p";
    const full = await loadConfig("build");
    expect(full.build?.sourcemap).toBe("hidden");
    const names = (full.plugins ?? [])
      .flat(Infinity as 1)
      .map((p) => (p as { name?: string })?.name ?? "");
    expect(names.some((n) => n.startsWith("sentry"))).toBe(true);
    // A dev server never uploads, whatever the environment says.
    expect((await loadConfig("serve")).build?.sourcemap).toBe(false);
  }, 60_000);
});
