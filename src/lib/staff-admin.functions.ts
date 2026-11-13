import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import {
  DEFAULT_SCOPES,
  SCOPES,
  effectiveScopes,
  isStaffRole,
  type StaffRole,
} from "./staff-scopes";

/**
 * Staff management for the console: who is staff, and what each person may do. Scope staff.manage, and on top of
 * that only an owner: a stored staff.manage on a non-owner row is ignored here, and the database refuses to store
 * one anyway. Nobody changes their own row, support_ai is not a login, and every change is one database call that
 * writes the allowlist, the role and the record together.
 */

const OWNER_ONLY_MESSAGE = "Only an owner can manage staff.";
const SUPPORT_AI_MESSAGE = "support_ai is not a login role.";
const MANAGE_MESSAGE = "staff.manage can only be granted to an owner.";

const roleSchema = z.enum(["owner", "support", "support_ai"]);
const scopesSchema = z.array(z.enum(SCOPES));

export type StaffMember = {
  userId: string;
  displayName: string | null;
  role: StaffRole;
  scopes: string[];
  disabled: boolean;
  addedAt: string;
};

type Ctx = { staffRole: StaffRole };
function assertOwner(context: Ctx) {
  if (context.staffRole !== "owner") throw new Error(OWNER_ONLY_MESSAGE);
}

export const staffListStaff = createServerFn({ method: "GET" })
  .middleware([requireStaff("staff.manage")])
  .handler(async ({ context }): Promise<StaffMember[]> => {
    assertOwner(context);
    const { data: rows, error } = await context.supabaseAdmin
      .from("staff_roles")
      .select("user_id, role, scopes, disabled_at, added_at")
      .order("added_at", { ascending: true });
    if (error) throw new Error("Could not read the staff list.");
    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: names, error: namesError } = await context.supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (namesError) throw new Error("Could not read the staff list.");
    const byId = new Map((names ?? []).map((n) => [n.id, n.display_name as string | null]));
    return (rows ?? [])
      .filter((r) => isStaffRole(r.role))
      .map((r) => ({
        userId: r.user_id,
        displayName: byId.get(r.user_id) ?? null,
        role: r.role as StaffRole,
        scopes: effectiveScopes(r.role as StaffRole, r.scopes ?? []),
        disabled: r.disabled_at != null,
        addedAt: r.added_at,
      }));
  });

function mapRpcError(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new Error("That person is already staff.");
  if (error.code === "P0002") return new Error("That person is not staff.");
  if (error.code === "42501" && /staff\.manage/.test(error.message ?? ""))
    return new Error(MANAGE_MESSAGE);
  if (error.code === "42501") return new Error("You cannot act on your own account.");
  if (error.code === "22023" && /support_ai/.test(error.message ?? ""))
    return new Error(SUPPORT_AI_MESSAGE);
  return new Error("Could not change the staff list. Nothing was changed.");
}

/** Adds someone who already has an account (found by their exact email) as support or owner. */
export const staffAddStaff = createServerFn({ method: "POST" })
  .middleware([requireStaff("staff.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().min(3).max(320),
        role: roleSchema,
        scopes: scopesSchema.optional(),
        reason: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertNotSelf, validateReason } = await import("./staff-audit.server");
    assertOwner(context);
    if (data.role === "support_ai") throw new Error(SUPPORT_AI_MESSAGE);
    const scopes = data.scopes ?? DEFAULT_SCOPES[data.role];
    if (data.role !== "owner" && scopes.includes("staff.manage")) throw new Error(MANAGE_MESSAGE);
    const reason = validateReason(data.reason);

    const { data: found, error: findError } = await context.supabaseAdmin.rpc(
      "staff_search_users",
      {
        p_q: data.email,
      },
    );
    if (findError) throw new Error("Search failed.");
    const person = (found ?? []).find((r) => r.email?.toLowerCase() === data.email.toLowerCase());
    if (!person)
      throw new Error("There is no account with that email. They need to sign up first.");
    assertNotSelf(context.userId, person.id);

    const { error } = await context.supabaseAdmin.rpc("staff_add_member", {
      p_actor: context.userId,
      p_actor_role: context.staffRole,
      p_user: person.id,
      p_role: data.role,
      p_scopes: data.role === "owner" ? [] : scopes,
      p_reason: reason,
    } as never);
    if (error) throw mapRpcError(error);
    return { ok: true };
  });

/** Changes a role, the scopes or the disabled flag of someone else. Omitted fields are left as they are. */
export const staffUpdateStaff = createServerFn({ method: "POST" })
  .middleware([requireStaff("staff.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: roleSchema.optional(),
        scopes: scopesSchema.optional(),
        disabled: z.boolean().optional(),
        reason: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertNotSelf, validateReason } = await import("./staff-audit.server");
    assertOwner(context);
    assertNotSelf(context.userId, data.userId);
    if (data.role === "support_ai") throw new Error(SUPPORT_AI_MESSAGE);
    if (data.role === undefined && data.scopes === undefined && data.disabled === undefined) {
      throw new Error("There is nothing to change.");
    }
    // An owner has every scope whatever is stored, so staff.manage is never stored on anyone; the database
    // re-checks against the stored role as well.
    if (data.scopes?.includes("staff.manage")) throw new Error(MANAGE_MESSAGE);
    const reason = validateReason(data.reason);
    const { error } = await context.supabaseAdmin.rpc("staff_update_member", {
      p_actor: context.userId,
      p_actor_role: context.staffRole,
      p_user: data.userId,
      p_role: data.role ?? null,
      p_scopes: data.scopes ?? null,
      p_disabled: data.disabled ?? null,
      p_reason: reason,
    } as never);
    if (error) throw mapRpcError(error);
    return { ok: true };
  });
