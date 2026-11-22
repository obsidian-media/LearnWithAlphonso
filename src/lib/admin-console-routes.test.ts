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
    for (const path of [
      "/users/$id",
      "/staff",
      "/audit",
      "/users",
      "/numbers",
      "/reports",
      "/support",
      "/support/$id",
    ]) {
      expect(tree, path).toContain(`'${path}'`);
    }
  });
});

describe("the support screen", () => {
  it("is one page gated by support.read that reaches the data only through staff server functions", () => {
    const page = readFileSync("admin/routes/support.tsx", "utf8");
    expect(page).toContain('"support.read"');
    expect(page).not.toMatch(/supabaseAdmin|from\(["']support_/);
    for (const fn of [
      "staffListTickets",
      "staffGetTicket",
      "staffReplyTicket",
      "staffAssignTicket",
      "staffSetTicketStatus",
      "staffHandToOwner",
      "staffClearUrgent",
      "staffAddTicketNote",
      "staffSetSetting",
    ]) {
      expect(page, fn).toContain(fn);
    }
  });

  it("the old /support/<id> address only redirects to the screen (it reads nothing itself)", () => {
    const old = readFileSync("admin/routes/support_.$id.tsx", "utf8");
    expect(old).toContain("redirect(");
    expect(old).toContain('to: "/support"');
    expect(old).not.toMatch(/supabaseAdmin|staff[A-Z]\w+|from\(["']/);
    // It must not nest under the screen (support.tsx has no Outlet).
    expect(tree).toContain("path: '/support/$id'");
    expect(tree).not.toMatch(
      /SupportIdRoute = SupportIdRouteImport\.update\(\{[^}]*getParentRoute: \(\) => SupportRoute/,
    );
  });
});

describe("detail pages are not nested under a list page that has no Outlet", () => {
  // support.tsx and users.tsx render a list and no <Outlet />, so a child route nested under them (users.$id) is
  // matched but never drawn: /users/<id> showed the search page. The trailing underscore makes a page a sibling.
  it("every list route without an Outlet has no child route in the generated tree", () => {
    for (const parent of ["users", "support"]) {
      const src = readFileSync(`admin/routes/${parent}.tsx`, "utf8");
      expect(src, `${parent}.tsx renders no Outlet`).not.toContain("Outlet");
      const Parent = parent[0]!.toUpperCase() + parent.slice(1);
      expect(tree, `${parent} has no children`).not.toContain(`${Parent}RouteWithChildren`);
      expect(tree).not.toContain(`getParentRoute: () => ${Parent}Route`);
    }
  });

  it("/users/$id and /support/$id are their own pages at the right paths", () => {
    expect(tree).toContain("path: '/users/$id'");
    expect(tree).toContain("path: '/support/$id'");
    expect(existsSync("admin/routes/users_.$id.tsx")).toBe(true);
    expect(existsSync("admin/routes/users.$id.tsx")).toBe(false);
  });
});

describe("every screen is gated by a server call, not by the navigation", () => {
  it("each page except sign-in loads through a staff server function in its loader", () => {
    for (const file of routes.filter((f) => f !== "signin.tsx")) {
      const src = readFileSync(`admin/routes/${file}`, "utf8");
      if (file === "__root.tsx") continue; // the root only decides whether to show the navigation
      if (file === "support_.$id.tsx") continue; // only redirects to /support (tested above)
      if (file === "users_.$id.tsx") continue; // only redirects to /users (tested below)
      expect(src, file).toMatch(/adminWhoAmI|adminList|adminGetTranscript/);
    }
  });

  it("the audit page reads only through the two audit server functions and asks for audit.read first", () => {
    const src = readFileSync("admin/routes/audit.tsx", "utf8");
    expect(src).toContain("staffListAudit");
    expect(src).toContain("staffListAuditActors");
    expect(src).toContain('"audit.read"');
    expect(src).toContain("ssr: false");
    expect(src).not.toMatch(/supabaseAdmin|from\(["']staff_audit_log/);
    // the old view is gone: the screen is the only thing the route renders
    expect(existsSync("src/components/staff/AuditView.tsx")).toBe(false);
    expect(src).toContain("AuditScreen");
  });

  it("the learner page offers actions from the viewer's scopes and writes only through staff server functions", () => {
    const src = readFileSync("admin/routes/users.tsx", "utf8");
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
    // the old learner address only redirects into the Users screen, keeping the learner id
    const old = readFileSync("admin/routes/users_.$id.tsx", "utf8");
    expect(old).toContain("redirect(");
    expect(old).toMatch(/to: "\/users"[\s\S]*u: params\.id/);
  });

  it("the reports page is gated by reports.manage in its loader and acts only through server functions that take a reason", () => {
    const src = readFileSync("admin/routes/reports.tsx", "utf8");
    expect(src).toContain('"reports.manage"');
    expect(src).not.toMatch(/supabaseAdmin|from\(["']content_reports/);
    for (const fn of [
      "adminListReports",
      "adminDismissReport",
      "adminResetDisplayName",
      "adminRenameTeam",
      "adminDisbandTeam",
      "staffBanUser",
      "staffDeleteUser",
    ]) {
      expect(src, fn).toContain(fn);
    }
    // every action passes the reason the person typed
    for (const call of src.match(
      /(adminDismissReport|adminResetDisplayName|adminRenameTeam|adminDisbandTeam)\(\{ data: \{[^}]*\} \}\)/g,
    ) ?? []) {
      expect(call, call).toContain("reason");
    }
  });

  it("the staff page is owner-only in the loader and changes staff only through the staff server functions", () => {
    const src = readFileSync("admin/routes/staff.tsx", "utf8");
    expect(src).toContain('"staff.manage"');
    expect(src).toMatch(/me\.role !== "owner"/);
    for (const fn of ["staffListStaff", "staffAddStaff", "staffUpdateStaff"]) {
      expect(src, fn).toContain(fn);
    }
    expect(src).not.toMatch(/supabaseAdmin|from\(["']staff_roles/);
  });
});
