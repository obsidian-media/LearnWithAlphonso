import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every deployed Edge Function pins its gateway JWT check in supabase/config.toml, so a CLI default change or a
// missing deploy flag cannot silently expose one. Only send-push may skip it: it is called by the database trigger
// and checks its own secret (supabase/functions/send-push/auth.ts).

const root = path.resolve(import.meta.dirname, "../..");
const functionsDir = path.join(root, "supabase", "functions");

/** Functions allowed to turn the gateway check off. */
const SELF_AUTHENTICATING = ["send-push"];

/** Config entries whose directory lands in a separate, still-open change. Remove a name once its directory exists. */
const PENDING_FUNCTIONS: string[] = [];

/** Reads `[functions.<name>]` tables and their `verify_jwt` value. Throws on anything it does not understand. */
function parseFunctionVerifyJwt(toml: string): Map<string, boolean | undefined> {
  const result = new Map<string, boolean | undefined>();
  let current: string | null = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const table = /^\[([^\]]+)\]$/.exec(line);
    if (table) {
      const m = /^functions\.("?)([A-Za-z0-9_-]+)\1$/.exec(table[1]);
      current = m ? m[2] : null;
      if (current) {
        if (result.has(current)) throw new Error(`duplicate [functions.${current}]`);
        result.set(current, undefined);
      }
      continue;
    }
    if (current === null) continue;
    const kv = /^verify_jwt\s*=\s*(\S+)$/.exec(line);
    if (kv) {
      if (kv[1] !== "true" && kv[1] !== "false") {
        throw new Error(`[functions.${current}] verify_jwt must be true or false, got ${kv[1]}`);
      }
      result.set(current, kv[1] === "true");
    }
  }
  return result;
}

function functionDirs(): string[] {
  return readdirSync(functionsDir)
    .filter((name) => name !== "_shared")
    .filter((name) => statSync(path.join(functionsDir, name)).isDirectory())
    .sort();
}

const config = parseFunctionVerifyJwt(
  readFileSync(path.join(root, "supabase", "config.toml"), "utf8"),
);

describe("supabase/config.toml pins verify_jwt per Edge Function", () => {
  it("finds the function directories (guard against an empty scan)", () => {
    expect(functionDirs()).toContain("complete-lesson");
    expect(functionDirs()).toContain("send-push");
  });

  it("every function directory has an explicit verify_jwt entry", () => {
    for (const name of functionDirs()) {
      expect(config.has(name), `[functions.${name}] missing from supabase/config.toml`).toBe(true);
      expect(typeof config.get(name), `[functions.${name}] has no verify_jwt`).toBe("boolean");
    }
  });

  it("only send-push turns the gateway check off", () => {
    const off = [...config].filter(([, v]) => v === false).map(([k]) => k);
    expect(off.sort()).toEqual([...SELF_AUTHENTICATING].sort());
  });

  it("every config entry is a real function directory or a known pending one", () => {
    const dirs = new Set(functionDirs());
    for (const name of config.keys()) {
      expect(
        dirs.has(name) || PENDING_FUNCTIONS.includes(name),
        `[functions.${name}] has no supabase/functions/${name} directory`,
      ).toBe(true);
    }
  });

  it("ci.yml passes --no-verify-jwt only for the self-authenticating functions", () => {
    const ci = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    const deploys = [...ci.matchAll(/supabase functions deploy ([A-Za-z0-9_-]+)([^\n]*)/g)];
    expect(deploys.length).toBeGreaterThan(0);
    for (const [, name, rest] of deploys) {
      const noVerify = rest.includes("--no-verify-jwt");
      expect(noVerify, `deploy line for ${name}`).toBe(SELF_AUTHENTICATING.includes(name));
      expect(config.get(name), `config.toml entry for ${name}`).toBe(!noVerify);
    }
  });
});

describe("parseFunctionVerifyJwt", () => {
  it("reads true, false and a table with no verify_jwt", () => {
    const parsed = parseFunctionVerifyJwt(
      [
        'project_id = "x"',
        "[functions.a]",
        "verify_jwt = true # comment",
        "[functions.b]",
        "verify_jwt = false",
        "[functions.c]",
        "import_map = './x.json'",
        "[api]",
        "verify_jwt = false",
      ].join("\n"),
    );
    expect([...parsed]).toEqual([
      ["a", true],
      ["b", false],
      ["c", undefined],
    ]);
  });

  it("rejects a non-boolean value and a duplicate table", () => {
    expect(() => parseFunctionVerifyJwt('[functions.a]\nverify_jwt = "false"')).toThrow();
    expect(() => parseFunctionVerifyJwt("[functions.a]\n[functions.a]")).toThrow();
  });
});
