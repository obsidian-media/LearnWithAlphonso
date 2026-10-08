# Proving a SQL function works: the probe harness

There is no local Postgres for this project, so migrations only ever run against production, and a text-pattern test cannot
see a run-time SQL error. Teams were broken for weeks (`_join_team_impl`, `get_my_team`, `claim_weekly_quest`: SQLSTATE 42702
"column reference is ambiguous") behind green tests. Before merging any new or changed SQL function, **execute it** as a
seeded user inside a transaction that ends in `ROLLBACK`.

## The pattern

Run through the Supabase MCP `execute_sql` (project `qhcjpfbxfcltjbiuknyt`), one transaction:

```sql
BEGIN;
SET LOCAL statement_timeout = '60s';   -- a huge single script once hit an MCP "expired requestState" with no DB harm
SET LOCAL lock_timeout = '10s';
CREATE TEMP TABLE res (n serial, scenario text, detail text);
GRANT ALL ON res TO PUBLIC; GRANT ALL ON SEQUENCE res_n_seq TO PUBLIC;   -- the function runs as another role

-- seed throwaway users (the signup trigger creates profiles / user_progress), then whatever rows the scenario needs
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
 ('00000000-0000-0000-0000-0000000000e1','t-1@example.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.language_progress (user_id, language, xp, league_tier) VALUES ('00000000-0000-0000-0000-0000000000e1','en',0,'bronze');

-- call a function AS a user and capture an error instead of aborting the script
CREATE FUNCTION pg_temp.probe(lbl text, uid uuid, q text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);          -- this is what auth.uid() reads
  EXECUTE 'SELECT row_to_json(x)::text FROM (' || q || ') x' INTO r;
  INSERT INTO res (scenario, detail) VALUES (lbl, coalesce(r, 'no row'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO res (scenario, detail) VALUES (lbl, SQLSTATE || ': ' || SQLERRM);
END $f$;

SELECT pg_temp.probe('OLD behaviour', '00000000-0000-0000-0000-0000000000e1', 'SELECT * FROM public.claim_weekly_quest(...)');
-- CREATE OR REPLACE FUNCTION ... (the migration's SQL, installed inside the transaction)
SELECT pg_temp.probe('NEW behaviour', '00000000-0000-0000-0000-0000000000e1', 'SELECT * FROM public.claim_weekly_quest(...)');

SELECT n, scenario, detail FROM res ORDER BY n;
ROLLBACK;
```

Afterwards confirm nothing leaked: `SELECT count(*) FROM auth.users WHERE email LIKE 't-%@example.test'` is 0, no `idle in transaction`
in `pg_stat_activity`, and the deployed function text is unchanged.

## Rules that cost us time

- **An early-exit "ok" proves nothing.** A function that returns early (no team, no rows) never reaches the broken statement.
  Seed state that drives EVERY branch: a team member for `get_my_team`, enough lessons to complete a challenge, a quest whose target is met.
- Show the OLD function failing in the same script, then the NEW one working: that is what makes the proof falsifiable.
- Do not call `get_my_team`-style functions with real user ids; use throwaway users and a rolled-back transaction only.
- Functions that pay once (`rewarded_at IS NULL` guards, `ON CONFLICT DO NOTHING` recorded rows) need a fresh user per scenario, or the second call proves nothing.

## Scenarios proven this way (2026-10-06)

| Function | What the script showed |
|---|---|
| `create_team`, `auto_join_team`, `join_team` (via `_join_team_impl`) | deployed: 42702; fixed: team created, joiner added (2 members), auto-join places the user |
| `get_my_team` | deployed: 42702 for any team member; fixed: returns the member's team |
| `get_weekly_challenges` | French-only learner: deployed pays nothing; fixed +100 per completed challenge on `fr`; a learner with `en` and `fr` rows whose newest lesson is French gets `fr` only |
| weekly team bonus (in `get_my_team`) | French member +100, Spanish member +100, member with no lessons 0 |
| `claim_weekly_quest` | deployed: 42702; fixed: pays the reward once (+40), second claim answers `already-claimed`, one claim row |
| `get_team_mission`, `_resolve_team_mission` | single payout, late joiner, French-only team paid on `fr`, team shrinking to one member, previous week resolved, UTC boundary under a UTC+14 session |

Study together (2026-10-06/07), same harness: buddy pairing (`20261006180000`: request/ask-back/late accept/unfriend/block/resolver weeks/end), preset messages (`20261007100000`: allowed ids only, 20 per hour then `rate_limited` (loop in a DO block: a LATERAL call with constant arguments runs once), unfriend stops sending, RLS outsider sees nothing) and matching (`20261007120000`: not studying, waiting, block and past buddy skipped, CEFR two steps apart not matched, oldest first, pool cleared on pairing, matched pair can message, switch off then leave still works, block ends a matched pair and they are never re-matched, own pool row only). Scripts were split under ~20 KB: a ~29 KB execute_sql request fails with "Invalid or expired requestState" before reaching the database.

