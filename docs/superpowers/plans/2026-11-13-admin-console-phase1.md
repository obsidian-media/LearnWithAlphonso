# Admin console phase 1 (roles, action record, user management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (one implementer for the whole plan). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin app into a staff console with roles and scopes, an append-only action record, and learner management (search, learner page, gift Pro, block, ban, delete).

**Architecture:** Scopes are checked on the server by a new `requireStaff(scope)` middleware that extends today's `requireAdmin` (session → allowlist → second factor) with a role/scope lookup. Every write is a server function that changes data and writes its audit row in one SECURITY DEFINER SQL call (or, for steps with external calls, writes requested/completed/failed rows). Gift Pro uses RevenueCat promotional entitlements so all platforms see it; block and ban are `user_restrictions` rows enforced in the database.

**Tech Stack:** TanStack Start (admin app in `admin/`, shared `src/lib`), Supabase Postgres (migrations, RLS, SECURITY DEFINER), RevenueCat REST v1, Vitest + PGlite, SwiftUI/Compose for two small native touches.

**Spec:** `docs/superpowers/specs/2026-11-13-admin-console-and-support-design.md` (Phase 1 and "Calls made after the builder review").

**Status (2026-11-13): all ten tasks done and merged in #496** (two migrations, `20261113100000` and `20261113100100`; the owner merges migration PRs). Mutations that went red during the work: `hasScope` always true, the audit trigger dropped, the leaderboard weekly-branch check removed, search wildcard escaping removed, the `requireSupabaseAuth` ban check disabled, delete no longer stopping on an Auth failure, `assertNotSelf` removed in the staff update, `requireStaff` removed from a function, the `pro.grant` scope loosened. Not verified when it merged: the Swift build (CI) and the Android app module compile (only `:core:test` ran); console screenshots came from the views with sample data, not a live backend. The checkboxes below are the original plan, not a live checklist.

## Global Constraints

