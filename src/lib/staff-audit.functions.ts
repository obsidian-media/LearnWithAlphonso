import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { AUDIT_PREFIXES } from "./audit-labels";
import { requireStaff } from "./staff-middleware";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";

/** Reads the append-only action record (scope audit.read). Nothing here writes. */

export type AuditRow = {
  id: number;
  at: string;
  actorUserId: string | null;
  /** The actor's display name, or null (the screen then shows the short id). */
  actorName: string | null;
  actorRole: string;
  action: string;
  targetUserId: string | null;
  /** The target learner's display name (never an email), only when the caller also holds users.read; else null (short id). */
  targetName: string | null;
  reason: string | null;
  before: Json | null;
  after: Json | null;
};

export type AuditActor = {
  userId: string;
  displayName: string | null;
  role: string;
  disabled: boolean;
};

const TOO_MANY = "Too many reads. Wait a minute and try again.";
const PAGE = 50;
const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}/.test(v), "bad date");

/** The action filter matches by prefix ("user.ban" also finds "user.ban.partial"); LIKE wildcards are literal. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const staffListAudit = createServerFn({ method: "POST" })
  .middleware([requireStaff("audit.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        actor: z.string().uuid().optional(),
        target: z.string().uuid().optional(),
        /** Category filter: action prefixes ("user.", "report."). Only the known prefixes are accepted. */
        actions: z.array(z.enum(AUDIT_PREFIXES)).max(AUDIT_PREFIXES.length).optional(),
        /** Substring of the reason. LIKE wildcards in it are literal. */
        q: z.string().trim().min(1).max(100).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        cursor: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: AuditRow[]; nextCursor: number | null }> => {
    if (!(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.audit_read)))
      throw new Error(TOO_MANY);
    let query = context.supabaseAdmin
      .from("staff_audit_log")
      .select("id, at, actor_user_id, actor_role, action, target_user_id, reason, before, after")
      .order("id", { ascending: false })
      .limit(PAGE + 1);
    if (data.actor) query = query.eq("actor_user_id", data.actor);
    if (data.target) query = query.eq("target_user_id", data.target);
    if (data.actions && data.actions.length > 0) {
      // The prefixes are a closed list (validated above), so building the or() text from them cannot inject anything.
      query = query.or(data.actions.map((p) => `action.ilike.${escapeLike(p)}%`).join(","));
    }
    if (data.q) query = query.ilike("reason", `%${escapeLike(data.q)}%`);
    if (data.from) query = query.gte("at", data.from);
    if (data.to) query = query.lte("at", data.to);
    if (data.cursor) query = query.lt("id", data.cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error("Could not read the action record.");
    const page = (rows ?? []).slice(0, PAGE);
    const canSeeLearners = (context.staffScopes as readonly string[]).includes("users.read");
    const names = await resolveNames(
      context.supabaseAdmin,
      // Learner names only for a caller who may also look up learners (users.read); staff names always.
      page.flatMap((r) =>
        canSeeLearners ? [r.actor_user_id, r.target_user_id] : [r.actor_user_id],
      ),
    );
    return {
      rows: page.map((r) => ({
        id: r.id,
        at: r.at,
        actorUserId: r.actor_user_id,
        actorName: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
        actorRole: r.actor_role,
        action: r.action,
        targetUserId: r.target_user_id,
        targetName:
          canSeeLearners && r.target_user_id ? (names.get(r.target_user_id) ?? null) : null,
        reason: r.reason,
        before: r.before,
        after: r.after,
      })),
      nextCursor: (rows ?? []).length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  });

/**
 * Display names for the people on one page of the record: ONE read of profiles.display_name for the ids on the page
 * (never an email, never anything else). A person who was deleted or never set a name has no entry, and a failed read
 * gives an empty map: the screen then shows the short id, so the record is complete either way.
 */
async function resolveNames(
  client: { from: (table: "profiles") => unknown },
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    const { data } = (await (
      client.from("profiles") as {
        select: (c: string) => {
          in: (
            col: string,
            v: string[],
          ) => Promise<{ data: Array<{ id: string; display_name: string | null }> | null }>;
        };
      }
    )
      .select("id, display_name")
      .in("id", unique)) ?? { data: null };
    for (const r of data ?? []) if (r.display_name?.trim()) out.set(r.id, r.display_name.trim());
  } catch {
    // names are a convenience; the record is still complete without them
  }
  return out;
}

/**
 * The people who appear as an actor in the record, for the Actor filter. Staff only (the database function joins the
 * staff tables), readable with audit.read, so a non-owner auditor can use it where staffListStaff (owner only) cannot.
 */
export const staffListAuditActors = createServerFn({ method: "POST" })
  .middleware([requireStaff("audit.read")])
  .handler(async ({ context }): Promise<AuditActor[]> => {
    if (!(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.audit_read)))
      throw new Error(TOO_MANY);
    const { data, error } = await context.supabaseAdmin.rpc("staff_audit_actors");
    if (error) throw new Error("Could not read the staff list.");
    return (data ?? []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      role: r.role,
      disabled: r.disabled,
    }));
  });
