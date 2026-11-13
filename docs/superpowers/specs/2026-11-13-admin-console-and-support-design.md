# Admin console, roles, and in-app support: design

Date: 2026-11-13. Status: draft for owner approval.

## Intent and why

The owner runs Learn With Alphonso by hopping between Supabase, RevenueCat, Sentry, App Store Connect and (soon) PostHog, and the only admin surface today is a podcast-folder tool plus a reports inbox (admin.alphonsoecosystem.app). Learners have no way to get help inside the app: they can report content or email a forwarding address, and nobody has a place to answer from.

The owner wants one place to (1) see how the app is doing in numbers, (2) manage learners (give Pro, block or ban, delete accounts, and more over time), and (3) run support, with support done first by an AI agent and then by people. Several support people, human or AI, may exist later; each gets only the actions in its scope, and the owner must always be able to see who did what.

## Goals

- **Roles and scopes.** Owner (everything), Support (a limited scope the owner controls), and an AI support agent (read-only). Every privileged action checks the actor's scope on the server.
- **One action record.** Every admin and support action, and every AI support turn, is recorded: who, what, to whom, when, why, before and after. Append-only: nobody, including the owner, can edit or delete entries through any app path. Only the owner sees the full record.
- **User management.** Find a learner by email, display name or id; see their account facts; act on the account: give Pro for a period, revoke a granted Pro, block (no social features) or ban (no sign-in), lift either, delete the account, and room to add more actions.
- **In-app Help** on web, iOS and Android: a Help chat. The AI support agent answers first, using only that learner's own account facts and the app's help content. It can look and explain, never change anything. If it can't solve it, or the learner asks for a person, the conversation becomes a ticket.
- **Support inbox** in the admin console: tickets with the whole AI conversation attached, assignment, status, replies. The learner sees replies in the same in-app chat, plus a notification.
- **Numbers dashboard:** signups, active learners, lessons/practice/podcasts done, retention, Pro and revenue, AI usage and cost, crashes, reports, open tickets: in one place, read server-side from our database and the providers' APIs.

## Non-goals (for now)

- The AI agent changing accounts (no "fix it" powers in v1; added later one at a time, each logged).
- Refunds (they belong to Apple/Google/Stripe; the console links out).
- Editing lesson content from the console.
- A public status page, community forum, or phone support.
- Replacing the existing podcast tools (kept, moved under the new navigation).

## Anti-goals (would be a failure even if it "works")

- Any path where a support role, the AI agent, or a learner can do an action outside its scope, including by talking the AI into it.
- An action record that can be edited, deleted, or silently skipped.
- Master keys (Supabase service role, RevenueCat secret) leaving our servers, or being stored at a third party.
- Support staff seeing more learner data than their job needs (no raw passwords, no payment details; minimum personal data on screen).
- An admin "bootstrap" endpoint or a role a user can grant themselves.

## Constraints (from the existing system)

- The admin app is a separate TanStack Start app in `admin/`, deployed as its own Vercel project (`learnwithalphonso-admin`), sharing `src/lib`. Every admin server function is gated by `requireAdmin` (`src/lib/admin-middleware.ts`): valid Supabase session, then the `admin_users` allowlist read with the service-role client, then a second factor (AAL2) when `ADMIN_REQUIRE_AAL2` is set. Non-admins get the same error text as a bad token (no oracle).
- `admin_users` has RLS with zero policies and `REVOKE ALL` from anon/authenticated; its first row is inserted by hand in the SQL editor. That pattern stays.
- New public tables start with no client privileges (CI guard forces explicit GRANTs). Migrations are merged by the owner with `merge-migrations.sh`.
- Account deletion already exists (`deleteMyAccount`, its pre-delete steps, Apple token revocation, RevenueCat subscriber deletion, ON DELETE CASCADE on every user table), and so does an admin deletion for reported users (`adminDeleteReportedUser`). Admin deletion must reuse that path, not a parallel one.
- Pro status comes from RevenueCat (`src/lib/revenuecat-entitlement.ts`); web asks the server, but iOS and Android decide Pro locally from the RevenueCat SDK. There is no grant mechanism today.
- AI calls go through the app's OpenRouter setup with quotas (`src/lib/ai-quota.server.ts`) and the AI consent gate.
- Vercel is the host for the web app, the API and the admin console.
- The repo is public: no secrets, and security details stay at the level ARCHITECTURE already documents.