## Social, moderation and profile privacy (2026-10-08)

Same harness, each migration installed inside `BEGIN ... ROLLBACK` with the deployed behaviour checked first ("old"):

| Migration | What the script showed |
|---|---|
| Filter v2 (`20261008130000`) | old filter let compounds, leetspeak, full-width and mathematical letters, and dot- or hyphen-split words through; v2: 51 blocked (incl. bidi overrides, tag characters, combining marks, punctuation-split words), 6 invalid, 59 allowed incl. José, 李雷, Dick Van Dyke, Jenny Coon, My Gay Uncle, râpé, a Persian name with ZWNJ; team names use the same rules, stored cleaned; `admin_rename_team` service-only |
| Names (`20261008130100`) | old: a 45-character `full_name` aborted sign-up (23514); new: 8 metadata shapes all get a profile, `confirm_display_name`, trigger stamp, email-prefix names migrated to handles, admin reset; 500 handles all pass the filter |
| `get_team_members` (`20261008130200`) | old: a blocked teammate was listed; new: hidden in both directions |
| Reports (`20261008130300`) | AI report needs no reported user; kind/context checks; notify queued with the secret header; throttled at 10/hour; no secret, no request, insert still succeeds |
| Grants (`20261008130400`) | anon lost the term list, `_random_team_name`, `notify_nudge_push`; rename, `create_team`, `auto_join_team`, nudge still work as authenticated |
| Teams (`20261008130500`) | old: owner leave orphaned the team, an RLO team name was stored, a refused auto-join left an empty team; new: ownership passes to the earliest joiner or the team closes, also on account deletion, own-team rejoin no-op, Crockford codes, no zero-XP weekly winner |
| Quests (`20261008130600`) | old: a second claim with another date paid again; new: `invalid-week`, `invalid-course`, `no-course-progress`, one claim per week |
| Matching (`20261008130700`) | old: 25 joins accepted; new: kill switch, 13+ record, presets only, block ends pair, no re-match, 20/hour, 3 matches/7 days |
| Profiles own-row (`20261008130800`) | old: another learner read country/theme; new: 0 rows of another profile, own row intact, own update ok, cross-row update a no-op; leaderboard/friends/team/buddy/request/invite RPCs still name the other learner; policies exactly own-row; no view |
| Kill switch mute (`20261008130900`) | old: matched pair sent while off; new: `matching_paused` both sides, friend pair sends, progress kept, switch back on restores, `get_my_buddy` exposes `matching_enabled`, ACL restored |
| Owner kick list (`20261008131000`) | old: owner could not see the member they blocked; new: shown with `blocked = true` and kickable; a member who blocked the owner stays hidden; non-owners unchanged |
| Name reset (`20261008131100`) | refused above the approved count; resets failing names to unconfirmed handles and failing team names, with backups; 500 handles all pass |

`net.http_request_queue` and Vault: the MCP role cannot write `vault.secrets`, so the "no secret" branch is probed before a throwaway secret is created, not by deleting one.

The static guard for the most common mistake is `src/lib/plpgsql-output-column-clash.test.ts`.

## AI consent and AI output check (2026-10-11)

Same harness, both migrations installed inside `BEGIN ... ROLLBACK` after checking the deployed behaviour ("old"): 28 rows, 0 failures, leak check 0 users / 0 functions / 0 columns.

| Function | What the script showed |
|---|---|
| `set_ai_consent`, `get_ai_consent`, column guard (`20261011100000`) | missing before install; anon refused; grant stamps a time, withdraw clears it, NULL refused, signed-out refused, no profile row refused; another learner unaffected and unable to read the row; a direct PATCH of `ai_consent_at` refused with `ai-consent-via-rpc-only` while other columns still update; `service_role` and `postgres` may write the column (the review account can be reset); sign-up still works |
| `ai_output_blocked` (`20261011100100`) | blocked-term verdicts on prose (English profanity and French `retard` blocked; `râpé` and `cono` not blocked by the v2 filter); 20-element cap (exactly 20 passes; 21, a 2-D array and a 4x10 array are refused with `invalid-argument`); empty and NULL inputs; anon refused; service role allowed |

`ai_output_blocked` service-role only (`20261012300000`), same harness, rolled back; leak check 0 users, 0 idle transactions: before the migration a signed-in user can call it (one call with 20 strings of 8000 characters measured about 2 seconds of database time, which made it a load vector); after it, `authenticated` and `anon` get `42501 permission denied`, `service_role` still gets verdicts and still refuses a two-dimensional array.
