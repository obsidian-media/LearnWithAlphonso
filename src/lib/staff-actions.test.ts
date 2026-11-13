import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPES, SCOPES } from "./staff-scopes";
import { allowedActions, NEEDS_EMAIL } from "./staff-actions";
import { homeFor, navItemsFor } from "./staff-nav";

const noPro = { active: false, source: "none" as const, until: null, unavailable: false };
const gift = { active: true, source: "gift" as const, until: "2026-12-01", unavailable: false };
const none: never[] = [];

describe("allowedActions", () => {
  it("support sees Block, and not Delete, Ban or Give Pro", () => {
    const actions = allowedActions(DEFAULT_SCOPES.support, { pro: noPro, restrictions: none });
    expect(actions).toEqual(["block"]);
  });

  it("the owner sees everything that applies", () => {
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: none })).toEqual([
      "gift",
      "block",
      "ban",
      "delete",
    ]);
    expect(allowedActions([...SCOPES], { pro: gift, restrictions: none })).toContain("revoke_gift");
  });

  it("offers the lift, not a second block or ban, while a restriction is active", () => {
    const blocked = [{ kind: "block", reason: "x", createdAt: "t", liftedAt: null }];
    const banned = [{ kind: "ban", reason: "x", createdAt: "t", liftedAt: null }];
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: blocked })).toContain("unblock");
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: blocked })).not.toContain(
      "block",
    );
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: banned })).toContain("unban");
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: banned })).not.toContain("ban");
    // a lifted restriction is history, not active
    const lifted = [{ kind: "ban", reason: "x", createdAt: "t", liftedAt: "t2" }];
    expect(allowedActions([...SCOPES], { pro: noPro, restrictions: lifted })).toContain("ban");
  });

  it("a person with only read scopes sees no actions, and ban needs user.ban while unban needs user.unban", () => {
    expect(allowedActions(["users.read"], { pro: noPro, restrictions: none })).toEqual([]);
    const banned = [{ kind: "ban", reason: "x", createdAt: "t", liftedAt: null }];
    expect(allowedActions(["user.ban"], { pro: noPro, restrictions: banned })).toEqual([]);
    expect(allowedActions(["user.unban"], { pro: noPro, restrictions: banned })).toEqual(["unban"]);
  });

  it("ban and delete are the actions that need the email typed", () => {
    expect([...NEEDS_EMAIL].sort()).toEqual(["ban", "delete"]);
  });
});

describe("the console navigation", () => {
  it("support sees Users and Reports and Support, not Staff, Action record, Podcasts or Numbers", () => {
    const keys = navItemsFor(DEFAULT_SCOPES.support).map((i) => i.key);
    expect(keys).toEqual(["users", "support", "reports"]);
  });
  it("the owner sees every item, in the order Numbers, Users, Support, Reports, Podcasts, Staff, Action record", () => {
    expect(navItemsFor([...SCOPES]).map((i) => i.key)).toEqual([
      "numbers",
      "users",
      "support",
      "reports",
      "podcasts",
      "staff",
      "audit",
    ]);
  });
  it("opens on Users, else the first thing the person can use, else nowhere", () => {
    expect(homeFor([...SCOPES])).toBe("/users");
    expect(homeFor(["reports.manage", "podcasts.manage"])).toBe("/reports");
    expect(homeFor(["audit.read"])).toBe("/audit");
    expect(homeFor([])).toBeNull();
  });
});
