# Buddy Preset Messages (Phase 5: server + web) Implementation Plan

> Status (2026-10-09): implemented: server and web #242, iOS and Android #243.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Study buddies can send each other one of 8 fixed encouragements (no free text), on the server and the web app.

**Architecture:** One migration adds `buddy_messages` (preset id only, never text), `send_buddy_message(_preset)` (active pair required, allowed id, 20 per hour per sender, serialised with the existing per-person lock) and `get_buddy_messages(_since)`. Wording lives in `src/lib/buddy.ts` + `buddy.fixtures.json` (copied to iOS/Android for Phase 6). The web `BuddyCard` gets preset buttons and a short history, polled while the Friends page is open.

**Tech Stack:** Supabase Postgres (plpgsql), TanStack Start server functions, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-study-together-design.md` (Part 3, Data and privacy, Error handling). Builds on Phase 3a (`20261006180000_buddy_pairing.sql`, `_lock_buddy_users`, `buddy_members`).

## Global Constraints

- Presets (ids, in this order): `lets_study`, `nice_work`, `keep_going`, `need_a_hand`, `on_my_way`, `good_morning`, `good_night`, `proud_of_you`. Wording: "Let's study together!", "Nice work!", "Keep going, you've got this!", "Need a hand?", "On my way to a lesson!", "Good morning!", "Good night!", "Proud of you!".
- The server stores and validates only the id (CHECK constraint AND a function-side check); no text column anywhere.
- `BUDDY_MESSAGES_PER_HOUR` = 20 per sender, counted over the last hour, under `_lock_buddy_users(me, buddy)` so two parallel sends cannot both pass at 19.
- New statuses (added to `messages` in the fixtures): `sent` "Sent.", `rate_limited` "You've sent a lot of messages. Try again in a while.", `bad_preset` "Something went wrong. Try again." (a client sending an unknown id is a bug, so generic wording).
- Every function SECURITY DEFINER, `SET search_path = public`, `SET timezone = 'UTC'`, no output column used unqualified (clash guard).
- RLS on; clients SELECT only messages of their own pairs; `-- client-grants`/GRANT per the 2026-10-06 rule.
- History survives the pair ending (read-only); `get_buddy_messages` returns only the ACTIVE pair's messages; the export returns all pairs' messages.
- Clients never show "no messages" for a failed read: failure shows `BUDDY_COPY.loadFailed` semantics for the card as a whole.

## Review Focus

1. **21st message within an hour** -> `rate_limited`, nothing stored; two parallel sends at 19 -> exactly one succeeds (lock).
2. **Sending after the pair ended (unfriend/block mid-session)** -> `not_paired`, nothing stored.
3. **A crafted preset id** (`"hi there"`, `NULL`, a valid id with different case) -> `bad_preset`, nothing stored; the CHECK constraint is the backstop.
4. **Reading another pair's messages** (RLS) -> none; `get_buddy_messages` only the caller's active pair.
5. **Polling while a send is in flight** -> the sent message appears once (no duplicate from optimistic + refetch; the card does no optimistic insert).

### Task 1: Migration + live proof
- `supabase/migrations/20261007100000_buddy_messages.sql` (after `20261006180000`).
- Table: `buddy_messages(id uuid pk default gen_random_uuid(), pair_id uuid not null references buddy_pairs(id) on delete cascade, sender_id uuid not null references auth.users(id) on delete cascade, preset_id text not null check (preset_id in (...8 ids...)), created_at timestamptz not null default now())`; index `(pair_id, created_at desc)`, `(sender_id, created_at)`; RLS; policy `buddy_messages_select_own` (EXISTS pair with auth.uid() in user_a/user_b); GRANT SELECT to authenticated; GRANT ALL to service_role.
- `send_buddy_message(_preset text) RETURNS TABLE(status text)`: unauthenticated; `_preset` not in list -> bad_preset; caller's `buddy_members` row -> pair (else not_paired); `_lock_buddy_users(me, other)`; re-read membership under the lock (else not_paired); count sent by me in the last hour >= 20 -> rate_limited; insert -> sent.
- `get_buddy_messages(_since timestamptz DEFAULT NULL) RETURNS TABLE(message_id uuid, sender_id uuid, is_mine boolean, preset_id text, sent_at timestamptz)`: active pair only, `created_at > coalesce(_since, '-infinity')`, newest 50, returned oldest first.
- Grants: REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated (both).
- Tests (`src/lib/buddy-messages-migration.test.ts`): version order, table + RLS + policy + grants, CHECK list equals the 8 ids from the fixtures file (read the JSON), functions SECURITY DEFINER/search_path/UTC, lock call precedes the count, rate constant 20 equals `BUDDY_MESSAGES_PER_HOUR` in buddy.ts, no text column.
- Live proof (rolled back, `docs/sql-probes.md`, Phase 3a tables already live so the script is small): send ok; bad id; not paired; 20 sends then 21st rate_limited; after unfriend not_paired; partner reads is_mine=false; a third user reads nothing; history kept after the pair ends.

### Task 2: Wording + fixtures
- `buddy.ts`: `BUDDY_PRESETS` (ordered ids + text), `buddyPresetText(id)` (unknown id -> null, the card skips it), `BUDDY_MESSAGES_PER_HOUR = 20`, `buddyMessageLine(isMine, buddyName, presetId)` -> "You: Nice work!" / "Bo: Nice work!".
- Fixtures: `presets` array, `messageLines` cases, new statuses in `messages`. Update the iOS/Android copies (byte-for-byte; the native tests ignore unknown keys; their status-count assertions use `>=`).

### Task 3: Server functions + export
- `buddy.functions.ts`: `sendBuddyMessage({ data: { presetId } })` (zod enum of the 8 ids), `getBuddyMessages()`; throw on RPC error.
- Export: introduce `RLS_SCOPED_EXPORT_TABLES = ["buddy_weeks", "buddy_messages"]` in `account.functions.ts` (each read as `select("*")`, relying on its own-pairs policy; failure names the table); fold `buddy_weeks` into it; the coverage test treats them as covered and the SELECT-policy test includes them.
- types.ts: run the regenerate workflow after deploy instead of hand-editing helper entries (the generator also emits `_` functions).

### Task 4: Card
- When paired: a "Send a message" row of 8 preset buttons (disabled while busy) and the last 10 messages via `buddyMessageLine`; query `["buddyMessages"]`, `retry: false`, `refetchInterval: 60_000` while mounted, `refetchOnWindowFocus` (default). Sending uses the existing stamped-answer mechanism and invalidates `buddyMessages`.
- Failure of the messages query shows the card's load-failed state (never an empty history).
- Privacy line: "Study buddies can send each other short fixed messages from a list (like "Nice work!"). There is no free text. These are kept as your pair's history."
- Tests: presets render in order; send calls the server with the id and shows "Sent."; rate_limited wording; history lines; messages failure -> load failed; no free-text input exists (assert no textbox in the card).

### Task 5: Ship
- Full gate; docs (CHANGELOG, ARCHITECTURE row, AGENTS row, privileges doc, spec status 5); fresh reviewer; PR; CI; merge; post-deploy probe on deployed functions; regenerate types; BACKLOG/SESSION-CONTEXT/memory.
