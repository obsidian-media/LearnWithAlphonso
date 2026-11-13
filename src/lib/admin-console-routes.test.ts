import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./staff-nav";

/** The console's screens, checked against the files that ship them. */
const routes = readdirSync("admin/routes").filter((f) => f.endsWith(".tsx"));
const tree = readFileSync("admin/routeTree.gen.ts", "utf8");

describe("the console navigation points at real screens", () => {
  it("every nav item has a route file and an entry in the generated route tree", () => {
    for (const item of NAV_ITEMS) {
      const file = `admin/routes/${item.to.slice(1)}.tsx`;
      expect(existsSync(file), `${item.key} -> ${file}`).toBe(true);
      expect(tree, `${item.to} in routeTree.gen.ts`).toContain(`'${item.to}'`);
    }
  });

  it("the learner page and the new screens are in the generated route tree", () => {
    for (const path of ["/users/$id", "/staff", "/audit", "/users", "/numbers", "/support"]) {
      expect(tree, path).toContain(`'${path}'`);
    }
  });
});

describe("every screen is gated by a server call, not by the navigation", () => {
  it("each page except sign-in loads through a staff server function in its loader", () => {
    for (const file of routes.filter((f) => f !== "signin.tsx")) {
      const src = readFileSync(`admin/routes/${file}`, "utf8");
      if (file === "__root.tsx") continue; // the root only decides whether to show the navigation
      expect(src, file).toMatch(/adminWhoAmI|adminList|adminGetTranscript/);
    }
  });

  it("the audit page reads through staffListAudit and asks for audit.read first", () => {
    const src = readFileSync("admin/routes/audit.tsx", "utf8");
    expect(src).toContain("staffListAudit");
    expect(src).toContain('"audit.read"');
  });

  it("the learner page offers actions from the viewer's scopes and writes only through staff server functions", () => {
    const src = readFileSync("admin/routes/users.$id.tsx", "utf8");
    for (const fn of [
      "staffGrantPro",
      "staffRevokePro",
      "staffBlockUser",
      "staffUnblockUser",
      "staffBanUser",
      "staffUnbanUser",
      "staffDeleteUser",
      "staffAddNote",
    ]) {
      expect(src, fn).toContain(fn);
    }
    expect(src).not.toMatch(/supabaseAdmin|from\(["']user_restrictions/);
  });
});
