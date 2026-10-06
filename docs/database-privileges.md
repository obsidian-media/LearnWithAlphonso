# Database privileges: what the client roles may do

Postgres decides access in two layers. **Privileges** are table-wide permissions ("this role may INSERT on this table"). **Row-level security (RLS)** then decides which rows. A request through the API runs as one of two roles:

- `anon`: anyone holding the app's public key, signed in or not.
- `authenticated`: any signed-in user.

The server routes and Edge Functions use `service_role`, which bypasses RLS and keeps full access.

## The rule since 2026-10-06

**A new table in `public` starts with no privileges for `anon` or `authenticated`.** Migration `20261006120000_tighten_default_table_privileges.sql` changed Supabase's default (which handed both roles every privilege on every new table and left RLS as the only barrier). A migration that creates a table must now state, in the same file, what clients may do:

```sql
CREATE TABLE public.example (...);
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;
CREATE POLICY "example_select_own" ON public.example FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.example TO authenticated;      -- exactly what the policies allow, nothing more
GRANT ALL ON public.example TO service_role;
```

A table only the server touches carries the marker instead: `-- client-grants: none public.example`.

`src/lib/migration-grants.ts` is the CI guard (`migration-grants.test.ts` runs it over every migration after the cutoff): it fails a new table with no grant and no marker, and a client-facing policy with no grant (the policy could never apply, and every client call would return "permission denied"). Keep privileges and policies in step: a privilege without a policy is inert today and dangerous the day someone adds a permissive policy.

After deploying, also prove the default really is closed (one-off, nothing persists):

```sql
BEGIN; CREATE TABLE public._acl_probe (id int);
SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = '_acl_probe';
ROLLBACK;
```

Only `postgres`/`service_role` should appear. After deploying a table migration, check the real grants (a test of the SQL text cannot see Supabase defaults; this is how `learning_goals` was found over-granted):

```sql
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = '<table>' GROUP BY grantee ORDER BY grantee;
```

## What changed on 2026-10-06 (and what did not)

Removed from existing tables: every write privilege (INSERT, UPDATE, DELETE) plus TRUNCATE, TRIGGER and REFERENCES from `anon`; TRUNCATE, TRIGGER and REFERENCES from `authenticated`. Nothing else was touched. This could not change app behaviour: `anon` has no write policy anywhere, and nothing uses the other three privileges (the API cannot issue TRUNCATE; foreign-key checks run as the table owner).

**Not changed in the first step** (done in the second step below): `authenticated`'s own INSERT/UPDATE/DELETE/SELECT. Some were inert (no matching policy) but client code may still attempt them. `deleteMyAccount` issues DELETEs as the caller on `USER_DELETE_TABLES`; where a privilege exists without a policy that DELETE is a silent no-op, and removing the privilege would turn it into an error. That mapping was done for the second step below. Also unchanged: `service_role`, column-level grants (`teams` keeps its column-level SELECT for `authenticated`), and tables created by `supabase_admin` (dashboard or extensions), whose default ACL the migration role cannot change: create tables through migrations.

### Second step, 2026-10-06 (`20261006130000_trim_authenticated_unbacked_dml.sql`)

Removed `authenticated`'s INSERT/UPDATE/DELETE on 34 tables where **no RLS policy backs the privilege** (RLS already denied it, so this changes only the error a client would see). Audited against live `pg_policies`, every web, Edge Function, iOS and Android write path, and the `public` functions (no SECURITY INVOKER function writes). Per-table list: the `EXPECTED` map in `src/lib/trim-authenticated-dml-migration.test.ts`, which also fails if a policy created in the migrations depends on a revoked privilege. SELECT was deliberately not touched. `deleteMyAccount` no longer pre-deletes from `activity_days`, `user_progress`, `ai_usage` and `ai_rate_limits` (they had a grant but no DELETE policy, so those deletes were silent no-ops; ON DELETE CASCADE removes the rows). Rule of thumb for new tables: grant exactly what a policy backs.

**The audit found a live bug.** `completeLessonRemote` inserted into `friend_activity_events` through the user's RLS client, but that table has a SELECT policy only, so every web lesson completion that earned XP threw after saving progress and the lesson screen showed 0 XP (since the 2026-09-29 error-surfacing change; the friends-feed event had been silently dropped since 2026-09-19). Fixed: the insert now uses the service-role client, like the `complete-lesson` Edge Function. `src/lib/rls-client-writes.test.ts` now fails if server code writes through `supabase.from(...)` to a table with no policy for that command; mocks had hidden this because they returned success.

Functions were audited and left alone: only six functions in `public` are executable by `anon`, five are plain invoker helpers and one (`notify_nudge_push`) is a trigger function that cannot be called through the API.

## Snapshot before the change (the rollback reference)

Grants for `anon` / `authenticated`, grouped by identical pattern. Every table listed has RLS enabled. "7" = DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE.

| Pattern | Tables |
|---|---|
| anon 7, authenticated 7 | achievements, ai_rate_limits, ai_usage, challenge_completions, challenge_templates, duel_queue, duels, friend_invite_codes, lessons, levels, placement_questions, podcast_playback, podcast_transcripts, profiles, questions, scenarios, season_cohort_members, season_cohorts, season_placements, team_kicks, team_members, team_weekly_rewards, units, user_weekly_quest_claims, vocab_images, weakness_events, weekly_quests |
| anon 7, authenticated 7 minus INSERT, UPDATE (earlier hardening) | activity_days, language_progress, lesson_completions, review_items, user_achievements, user_progress |
| anon 7, authenticated 7 minus INSERT | friendships |
| anon 7, authenticated 7 minus SELECT (column-level SELECT instead) | teams |
| anon and authenticated both REFERENCES, SELECT, TRIGGER, TRUNCATE | podcast_episodes, podcast_folders |
| anon and authenticated both DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | podcast_play_events |
| no anon; authenticated 7 | blocked_users, content_reports, device_tokens, friend_activity_events, nudges |
| service_role only | admin_users, apple_auth_tokens |
| authenticated SELECT only (fixed earlier by 20261006110000) | learning_goals |

Default privileges for `postgres` in `public` before: tables `anon`, `authenticated`, `service_role` each `arwdDxtm`; sequences `rwU`; functions `X`. Only the table default changed. Rollback SQL is at the top of the migration.

## Follow-ups

1. ~~Trim `authenticated`'s inert DML privileges~~ done in the second step above. Remaining there: inert SELECT on tables with no SELECT policy (challenge_completions, duel_queue, friend_invite_codes, season_*, team_kicks, team_weekly_rewards, content_reports), which needs a read-path check first.
2. Decide whether `anon` SELECT should be limited to the tables with a public-readable policy (achievements, lessons, levels, placement_questions, questions, scenarios, units, vocab_images, weekly_quests); today `anon` can SELECT every table and RLS returns no rows.
3. If a table is ever created by `supabase_admin`, run `REVOKE ALL ... FROM anon, authenticated` on it by hand.