## Approaches considered

1. **Grow our own admin app (CHOSEN by the owner, 2026-11-13).** Add roles, the action record, user pages, the support inbox and a numbers page to `admin/`; build the Help chat into the three apps on our existing AI setup. One login, one action record, the AI sees only what we expose, no new subscriptions. Most building.
2. **Off-the-shelf admin tool (Retool/Appsmith/Metabase) over the database.** Fast charts, but needs a master database credential stored at a third party, has its own roles and logs (two records), per-seat cost, and the in-app chat still has to be built. Rejected.
3. **Help-desk SaaS with built-in AI (Intercom/Crisp/Zendesk) plus our admin for the rest.** Polished support quickly, but per-AI-answer pricing, learner data leaves our system, its AI can't see account facts without custom wiring, and actions live in two records, which breaks "I see who did what". Rejected.

## Decided by the owner

- Approach 1, built in this order: (1) roles + action record + user management, (2) support (Help chat, AI agent, inbox), (3) numbers dashboard.
- Support is AI first, then a person if needed.
- The AI support agent starts with look, explain and hand off only; no account changes.
- Actions wanted now: give Pro, block or ban, delete accounts; more later.
- Help appears on web, iOS and Android.

## Design

### Phase 1: roles, the action record, user management

**Roles.** A `staff_roles` table (replacing the boolean meaning of `admin_users`, which stays as the "is staff" allowlist): `user_id`, `role` in (`owner`, `support`, `support_ai`), `scopes` (a set of action names), `added_by`, `added_at`, `disabled_at`. RLS with zero policies, service-role only, like `admin_users`. The owner row is inserted by hand. Only an `owner` can add, change or disable staff, and never their own role.

**Scopes** are named actions, checked on the server for every call: `users.read`, `users.notes`, `pro.grant`, `pro.revoke`, `user.block`, `user.ban`, `user.unban`, `user.delete`, `support.read`, `support.reply`, `support.assign`, `numbers.read`, `audit.read`, `staff.manage`, `podcasts.manage`, `reports.manage`. Defaults (owner can change per person):
- owner: all;
- support: `users.read`, `users.notes`, `support.read`, `support.reply`, `support.assign`, `user.block`, `reports.manage`;
- support_ai: none of the admin scopes; it only reads one learner's own facts inside that learner's Help chat (Phase 2).

`requireAdmin` becomes `requireStaff(scope)`: session, staff row active, second factor, then the scope. Same indistinguishable error for "not staff". A distinct "not allowed" error only for an authenticated staff member missing a scope.

**The action record.** `staff_audit_log`: `id`, `at`, `actor_user_id`, `actor_role`, `action`, `target_user_id`, `reason` (required free text for every write action), `before` and `after` (jsonb, minimal fields), `request_id`, `ip_hash`. Written only by SECURITY DEFINER functions with `search_path=''`; INSERT only, no UPDATE/DELETE privilege for anyone (enforced by grants plus a trigger that raises on UPDATE/DELETE), read only by `audit.read`. Every write action runs as one database transaction: the change and its log row commit together or not at all. Reads of a learner's account (`users.read`) are also logged (lighter row), so "who looked at whom" is answerable.

**User pages.** Search (email, display name, user id, exact match for email/id; prefix for name). Learner page: account facts (created, last active, course and level, streak, XP, Pro status and source, platform, reports against them, blocks/bans, open tickets), the staff notes, and the action buttons the viewer's scopes allow. Every write asks for a reason and confirms; destructive ones (delete, ban) require typing the learner's email.

