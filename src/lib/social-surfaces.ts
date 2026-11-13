/**
 * Every RPC and RLS policy through which one learner sees or reaches another. A learner with an active block or ban
 * (user_restrictions) must not appear to others through any of them and must not be able to act through them
 * (20261113100100_restriction_enforcement.sql).
 *
 * restriction-enforcement.test.ts EXECUTES each entry as seeded users, and fails when a function or policy that
 * references blocked_users is not listed here, so a new social surface cannot ship without its entry (and a probe).
 *
 *   hidden   rows about a restricted learner are left out of what others read.
 *   refused  a restricted learner cannot do it, and nobody can do it toward a restricted learner.
 *
 * `defined` is the migration that last defined the object before the enforcement migration replaced it (the
 * evidence for the entry); `via` marks an entry that is enforced by the helper it calls.
 */
export type SocialSurface = {
  name: string;
  kind: "function" | "policy";
  /** For a policy: its table. */
  table?: string;
  behavior: "hidden" | "refused";
  defined: string;
  via?: string;
};

export const SOCIAL_SURFACES: readonly SocialSurface[] = [
  // ---- friends and invites ----
  {
    name: "accept_friend_invite",
    kind: "function",
    behavior: "refused",
    defined: "20260930140000_fix_friend_invite_forgeable_uuid.sql",
  },
  {
    name: "get_friend_invite_preview",
    kind: "function",
    behavior: "hidden",
    defined: "20260930140000_fix_friend_invite_forgeable_uuid.sql",
  },
  {
    name: "get_friends_progress",
    kind: "function",
    behavior: "hidden",
    defined: "20260928020000_block_and_report.sql",
  },
  {
    name: "fr_view_own",
    kind: "policy",
    table: "friendships",
    behavior: "hidden",
    defined: "20260918150000_optimize_rls_auth_uid.sql",
  },
  {
    name: "nudges_insert_to_friend",
    kind: "policy",
    table: "nudges",
    behavior: "refused",
    defined: "20260930070000_nudge_push_rate_limit.sql",
  },
  {
    name: "friend_activity_readable_by_friends",
    kind: "policy",
    table: "friend_activity_events",
    behavior: "hidden",
    defined: "20260928020000_block_and_report.sql",
  },
  // ---- leaderboards and leagues ----
  {
    name: "get_leaderboard",
    kind: "function",
    behavior: "hidden",
    defined: "20261105100800_weekly_xp_totals.sql",
  },
  {
    name: "get_my_league_standing",
    kind: "function",
    behavior: "hidden",
    defined: "20261107120000_profile_data.sql",
  },
  // ---- duels, including the open queue ----
  {
    name: "create_duel",
    kind: "function",
    behavior: "refused",
    defined: "20260928020000_block_and_report.sql",
  },
  {
    name: "respond_to_duel",
    kind: "function",
    behavior: "refused",
    defined: "20260930100000_fix_respond_to_duel_blocked_users_gap.sql",
  },
  {
    name: "join_open_duel_queue",
    kind: "function",
    behavior: "refused",
    defined: "20261105100500_open_duel_safeguards.sql",
  },
  {
    name: "get_my_duels",
    kind: "function",
    behavior: "hidden",
    defined: "20260920060000_v3_engagement_mechanics.sql",
  },
  // ---- study buddies: matching, requests, messages ----
  {
    name: "request_buddy",
    kind: "function",
    behavior: "refused",
    defined: "20261006180000_buddy_pairing.sql",
  },
  {
    name: "respond_buddy_request",
    kind: "function",
    behavior: "refused",
    defined: "20261006180000_buddy_pairing.sql",
    via: "_create_buddy_pair",
  },
  {
    name: "_create_buddy_pair",
    kind: "function",
    behavior: "refused",
    defined: "20261007120000_buddy_matching.sql",
  },
  {
    name: "join_buddy_pool",
    kind: "function",
    behavior: "refused",
    defined: "20261013100100_buddy_pool_exclusion.sql",
  },
  {
    name: "get_buddy_requests",
    kind: "function",
    behavior: "hidden",
    defined: "20261006180000_buddy_pairing.sql",
  },
  {
    name: "get_my_buddy",
    kind: "function",
    behavior: "hidden",
    defined: "20261008130900_buddy_matching_paused.sql",
  },
  {
    name: "get_buddy_messages",
    kind: "function",
    behavior: "hidden",
    defined: "20261007100000_buddy_messages.sql",
  },
  {
    name: "send_buddy_message",
    kind: "function",
    behavior: "refused",
    defined: "20261008130900_buddy_matching_paused.sql",
  },
  // ---- teams and team missions ----
  {
    name: "join_team",
    kind: "function",
    behavior: "refused",
    defined: "20261008130500_team_integrity.sql",
    via: "_join_team_impl",
  },
  {
    name: "join_public_team",
    kind: "function",
    behavior: "refused",
    defined: "20260922040000_teams.sql",
    via: "_join_team_impl",
  },
  {
    name: "create_team",
    kind: "function",
    behavior: "refused",
    defined: "20261008130500_team_integrity.sql",
    via: "_join_team_impl",
  },
  {
    name: "auto_join_team",
    kind: "function",
    behavior: "refused",
    defined: "20261008130500_team_integrity.sql",
    via: "_join_team_impl",
  },
  {
    name: "kick_team_member",
    kind: "function",
    behavior: "refused",
    defined: "20260930150000_fix_kicked_member_instant_rejoin.sql",
  },
  {
    name: "get_team_members",
    kind: "function",
    behavior: "hidden",
    defined: "20261008131000_team_members_owner_sees_blocked.sql",
  },
  {
    name: "get_team_leaderboard",
    kind: "function",
    behavior: "hidden",
    defined: "20261105100800_weekly_xp_totals.sql",
  },
  {
    name: "get_my_team",
    kind: "function",
    behavior: "hidden",
    defined: "20261105100800_weekly_xp_totals.sql",
  },
  {
    name: "team_members_select_own_team",
    kind: "policy",
    table: "team_members",
    behavior: "hidden",
    defined: "20261013100300_private_teams_row_visibility.sql",
  },
];

/**
 * Functions that mention blocked_users but are not a surface: they create or react to a block itself, not a place
 * where learners meet. The registry test accepts these and nothing else.
 */
export const BLOCKED_USERS_NON_SURFACES: readonly string[] = ["block_user", "_buddy_on_block"];

/**
 * Surfaces that deliberately do not hide a restricted learner, with the reason (the registry test pins that each
 * still exists, so a stale exemption cannot linger). Team mission totals are aggregates with no name or progress of a
 * restricted learner; the own-row policies show only ids the learner already has.
 */
export const RESTRICTION_EXEMPT_NOTES: readonly string[] = [
  "get_team_mission: aggregate team totals only",
  "duels_select_own, buddy_pairs_select_own, buddy_requests_select_own, buddy_messages_select_own: own rows, ids only",
];
