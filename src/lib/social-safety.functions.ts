import { AI_REPORT_MESSAGE_MAX } from "./ai-consent-copy";
import { reportMessageFits } from "./ai-report-budget";
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

/**
 * Reports an offensive team NAME, the web twin of reportTeamName in ProgressSyncClient+SocialSafety.swift. A team
 * name is the one piece of user-written content strangers see with no person attached, so the report is filed
 * against the team's creator with `kind: "team_name"` and `context.team_id` (20261008130300_content_reports_
 * moderation_ops.sql), which is what the moderation queue reads to find the exact team. `reportUser` cannot do this
 * (it has no kind or context), so this is its own server function.
 *
 * `{ ok: false, reason: "no-creator" }` files nothing: an auto-created team has a system-generated name and no
 * creator, so there is no person to report; the same answer covers a team the caller cannot see (a private team of
 * someone else's), because the lookup is under the caller's own RLS (`teams_select_visible`) and finds no row.
 */
export const reportTeamName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ teamId: z.string().uuid(), reason: reportReasonSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; reason: "no-creator" | "own-team" | "failed" | null }> => {
      const { data: team, error: lookupError } = await context.supabase
        .from("teams")
        .select("created_by")
        .eq("id", data.teamId)
        .maybeSingle();
      if (lookupError) return { ok: false, reason: "failed" };
      const creator = team?.created_by;
      if (!creator) return { ok: false, reason: "no-creator" };
      // The apps only hide the menu on a team you own; the table also refuses it (CHECK reporter <> reported). Said
      // here so a caller that skips the menu gets a plain answer, not a failed insert.
      if (creator === context.userId) return { ok: false, reason: "own-team" };
      const { error } = await context.supabase.from("content_reports").insert({
        reported: creator,
        reason: data.reason,
        kind: "team_name",
        context: { team_id: data.teamId },
      });
      return error ? { ok: false, reason: "failed" } : { ok: true, reason: null };
    },
  );

const aiReportReasonSchema = z.enum(["ai_inappropriate", "ai_harmful", "ai_incorrect", "ai_other"]);
const aiReportContextSchema = z
  .object({
    // A loose length bound first (UTF-16 units, so emoji count twice); the exact code point cap and the byte budget
    // the database check needs are the refinement below.
    message: z
      .string()
      .min(1)
      .max(AI_REPORT_MESSAGE_MAX * 2),
    surface: z.enum(["hector", "conversation", "campaign", "explain", "support"]),
    course: z.enum(["en", "fr", "es"]),
    scenario_id: z.string().max(100).optional(),
    campaign_id: z.string().max(100).optional(),
    scene_index: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (c) =>
      reportMessageFits(c.message, {
        course: c.course,
        scenarioId: c.scenario_id,
        campaignId: c.campaign_id,
      }),
    { message: "message too long", path: ["message"] },
  );

/**
 * A report on an AI message. The moderation queue (content_reports, kind 'ai_response', reported NULL) and its
 * notify trigger take it from here. The message text lives in context.message. Insert-only, own reports, as for
 * reportUser.
 */
export const reportAiResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reason: aiReportReasonSchema, context: aiReportContextSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { error } = await context.supabase.from("content_reports").insert({
      kind: "ai_response",
      reason: data.reason,
      context: { ...data.context, platform: "web" },
    });
    return { ok: !error };
  });
