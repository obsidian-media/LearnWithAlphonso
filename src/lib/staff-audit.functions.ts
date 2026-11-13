import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireStaff } from "./staff-middleware";

/** Reads the append-only action record (scope audit.read). Nothing here writes. */

export type AuditRow = {
  id: number;
  at: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  targetUserId: string | null;
  reason: string | null;
  before: Json | null;
  after: Json | null;
};

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
        action: z.string().trim().min(1).max(80).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        cursor: z.number().int().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: AuditRow[]; nextCursor: number | null }> => {
    let query = context.supabaseAdmin
      .from("staff_audit_log")
      .select("id, at, actor_user_id, actor_role, action, target_user_id, reason, before, after")
      .order("id", { ascending: false })
      .limit(PAGE + 1);
    if (data.actor) query = query.eq("actor_user_id", data.actor);
    if (data.target) query = query.eq("target_user_id", data.target);
    if (data.action) query = query.ilike("action", `${escapeLike(data.action)}%`);
    if (data.from) query = query.gte("at", data.from);
    if (data.to) query = query.lte("at", data.to);
    if (data.cursor) query = query.lt("id", data.cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error("Could not read the action record.");
    const page = (rows ?? []).slice(0, PAGE);
    return {
      rows: page.map((r) => ({
        id: r.id,
        at: r.at,
        actorUserId: r.actor_user_id,
        actorRole: r.actor_role,
        action: r.action,
        targetUserId: r.target_user_id,
        reason: r.reason,
        before: r.before,
        after: r.after,
      })),
      nextCursor: (rows ?? []).length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  });
