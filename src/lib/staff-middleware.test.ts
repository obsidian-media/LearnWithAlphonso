import { describe, expect, it } from "vitest";
import { UNAUTHORIZED_MESSAGE, SECOND_FACTOR_REQUIRED_MESSAGE, getStaffRole } from "./admin-auth";
import { authorizeStaff } from "./staff-authorize";

type Rows = { admin_users?: string[]; staff_roles?: Record<string, unknown>[] };
function fakeClient(rows: Rows, fail = false) {
  return {
    from(table: "admin_users" | "staff_roles") {
      let uid = "";
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => {
          uid = v;
          return q;
        },
        maybeSingle: async () => {
          if (fail) return { data: null, error: { message: "boom" } };
          if (table === "admin_users")
            return { data: rows.admin_users?.includes(uid) ? { user_id: uid } : null, error: null };
          return { data: rows.staff_roles?.find((r) => r.user_id === uid) ?? null, error: null };
        },
      };
      return q;
    },
  } as never;
}
const ok = { aal: "aal2" };
const exactly = (m: string) => new RegExp(`^${m}$`);

describe("getStaffRole", () => {
  it("admin_users member with no staff_roles row is owner", async () => {
    const c = fakeClient({ admin_users: ["u1"] });
    expect(await getStaffRole(c, "u1")).toEqual({ role: "owner", scopes: [] });
  });
  it("a staff_roles row without an admin_users row is not staff", async () => {
    const c = fakeClient({ staff_roles: [{ user_id: "u1", role: "owner", scopes: [] }] });
    expect(await getStaffRole(c, "u1")).toBeNull();
  });
  it("disabled staff are not staff", async () => {
    const c = fakeClient({
      admin_users: ["u1"],
      staff_roles: [
        { user_id: "u1", role: "support", scopes: ["users.read"], disabled_at: "2026-01-01" },
      ],
    });
    expect(await getStaffRole(c, "u1")).toBeNull();
  });
  it("fails closed on a query error and on an unknown role", async () => {
    expect(await getStaffRole(fakeClient({ admin_users: ["u1"] }, true), "u1")).toBeNull();
    const c = fakeClient({
      admin_users: ["u1"],
      staff_roles: [{ user_id: "u1", role: "janitor", scopes: [] }],
    });
    expect(await getStaffRole(c, "u1")).toBeNull();
  });
});

describe("authorizeStaff", () => {
  const support = fakeClient({
    admin_users: ["s1"],
    staff_roles: [{ user_id: "s1", role: "support", scopes: ["users.read"] }],
  });
  it("non-staff get exactly UNAUTHORIZED_MESSAGE", async () => {
    await expect(
      authorizeStaff({ client: support, userId: "nobody", claims: ok, scope: "users.read" }),
    ).rejects.toThrow(exactly(UNAUTHORIZED_MESSAGE));
  });
  it("disabled staff get exactly UNAUTHORIZED_MESSAGE", async () => {
    const c = fakeClient({
      admin_users: ["s1"],
      staff_roles: [{ user_id: "s1", role: "support", scopes: ["users.read"], disabled_at: "x" }],
    });
    await expect(
      authorizeStaff({ client: c, userId: "s1", claims: ok, scope: "users.read" }),
    ).rejects.toThrow(exactly(UNAUTHORIZED_MESSAGE));
  });
  it("staff missing a scope get Forbidden: missing scope <name>", async () => {
    await expect(
      authorizeStaff({ client: support, userId: "s1", claims: ok, scope: "pro.grant" }),
    ).rejects.toThrow("Forbidden: missing scope pro.grant");
  });
  it("staff with the scope get role and scopes", async () => {
    const r = await authorizeStaff({
      client: support,
      userId: "s1",
      claims: ok,
      scope: "users.read",
    });
    expect(r).toEqual({ staffRole: "support", staffScopes: ["users.read"] });
  });
  it("no scope asked means any active staff member passes", async () => {
    const r = await authorizeStaff({ client: support, userId: "s1", claims: ok });
    expect(r.staffRole).toBe("support");
  });
  it("second factor is still enforced when ADMIN_REQUIRE_AAL2=true", async () => {
    await expect(
      authorizeStaff({
        client: support,
        userId: "s1",
        claims: { aal: "aal1" },
        scope: "users.read",
        requireAal2: "true",
      }),
    ).rejects.toThrow(SECOND_FACTOR_REQUIRED_MESSAGE);
    // a non-staff caller never learns about the second factor
    await expect(
      authorizeStaff({
        client: support,
        userId: "nobody",
        claims: { aal: "aal1" },
        scope: "users.read",
        requireAal2: "true",
      }),
    ).rejects.toThrow(exactly(UNAUTHORIZED_MESSAGE));
  });
  it("admin_users member with no staff_roles row is owner with every scope", async () => {
    const c = fakeClient({ admin_users: ["o1"] });
    const r = await authorizeStaff({ client: c, userId: "o1", claims: ok, scope: "user.delete" });
    expect(r.staffRole).toBe("owner");
  });
});
