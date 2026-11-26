// Supabase Edge Function: get-season-status
//
// Client-invoked directly (standard user-JWT auth, same as
// complete-lesson -- not the service-role shared-secret pattern
// send-push uses, since there's a real end user asking for their own
// status here). Resolves the caller's previous week's cohort if it's
// unresolved (lazy, no cron -- same pattern as get_my_duels), then
// ensures the caller has a current-week cohort, and returns their
// live status. See docs/archive/2026-09/2026-09-22-deeper-
// gamification-design.md section 2.
import { createClient } from "@supabase/supabase-js";
import { suspendedResponseIfBanned } from "../_shared/account-status.ts";
import { weekStartFor, rankCohort } from "./season-math.ts";
import { latestDivision, settleCohort } from "./resolve.ts";

const COHORT_CAP = 30;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // A banned learner's token stays valid until it expires; the ban must not wait for that.
  const banned = await suspendedResponseIfBanned(admin, userId);
  if (banned) return banned;

  const now = new Date();
  const currentWeekStart = weekStartFor(now);
  const prevWeekStart = weekStartFor(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  let lastWeekResult: { division: number; rankInCohort: number; cohortSize: number } | null = null;

  // Already resolved (or nothing to resolve) if a placement row exists.
  const { data: existingPlacement } = await admin
    .from("season_placements")
    .select("division, rank_in_cohort, cohort_size")
    .eq("user_id", userId)
    .eq("week_start", prevWeekStart)
    .maybeSingle();

  let currentDivision = 1;

  if (existingPlacement) {
    lastWeekResult = {
      division: existingPlacement.division,
      rankInCohort: existingPlacement.rank_in_cohort,
      cohortSize: existingPlacement.cohort_size,
    };
    currentDivision = existingPlacement.division;
  } else {
    // Find the caller's previous-week cohort, if they had one.
    const { data: prevMembership } = await admin
      .from("season_cohort_members")
      .select("cohort_id, season_cohorts!inner(division, week_start, resolved_at)")
      .eq("user_id", userId)
      .eq("season_cohorts.week_start", prevWeekStart)
      .maybeSingle();

    if (prevMembership) {
      const cohortId = prevMembership.cohort_id;
      const cohortDivision = (prevMembership as any).season_cohorts.division;

      // The database ranks the cohort, writes every placement and sets resolved_at in ONE transaction (and locks the
      // cohort, so two members opening the screen at once settle it once). If it fails nothing was written and the
      // cohort stays unresolved for the next open or the next maintenance sweep.
      try {
        await settleCohort(admin as never, cohortId);
      } catch (e) {
        console.error("[get-season-status]", e instanceof Error ? e.message : "settle failed");
      }
      // Settled by this call, the sweep or a concurrent caller: re-read this user's placement.
      const { data: placement } = await admin
        .from("season_placements")
        .select("division, rank_in_cohort, cohort_size")
        .eq("user_id", userId)
        .eq("week_start", prevWeekStart)
        .maybeSingle();
      if (placement) {
        lastWeekResult = { division: placement.division, rankInCohort: placement.rank_in_cohort, cohortSize: placement.cohort_size };
        currentDivision = placement.division;
      } else {
        // Not settled (a failure above): keep what the learner earned before, else Division 1.
        currentDivision = await latestDivision(admin as never, userId).catch(() => cohortDivision);
      }
    }
    else {
      // No cohort last week (they skipped it): start from the division of their latest placement, else Division 1.
      currentDivision = await latestDivision(admin as never, userId).catch(() => 1);
    }
  }

  // Ensure a current-week cohort at currentDivision -- room-or-create,
  // same pattern as Teams' auto_join_team.
  let { data: currentMembership } = await admin
    .from("season_cohort_members")
    .select("cohort_id, season_cohorts!inner(week_start)")
    .eq("user_id", userId)
    .eq("season_cohorts.week_start", currentWeekStart)
    .maybeSingle();

  let cohortId: string;
  if (currentMembership) {
    cohortId = currentMembership.cohort_id;
  } else {
    const { data: openCohorts } = await admin
      .from("season_cohorts")
      .select("id, season_cohort_members(count)")
      .eq("division", currentDivision)
      .eq("week_start", currentWeekStart);

    const withRoom = (openCohorts ?? []).find((c: any) => (c.season_cohort_members[0]?.count ?? 0) < COHORT_CAP);

    if (withRoom) {
      cohortId = withRoom.id;
    } else {
      const { data: newCohort } = await admin
        .from("season_cohorts")
        .insert({ division: currentDivision, week_start: currentWeekStart })
        .select("id")
        .single();
      cohortId = newCohort!.id;
    }
    await admin.from("season_cohort_members").insert({ cohort_id: cohortId, user_id: userId });
  }

  const { data: xpRows } = await admin.rpc("get_cohort_weekly_xp", { _cohort_id: cohortId, _week_start: currentWeekStart });
  const members = (xpRows ?? []).map((r: { user_id: string; xp: number }) => ({ userId: r.user_id, xp: r.xp }));
  const ranked = rankCohort(members);
  const myRank = ranked.find((r) => r.userId === userId)?.rank ?? ranked.length;

  return jsonResponse(
    { division: currentDivision, rankInCohort: myRank, cohortSize: ranked.length, lastWeekResult },
    200,
  );
}

Deno.serve(handleRequest);
