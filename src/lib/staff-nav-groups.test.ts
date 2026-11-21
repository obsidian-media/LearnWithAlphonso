import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navGroupsFor } from "./staff-nav";
import { DEFAULT_SCOPES, SCOPES } from "./staff-scopes";

const keys = (scopes: readonly string[]) =>
  navGroupsFor(scopes).map((g) => [g.key, g.items.map((i) => i.key)]);

describe("the rail's groups", () => {
  it("an owner sees all three groups, Numbers under Operate (owner ruling), Podcasts alone under Content", () => {
    expect(keys([...SCOPES])).toEqual([
      ["operate", ["support", "reports", "users", "numbers"]],
      ["content", ["podcasts"]],
      ["system", ["staff", "audit", "health"]],
    ]);
  });

  it("a support person never sees Staff, Audit, Numbers, Health or Podcasts, and the empty groups disappear", () => {
    expect(keys(DEFAULT_SCOPES.support)).toEqual([["operate", ["support", "reports", "users"]]]);
  });

  it("someone with no scope has no groups at all", () => {
    expect(navGroupsFor([])).toEqual([]);
  });

  it("numbers.revenue alone opens Numbers; Health needs numbers.read", () => {
    expect(keys(["numbers.revenue"])).toEqual([["operate", ["numbers"]]]);
    expect(keys(["numbers.read"])).toEqual([
      ["operate", ["numbers"]],
      ["system", ["health"]],
    ]);
  });

  it("every nav item with a scope appears in exactly one group (no old page is unreachable)", () => {
    const all = navGroupsFor([...SCOPES]).flatMap((g) => g.items.map((i) => i.key));
    expect([...all].sort()).toEqual(NAV_ITEMS.map((i) => i.key).sort());
  });
});