- Repo is PUBLIC: no secrets, no local paths. Keys live in Vercel env (`REVENUECAT_SECRET_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` already exist).
- New public tables: RLS on, `REVOKE ALL FROM anon, authenticated`, explicit minimal GRANT (CI guard). Owner merges the migration PR with `merge-migrations.sh`; version it after the latest on main (`20261112140000`), e.g. `20261113100000`.
- Every SECURITY DEFINER function: `SET search_path = ''`, EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role only.
- Execute every new SQL function in PGlite as a seeded user before trusting it (pattern: `src/lib/*-migration.test.ts`, e.g. the #472 profile-data tests).
- Non-staff must get exactly `UNAUTHORIZED_MESSAGE` from `src/lib/admin-auth.ts` (no oracle). A staff member missing a scope gets `"Forbidden: missing scope <name>"`.
- No staff action may target the actor's own user id (server check, all write functions).
- Every write action requires a non-empty `reason` (trimmed, 3..500 chars).
- Design tokens only in UI (`ds-*`); raw-value baselines may only go down.
- `ADMIN_FUNCTION_NAMES` in `src/lib/admin.functions.ts` stays the registry of every console server function (rename to cover new files; the existing count test must keep passing in both directions).

## Review Focus

1. A support account calling an owner-only function directly (bypassing the UI) → must get "Forbidden", and no audit row for a change that didn't happen. Test in Task 2.
2. The audit write failing (e.g. bad input to the SQL function) → the change must not happen either (same transaction). Test in Task 3.
3. Banned learner with a still-valid access token calling a learner API → refused with `account_suspended` immediately. Test in Task 7.
4. Deleting a learner whose RevenueCat or Apple step fails → account still deleted where possible, and the record shows "failed at step X", never silence. Test in Task 8.
5. Owner disabling or demoting themselves, or a staff member granting themselves a scope → refused. Test in Task 9.

---

### Task 1: Database: roles, action record, restrictions, gifts, notes

**Files:**
- Create: `supabase/migrations/20261113100000_staff_console.sql`
- Test: `src/lib/staff-console-migration.test.ts`

**Interfaces:**
- Produces tables: `staff_roles(user_id uuid PK FK auth.users ON DELETE CASCADE, role text CHECK in ('owner','support','support_ai'), scopes text[] NOT NULL, added_by uuid, added_at timestamptz default now(), disabled_at timestamptz)`; `staff_audit_log(id bigint identity PK, at timestamptz default now(), actor_user_id uuid NULL, actor_role text NOT NULL, action text NOT NULL, target_user_id uuid NULL, reason text, before jsonb, after jsonb, request_id text, ip_hash text)` — NO foreign keys; `user_restrictions(id uuid PK, user_id uuid FK CASCADE, kind text CHECK in ('block','ban'), reason text NOT NULL, created_by uuid, created_at, lifted_at timestamptz, lifted_by uuid)`; `pro_grants(id uuid PK, user_id uuid FK CASCADE, granted_by uuid, starts_at, ends_at timestamptz NOT NULL, reason text NOT NULL, revoked_at, revoked_by)`; `staff_notes(id uuid PK, user_id uuid FK CASCADE, author_id uuid, body text CHECK length 1..2000, created_at)`.
- Produces SQL functions (service_role only): `public.staff_record(p_actor uuid, p_role text, p_action text, p_target uuid, p_reason text, p_before jsonb, p_after jsonb, p_request_id text) returns bigint`; `public.is_restricted(p_user uuid, p_kind text) returns boolean` (STABLE, also EXECUTE to authenticated so RLS/RPCs can call it; returns only a boolean about the given id); `public.staff_set_restriction(p_actor uuid, p_role text, p_target uuid, p_kind text, p_reason text) returns uuid` and `public.staff_lift_restriction(p_actor, p_role, p_target, p_kind, p_reason) returns void` (each writes its audit row in the same transaction); `public.staff_revoke_sessions(p_target uuid) returns void` (deletes the target's rows in `auth.sessions` and `auth.refresh_tokens`).
- All five tables: RLS on with zero policies, REVOKE ALL from anon/authenticated, GRANT to service_role. `staff_audit_log`: GRANT only SELECT, INSERT to service_role, plus a BEFORE UPDATE OR DELETE trigger that raises `'staff_audit_log is append-only'`.
- Account export (`src/lib/account.functions.ts` export table lists): add `user_restrictions`, `pro_grants` (the learner's own rows). NOT `staff_notes` or `staff_audit_log`.

- [ ] **Step 1: Write failing PGlite tests** in `staff-console-migration.test.ts`: `applies cleanly after all migrations`; `audit log refuses UPDATE and DELETE even for service_role` (expect error /append-only/); `anon and authenticated cannot select any of the five tables`; `staff_set_restriction writes the restriction and exactly one audit row`; `if staff_record raises (p_action null) no restriction row exists` (same-transaction proof); `is_restricted is true only for an active (not lifted) row of that kind`; `deleting the target auth user keeps its audit rows`; `staff_revoke_sessions removes the target's sessions and refresh tokens only`.
- [ ] **Step 2: Run** `bunx vitest run src/lib/staff-console-migration.test.ts` → FAIL (file missing).
- [ ] **Step 3: Write the migration** with the tables, grants, trigger and functions above.
- [ ] **Step 4: Run the test** → PASS; also `bunx vitest run src/lib/*grants*.test.ts src/lib/*migration*.test.ts` → PASS.
- [ ] **Step 5: Mutation-check:** drop the trigger → the append-only test goes red; restore. Commit `feat(db): staff roles, action record, restrictions, gifts, notes`.

### Task 2: Roles, scopes and `requireStaff`

**Files:**
- Create: `src/lib/staff-scopes.ts`, `src/lib/staff-middleware.ts`
- Modify: `src/lib/admin-auth.ts` (add `getStaffRole`), `src/lib/admin.functions.ts` (existing functions switch from `requireAdmin` to `requireStaff("podcasts.manage")` / `requireStaff("reports.manage")`; `adminWhoAmI` returns `{ userId, role, scopes }`)
- Test: `src/lib/staff-scopes.test.ts`, `src/lib/staff-middleware.test.ts`

**Interfaces:**
- Produces: `type StaffRole = "owner" | "support" | "support_ai"`; `const SCOPES = ["users.read","users.notes","pro.grant","pro.revoke","user.block","user.ban","user.unban","user.delete","support.read","support.reply","support.assign","numbers.read","audit.read","staff.manage","podcasts.manage","reports.manage"] as const; type Scope = typeof SCOPES[number]`; `DEFAULT_SCOPES: Record<StaffRole, Scope[]>` (owner: all; support: users.read, users.notes, support.read, support.reply, support.assign, user.block, reports.manage; support_ai: []); `hasScope(role: StaffRole, scopes: readonly string[], needed: Scope): boolean` (owner always true; unknown scope strings ignored); `getStaffRole(client, userId): Promise<{ role: StaffRole; scopes: string[] } | null>` (null when no row, or `disabled_at` set, or user not in `admin_users`); `requireStaff(scope: Scope)` middleware yielding `context.supabaseAdmin`, `context.userId`, `context.staffRole`, `context.staffScopes`.
- Migration note: on first run with no `staff_roles` row, an `admin_users` member is treated as `owner` (so the existing owner isn't locked out); a test pins this.

- [ ] **Step 1: Failing tests:** `support lacks pro.grant`, `owner has every scope`, `support_ai has no admin scope`, `disabled staff → UNAUTHORIZED_MESSAGE`, `non-staff → exactly UNAUTHORIZED_MESSAGE`, `staff missing scope → "Forbidden: missing scope pro.grant"`, `second factor still enforced when ADMIN_REQUIRE_AAL2=true`, `admin_users member with no staff_roles row is owner`. (Review Focus #1's end-to-end test lives in Task 5, where the first scoped write exists.)
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; existing `admin.functions.test.ts`, `admin-route-isolation.test.ts`, `admin-auth.test.ts` still PASS.
- [ ] **Step 5:** mutation: make `hasScope` return true → the support test goes red. Commit `feat(admin): roles and scopes`.

### Task 3: Recording actions

**Files:**
- Create: `src/lib/staff-audit.server.ts`
- Test: `src/lib/staff-audit.test.ts`

**Interfaces:**
- Produces: `recordStaffAction(client, input: { actor: string; role: StaffRole; action: string; target: string | null; reason: string | null; before?: unknown; after?: unknown; requestId?: string }): Promise<number>` (calls `staff_record`); `validateReason(reason: unknown): string` (trims; throws `"A reason (3-500 characters) is required."`); `STAFF_WRITE_FUNCTIONS` (string list of every write function name, used by the registry test in Task 10).

- [ ] **Step 1:** failing tests: `validateReason rejects empty, 2-char and 501-char reasons`; `recordStaffAction passes all fields to staff_record`; `a read of a learner (users.read) records action "user.view" with no reason required`.
- [ ] **Steps 2-4:** run FAIL, implement, run PASS. **Step 5:** commit `feat(admin): action record writer`.

### Task 4: Find a learner, learner page, notes

**Files:**
- Create: `src/lib/staff-users.functions.ts` (server functions), `src/lib/staff-user-facts.server.ts` (pure assembly of the facts object)
- Test: `src/lib/staff-users.functions.test.ts`, `src/lib/staff-user-facts.test.ts`

**Interfaces:**
- Produces server functions: `staffSearchUsers({ q: string })` scope `users.read` → `Array<{ id; email; displayName; createdAt }>` (max 25; exact match for an email or uuid, case-insensitive prefix for display name, min 2 chars; rate limit 30/min per staff); `staffGetUser({ id })` scope `users.read` → `LearnerFacts` and records `user.view`; `staffAddNote({ id, body })` scope `users.notes` (records `note.add`).
- `LearnerFacts = { id; email; displayName; createdAt; lastActiveAt; course; level; streak; xp; pro: { active: boolean; source: "store"|"gift"|"none"; until: string|null }; platforms: string[]; restrictions: Array<{kind; reason; createdAt; liftedAt}>; reportsAgainst: number; gifts: Array<{endsAt; reason; revokedAt}>; notes: Array<{author; body; createdAt}> }`. Never includes payment details or chat/lesson answer texts.

- [ ] **Step 1:** failing tests: `search by exact email returns that user`, `search by 1 char is rejected`, `getUser records a user.view audit row`, `facts never include keys named like payment|card|messages|answers` (deep key scan), `support with users.read but not users.notes cannot add a note`.
- [ ] **Steps 2-4:** FAIL, implement (Pro source via `getAccountSubscriberSummary`: promotional store → "gift"), PASS. **Step 5:** commit.

### Task 5: Gift Pro and revoke

**Files:**
- Modify: `src/lib/revenuecat-entitlement.ts` (add two functions)
- Modify: `src/lib/staff-users.functions.ts` (add `staffGrantPro`, `staffRevokePro`)
- Modify (native, small): iOS `ios/LearnWithAlphonso/Sources/EntitlementStore.swift` + Settings Pro row, Android `billing/EntitlementStore.kt` + its Settings row: show "Pro (gift)" when the active entitlement's store is promotional.
- Test: `src/lib/revenuecat-promotional.test.ts`, additions in `staff-users.functions.test.ts`, Kit/core tests for the label logic.

**Interfaces:**
- Produces: `grantPromotionalPro(appUserId: string, endTimeMs: number): Promise<void>` → `POST /v1/subscribers/{id}/entitlements/pro/promotional` with body `{ end_time_ms }`; `revokePromotionalPro(appUserId: string): Promise<void>` → `POST /v1/subscribers/{id}/entitlements/pro/revoke_promotionals`. Uses the existing `REVENUECAT_SECRET_API_KEY` config path. Throws on non-2xx with the status only (never the body).
- `staffGrantPro({ id, days: 1..365, reason })` scope `pro.grant`: insert `pro_grants`, call RevenueCat, record `pro.grant` (before/after Pro state). If RevenueCat fails: record `pro.grant.failed`, delete nothing, throw `"RevenueCat refused the gift; nothing changed."`. `staffRevokePro({ id, reason })` scope `pro.revoke`: mark latest unrevoked grant revoked, call revoke, record `pro.revoke`. Refuses `id === actor`.

- [ ] **Step 1:** failing tests (fetch mocked): `grant posts end_time_ms = now + days*86400000 to the promotional endpoint`; `days 0 and 366 are rejected`; Review Focus #1 `a support caller is Forbidden and no audit row is written`; `granting to yourself is refused`; `RevenueCat 500 → pro.grant.failed recorded and error thrown`; native `promotional store → "Pro (gift)" label`.
- [ ] **Steps 2-4:** FAIL, implement, PASS (Swift via CI; `bunx vitest`; Android `:core:test`). **Step 5:** commit.

### Task 6: Block enforced everywhere learners meet

**Files:**
- Create: `supabase/migrations/20261113100100_restriction_enforcement.sql`
- Create: `src/lib/social-surfaces.ts` (the list) and `src/lib/restriction-enforcement.test.ts`
- Modify: `src/lib/staff-users.functions.ts` (`staffBlockUser`, `staffUnblockUser` via `staff_set_restriction` / `staff_lift_restriction` with kind `block`, scope `user.block`)

**Interfaces:**
- Produces: `SOCIAL_SURFACES` = every RPC and RLS policy through which one learner sees or reaches another (friends/invites, all leaderboard and league RPCs, duels incl. open queue, buddy matching and buddy_messages, teams and missions, nudges, friend_activity_events, display-name reads). Build the list by grepping migrations for `blocked_users` and for every function/policy that reads another user's profile or progress; put the evidence (migration file) next to each entry.
- Each surface excludes a user for whom `public.is_restricted(uid,'block') or public.is_restricted(uid,'ban')` holds: they don't appear to others and can't act toward others. Their own learning keeps working.

- [ ] **Step 1:** failing PGlite tests: for EACH surface in `SOCIAL_SURFACES`, `a blocked learner is invisible to / cannot act on others` (data-driven over the list) and a registry test `every function or policy that references blocked_users is in SOCIAL_SURFACES` (grep-based; fails on a new unlisted surface).
- [ ] **Steps 2-4:** FAIL, write the enforcement migration (CREATE OR REPLACE each RPC/policy adding the check), PASS. **Step 5:** mutation: remove the check from one leaderboard RPC → its row goes red. Commit.

### Task 7: Ban, effective immediately

**Files:**
- Modify: `src/lib/staff-users.functions.ts` (`staffBanUser`, `staffUnbanUser`, scopes `user.ban` / `user.unban`)
- Modify: `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`: after token validation, `is_restricted(userId,'ban')` → throw `ACCOUNT_SUSPENDED_MESSAGE = "account_suspended"`), Supabase Edge Functions' shared auth helper (same check)
- Modify clients: web (a suspended screen on `account_suspended` from any API or a banned sign-in), iOS and Android (same screen; sign-in error `user_banned` maps to it). Copy: "This account is suspended." / "If you think this is a mistake, contact support at {SUPPORT_EMAIL}." (reuse the existing support-address constant on each platform).
- Test: `src/lib/staff-ban.test.ts`, client tests per platform for the mapping.

**Interfaces:**
- `staffBanUser({ id, reason, confirmEmail })`: `confirmEmail` must equal the learner's email (case-insensitive) else `"Type the learner's email to confirm."`; then `staff_set_restriction(kind 'ban')`, `auth.admin.updateUserById(id, { ban_duration: "876000h" })`, `staff_revoke_sessions(id)`; record failures of the last two as `user.ban.partial` with the failed step. `staffUnbanUser`: lift + `ban_duration: "none"`.

- [ ] **Step 1:** failing tests: Review Focus #3 `a banned user's still-valid token gets account_suspended from requireSupabaseAuth`; `ban without matching confirmEmail is refused`; `ban calls updateUserById with ban_duration and revokes sessions`; `unban lifts and sets ban_duration none`; clients `account_suspended → suspended screen`.
- [ ] **Steps 2-4:** FAIL, implement, PASS. **Step 5:** commit.

### Task 8: Delete an account (absorbs the reports-page delete)

**Files:**
- Modify: `src/lib/staff-users.functions.ts` (`staffDeleteUser`), `src/lib/admin.functions.ts` (remove `adminDeleteReportedUser`; reports page calls `staffDeleteUser({ id: report.reported, reason, confirmEmail })` and then marks the report actioned), `admin/routes/reports.tsx`
- Test: `src/lib/staff-delete.test.ts`

**Interfaces:**
- `staffDeleteUser({ id, reason, confirmEmail })` scope `user.delete`: record `user.delete.requested` (with an email hash, sha256 of lowercased email), then run in order: `cancelAccountWebSubscriptions` → `revokeAppleGrantForUser` → `auth.admin.deleteUser` → `eraseSubscriberRecord`; record `user.delete.completed` or `user.delete.failed` with `{ step }`. A failure before `deleteUser` stops and throws; a failure after it is recorded and reported, not thrown.

- [ ] **Step 1:** failing tests: Review Focus #4 `Apple revocation fails → account still deleted and failed-at-apple recorded`; `deleteUser fails → stops, records failed at delete_user, throws`; `requested row is written before any external call`; `the reports page no longer references adminDeleteReportedUser` (grep).
- [ ] **Steps 2-4:** FAIL, implement, PASS. **Step 5:** commit.

### Task 9: Staff management

**Files:**
- Create: `src/lib/staff-admin.functions.ts` (`staffListStaff`, `staffAddStaff({ email, role, scopes })`, `staffUpdateStaff({ userId, role?, scopes?, disabled? })`), all scope `staff.manage`
- Test: `src/lib/staff-admin.test.ts`

**Interfaces:**
- Adding staff inserts both `admin_users` and `staff_roles` (the user must already exist in auth). Every change records `staff.add` / `staff.update` with before/after. Refuse: changing your own row; adding `support_ai` as a login (`"support_ai is not a login role."`); granting `staff.manage` to a non-owner.

- [ ] **Step 1:** failing tests: Review Focus #5 `owner cannot disable or demote self`; `support with staff.manage? → impossible: granting staff.manage to support is refused`; `support_ai cannot be added`; `add writes admin_users + staff_roles + one audit row`.
- [ ] **Steps 2-4:** FAIL, implement, PASS. **Step 5:** commit.

### Task 10: Console screens, action record page, registry test

**Files:**
- Modify: `admin/routes/__root.tsx` (shell: nav Numbers (placeholder "coming in phase 3"), Users, Support (placeholder "phase 2"), Reports, Podcasts, Staff, Action record; items hidden when the scope is missing), `admin/routes/index.tsx` (redirect to Users)
- Create: `admin/routes/users.tsx` (search), `admin/routes/users.$id.tsx` (facts, notes, action buttons by scope, dialogs with reason; ban/delete require typing the email), `admin/routes/staff.tsx`, `admin/routes/audit.tsx` (scope `audit.read`; filters: actor, target, action, date; server function `staffListAudit({ actor?, target?, action?, from?, to?, cursor? })` page size 50)
- Test: `src/lib/staff-registry.test.ts` and route tests in the `admin/` test style

**Interfaces:**
- Registry test: every server function exported from `staff-*.functions.ts` and `admin.functions.ts` is in `ADMIN_FUNCTION_NAMES`, uses `requireStaff(...)`, and every name in `STAFF_WRITE_FUNCTIONS` calls `recordStaffAction` or a `staff_*` SQL function (source scan).

- [ ] **Step 1:** failing tests: registry test; `audit page denies a support user without audit.read`; `users.$id shows only the buttons the scopes allow` (support sees Block, not Delete/Ban/Gift).
- [ ] **Steps 2-4:** FAIL, implement in the round-6 design system (desktop-first, works at 393 px), PASS. Screenshots of Users, learner page, a dialog, Staff and Action record at 1280 px into the scratchpad `admin-shots/` folder.
- [ ] **Step 5:** commit; open ONE PR "Staff console: roles, action record, user management" containing both migrations; mark ready when the 7 required checks are green; DO NOT merge (owner merges migrations). List owner steps in the body: set `ADMIN_REQUIRE_AAL2=true` on the admin Vercel project; insert their own `staff_roles` owner row is NOT needed (fallback) but recommended: `INSERT INTO public.staff_roles (user_id, role, scopes) SELECT user_id, 'owner', '{}' FROM public.admin_users;`.
