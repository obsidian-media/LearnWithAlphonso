import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtures from "./social-reason.fixtures.json";
import { COPY } from "./copy";
import { socialReasonMessage } from "./social-reason-copy";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const REASONS = fixtures.reasons as Record<string, string>;

/**
 * Every reason code the LATEST definition of a team, duel or quest function can return (files run in version
 * order, so the last definition wins). Codes appear as `SELECT false, '<code>'`, `SELECT true, '<code>'` or
 * `RETURN '<code>';` (admin_rename_team).
 */
export function socialReasonCodes(): Map<string, Set<string>> {
  const latest = new Map<string, string>();
  for (const file of fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi,
    )) {
      latest.set(m[1], m[2] + m[3]);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const [name, text] of latest) {
    if (!/team|duel|quest/.test(name)) continue;
    const codes = new Set<string>();
    for (const m of text.matchAll(/SELECT\s+(?:false|true)\s*,\s*'([a-z][a-z-]*)'/g))
      codes.add(m[1]);
    for (const m of text.matchAll(/RETURN\s+'([a-z][a-z-]*)'\s*;/g)) codes.add(m[1]);
    if (codes.size) out.set(name, codes);
  }
  return out;
}

const unmapped = (codes: Map<string, Set<string>>, reasons: Record<string, string>) =>
  [...codes].flatMap(([fn, set]) =>
    [...set].filter((c) => !(c in reasons)).map((c) => `${fn}: ${c}`),
  );

describe("social reason copy", () => {
  it("maps every code a team, duel or quest RPC can return", () => {
    const codes = socialReasonCodes();
    for (const fn of [
      "create_team",
      "leave_team",
      "kick_team_member",
      "create_duel",
      "respond_to_duel",
      "claim_weekly_quest",
      "admin_rename_team",
    ]) {
      expect(codes.has(fn), fn).toBe(true);
    }
    expect(unmapped(codes, REASONS)).toEqual([]);
  }, 30_000);

  it("the exhaustiveness check can fail (mutation on the right axis)", () => {
    const { "team-full": _dropped, ...withoutOne } = REASONS;
    expect(unmapped(socialReasonCodes(), withoutOne)).toContain("_join_team_impl: team-full");
  }, 30_000);

  it("covers every code observed in production", () => {
    for (const code of [
      "unauthenticated",
      "invalid-name",
      "blocked-content",
      "invalid-visibility",
      "invalid-member-cap",
      "switch-locked",
      "team-not-found",
      "team-full",
      "invalid-code",
      "not-on-a-team",
      "cannot-kick-yourself",
      "not-team-owner",
      "member-not-found",
      "invalid-week",
      "unknown-quest",
      "not-yet-completed",
      "already-claimed",
    ]) {
      expect(REASONS, code).toHaveProperty(code);
    }
  });

  it("nil is a connection failure, an unknown code is generic, a known code has its words", () => {
    expect(socialReasonMessage(null)).toBe(COPY.connectionFailure);
    expect(socialReasonMessage(undefined)).toBe(COPY.connectionFailure);
    expect(socialReasonMessage("something-new")).toBe(fixtures.generic);
    expect(socialReasonMessage("blocked-content")).toBe(COPY.nameNotAllowed);
  });

  it("shares its strings with the master copy constants and has no literal --", () => {
    expect(fixtures.connection).toBe(COPY.connectionFailure);
    expect(REASONS["blocked-content"]).toBe(COPY.nameNotAllowed);
    for (const text of [
      fixtures.connection,
      fixtures.generic,
      fixtures.nameSaveFailed,
      ...Object.values(REASONS),
    ]) {
      expect(text).not.toContain("--");
    }
  });

  it("the iOS copy is byte-for-byte the web file", () => {
    const ios = path.resolve(
      import.meta.dirname,
      "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/social-reason.fixtures.json",
    );
    expect(fs.readFileSync(ios, "utf8")).toBe(
      fs.readFileSync(path.resolve(import.meta.dirname, "social-reason.fixtures.json"), "utf8"),
    );
  });
});
