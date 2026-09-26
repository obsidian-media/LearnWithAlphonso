import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Block and report for the web app (App Store Guideline 1.2 -- friends,
 * duels, open matchmaking and leaderboards all show display names, so
 * this needed a way to block an abusive user and report content here
 * too, not just on iOS). Every table, RLS policy, RPC and enforcement
 * point already exists and is already fully wired
 * (supabase/migrations/20260928020000_block_and_report.sql) -- the web
 * app just never called any of it. Mirrors ios/LearnWithAlphonsoKit/
 * Sources/LearnWithAlphonsoKit/ProgressSyncClient+SocialSafety.swift's
 * shape exactly, so the two clients stay in step.
 */

/**
 * Calls the `block_user` SECURITY DEFINER RPC -- inserts the block row
 * AND deletes any existing friendship in both directions in one atomic
 * call. A plain client insert can't do the second half (the reverse-
 * direction friendship row is owned by the other user).
 */
export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { data: rows, error } = await context.supabase.rpc("block_user", {
      _target: data.userId,
    });
    if (error) return { ok: false, message: "server-error" };
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ?? { ok: false, message: "unknown error" };
  });

const reportReasonSchema = z.enum([
  "spam",
  "harassment",
  "inappropriate_content",
  "fake_account",
  "other",
]);

/**
 * Plain insert into `content_reports` -- the RLS policy
 * (`content_reports_insert_own`) is the whole trust boundary here, no
 * RPC needed. `reporter` is left out of the insert body (the column
 * defaults to `auth.uid()`, and the RLS WITH CHECK is what actually
 * enforces it).
 */
export const reportUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), reason: reportReasonSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { error } = await context.supabase
      .from("content_reports")
      .insert({ reported: data.userId, reason: data.reason });
    return { ok: !error };
  });
