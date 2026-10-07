import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Study buddies (study together, Phase 3a). Every write is a SECURITY DEFINER RPC that answers with a typed status
// (see BuddyStatus in ./buddy); every function here throws on an RPC error, so a failed lookup is never shown as
// "no buddy" (the Teams screens did that, which hid the broken team functions: PR #237).

export type MyBuddy = {
  pairId: string;
  buddyId: string;
  buddyName: string;
  buddyAvatarSeed: string;
  pairedAt: string;
  weekStart: string;
  myCount: number;
  buddyCount: number;
  goal: number;
  streakWeeks: number;
  graceAvailable: boolean;
  lastOutcome: string | null;
} | null;

export type BuddyRequest = {
  requestId: string;
  direction: "incoming" | "outgoing";
  otherId: string;
  otherName: string;
  otherAvatarSeed: string;
  requestedAt: string;
};

export type BuddyActionResult = { status: string };

function statusOf(rows: { status: string }[] | null): BuddyActionResult {
  return { status: rows?.[0]?.status ?? "unknown" };
}

export const getMyBuddy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyBuddy> => {
    const { data: rows, error } = await context.supabase.rpc("get_my_buddy");
    if (error) throw new Error(`getMyBuddy: ${error.message}`);
    const r = rows?.[0];
    if (!r) return null;
    return {
      pairId: r.pair_id,
      buddyId: r.buddy_id,
      buddyName: r.buddy_name,
      buddyAvatarSeed: r.buddy_avatar_seed,
      pairedAt: r.paired_at,
      weekStart: r.week_start,
      myCount: r.my_count,
      buddyCount: r.buddy_count,
      goal: r.goal,
      streakWeeks: r.streak_weeks,
      graceAvailable: r.grace_available,
      lastOutcome: r.last_outcome ?? null,
    };
  });

export const getBuddyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BuddyRequest[]> => {
    const { data: rows, error } = await context.supabase.rpc("get_buddy_requests");
    if (error) throw new Error(`getBuddyRequests: ${error.message}`);
    return (rows ?? []).map((r) => ({
      requestId: r.request_id,
      direction: r.direction === "incoming" ? "incoming" : "outgoing",
      otherId: r.other_id,
      otherName: r.other_name,
      otherAvatarSeed: r.other_avatar_seed,
      requestedAt: r.requested_at,
    }));
  });

export const requestBuddy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ friendId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BuddyActionResult> => {
    const { data: rows, error } = await context.supabase.rpc("request_buddy", {
      _friend: data.friendId,
    });
    if (error) throw new Error(`requestBuddy: ${error.message}`);
    return statusOf(rows);
  });

export const respondBuddyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), accept: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<BuddyActionResult> => {
    const { data: rows, error } = await context.supabase.rpc("respond_buddy_request", {
      _request: data.requestId,
      _accept: data.accept,
    });
    if (error) throw new Error(`respondBuddyRequest: ${error.message}`);
    return statusOf(rows);
  });

export const cancelBuddyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BuddyActionResult> => {
    const { data: rows, error } = await context.supabase.rpc("cancel_buddy_request", {
      _request: data.requestId,
    });
    if (error) throw new Error(`cancelBuddyRequest: ${error.message}`);
    return statusOf(rows);
  });

export const endBuddy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BuddyActionResult> => {
    const { data: rows, error } = await context.supabase.rpc("end_buddy");
    if (error) throw new Error(`endBuddy: ${error.message}`);
    return statusOf(rows);
  });