**Actions (Phase 1).**
- Give Pro for N days / revoke granted Pro: through RevenueCat's **promotional entitlement** API (server-side, existing secret key), so the gift shows up in the RevenueCat SDK on iOS and Android and in the server/web check with no client entitlement change. (A server-only `pro_grants` table was rejected after review: iOS and Android decide Pro locally from the RevenueCat SDK, e.g. `EntitlementStore.swift:13`, so a server-only grant would still show them the paywall.) A `pro_grants` table still records each gift (who, when, how long, reason, revoked) for the console and the record. Store purchases are untouched. Native shows "Pro (gift)" where the source is promotional.
- Block: the learner keeps learning but loses social features (friends, leagues visibility, duels, buddies, names shown to others). A `user_restrictions` row (`kind` = `block`), enforced in the same server paths that enforce user-to-user blocks today.
- Ban: no sign-in. Supabase Auth admin ban (`ban_duration`) plus a `user_restrictions` row (`kind` = `ban`) for the record and the reason; lift reverses both. A banned learner who opens the app sees a plain "This account is suspended. Contact support" screen with the support email.
- Delete account: the existing deletion path (`deleteMyAccount`'s steps, RevenueCat subscriber deletion, cascade), run by the server as the staff action, logged with the learner's id and email hash (the row itself is gone afterwards).

**Console shell.** A proper navigation (Numbers, Users, Support, Reports, Podcasts, Staff, Action record), in the round-6 design system, desktop-first and usable on a phone.

### Phase 2: in-app Help and the support inbox

**Learner side (web, iOS, Android).** "Help" in Settings and on error screens (purchase problems, sync errors, ban screen). A chat with the AI support agent, labelled as AI, with a "Talk to a person" button always visible. Conversations persist (a learner can come back). When a person replies, the learner gets a push (iOS/Android) or email (web) and the reply appears in the same chat. The AI consent gate applies; a learner who declines AI can still go straight to a person.

**The AI support agent (look, explain, hand off).**
- Server-built prompt; the app's help content (a written help-centre file in the repo: Pro and restoring purchases, streaks, leagues, account deletion, privacy, content reports) plus a read-only snapshot of THIS learner's own facts, fetched by the server, never by the model: Pro status and source, last purchase restore result, streak history (last 30 days), recent sync errors, app version, platform.
- No tools that change anything. It may suggest the learner do something themselves (tap Restore Purchases, update the app).
- It hands off when: the learner asks for a person, it can't answer from its material, the topic is billing disputes, refunds, account deletion requests from someone else, safety or harassment, or legal/privacy requests. Hand-off creates a ticket with a short AI summary.
- Quota per learner per day (abuse limit), and every AI turn is stored in the conversation (it is the record of what the AI said).
- Prompt-injection defence: the learner's text is data in the user turn; the system prompt and the facts snapshot are server-built; there are no actions to trick it into.

**Staff side: Support inbox.** Ticket list (new, open, waiting on learner, solved), filters, assignment, the full conversation including the AI part and its summary, the learner's facts panel (same data the AI saw), reply box, internal notes, and the user actions the staff member's scopes allow (each logged). Ticket events go in the action record.

**Data.** `support_conversations` (learner, status, assigned_to, created, updated, channel), `support_messages` (conversation, author kind: learner/ai/staff, author id, body, created). Learners read and write only their own conversations (RLS); staff access goes through scoped server functions only. Retention: solved conversations kept 12 months then deleted (owner may change); included in the learner's data export; deleted with the account.

### Phase 3: numbers dashboard

One page, refreshed on open (no live streaming in v1), each tile with its source and time window:
- From our database (server-side SQL, aggregates only): signups (day/week), daily and weekly active learners, lessons, practice calls, podcasts finished, average streak, 1/7/30-day retention, reports, open tickets, AI calls and estimated AI cost by kind (from `ai_usage`).
- From RevenueCat (server API): active Pro, trials, new and churned subscriptions, revenue (MRR).
- From Sentry (server API): crash-free sessions per platform, top new issues.
- From PostHog (once live): funnel from first run to first lesson, onboarding step drop-off.
- Provider keys stay on the server (Vercel env); tiles that can't load say so instead of showing zero.
Scope `numbers.read`; numbers show no personal data.

## Security notes

- All checks on the server; the console UI hides what a role can't do but never relies on hiding.
- Second factor required for all staff (set `ADMIN_REQUIRE_AAL2` on for the console).
- Rate limits on search and on write actions per staff member.
- The action record is written in the same transaction as the change.
- Tests prove: a support role cannot call an owner-only action; the AI agent has no write path; audit rows can't be updated or deleted; every write path writes an audit row (a test that enumerates the server functions and fails if one lacks an audit write).

## Calls made after the builder review (coordinator's calls; owner can override)

1. **Block covers, and fails closed on, every surface where one learner meets another:** friends and invites, leaderboards (all league RPCs), duels and open matchmaking, study buddies and buddy matching, teams and team missions, nudges, friend activity, and display names shown to others. Enforced at the database (RLS policies and the SECURITY DEFINER RPCs), because native clients read some of these directly, plus a test that lists every such RPC/policy and fails if one ignores `user_restrictions`.
2. **Ban takes effect immediately, not within the hour:** the console revokes the learner's sessions (Supabase admin sign-out) in addition to `ban_duration`, the shared auth middleware and the learner-facing RPCs refuse a banned user, and a signed-in client that gets the "suspended" answer shows the ban screen. Sign-in for a banned account returns a distinct, non-leaking "account suspended" message (Supabase's banned error), so the apps can tell it from a wrong code.
3. **Staff identity:** each staff member uses a separate staff account (not their personal learner account), and no staff member can act on their own account (server check). `support_ai` is not a login: it is an actor label in the record for AI turns. TOTP enrolment already exists in the admin sign-in (`admin/routes/signin.tsx`); `ADMIN_REQUIRE_AAL2` is turned on for the console as part of Phase 1.
4. **AI agent facts in v1 are only facts that exist today:** Pro status and source (RevenueCat), gifts, streak and days active (learning_days), recent lessons, course and level, platform where known (device tokens), open restrictions, and the learner's previous tickets. Restore results, sync errors and app version are NOT in v1 (they need new client telemetry; later).
5. **Deletion:** the new `user.delete` replaces and absorbs the existing `adminDeleteReportedUser` (and the reports actions move under `reports.manage`), reusing the extracted post-delete steps in `account.functions.ts` including the Apple token revocation. The record's `actor_user_id` and `target_user_id` are plain ids with NO foreign key, so rows survive the deletion of the learner or of a staff member. Order: write a "delete requested" row, run the steps, write "delete completed" or "delete failed at step X" (external calls can't join a transaction, so failures are recorded, not hidden).
6. **Notifications:** the learner sees replies in the in-app Help chat on all platforms; native also gets a push (existing `send-push`); web and every account also get an email through the existing Resend sender (`sendEmailViaResend`). Apple private-relay addresses still deliver. Replying to that email does NOT reach the ticket in v1 (the email says to reply in the app). A banned learner contacts the existing support email address shown on the ban screen.
7. **What support staff see:** the learner's email in full (needed to find and verify them), display name, the account facts above. Never payment details, passwords, or the learner's lesson answers or chat texts with Alphonso/Hector. Owner sees the same plus the full action record.
8. **AI support model and limits:** the app's existing OpenRouter setup and default chat model; its own `support` quota kind (e.g. 30 messages a day per learner), not counted against the learner's Alphonso/Hector allowance. The Help chat goes through a server endpoint only: `support_messages` is not client-writable, so a learner cannot forge an AI or staff message.
9. **Numbers sources:** retention and active learners from `learning_days` (exists since #472) and lesson completions; PostHog tiles appear once PostHog is live (it is being wired now); Sentry tiles need a Sentry API token the owner adds (owner step), and say "not connected" until then.

## What's left to the builder

- Exact table and column names, indexes, and the migration split (one migration per phase).
- Console layout details within the design system; desktop/phone breakpoints.
- The help-centre content itself (draft it; the owner reviews).
- Push/email delivery reuse (the app already sends pushes and emails; reuse those senders).
- Which RevenueCat, Sentry and PostHog endpoints to call for each tile.
