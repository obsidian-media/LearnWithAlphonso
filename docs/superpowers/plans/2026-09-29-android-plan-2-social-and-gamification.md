# Android Plan 2: Social and Gamification

> Status (2026-10-09): implemented and merged to `main` in #200 (2026-10-01).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Profile tab and everything behind it: leaderboards with overtake detection and a weekly recap, teams, season ladder, friends with invite codes, nudges and an activity feed, duels, achievements with the weakness trend, weekly challenges on the Learn tab, streak-freeze purchase, block and report, and editable display name and avatar.

**Architecture:** Same two-module split as Plan 1. `core` gains the remaining `ProgressSyncClient` methods (ported from `ProgressSyncClient.swift` and its `+Teams`, `+Season`, `+Challenges`, `+DisplayIdentity`, `+SocialSafety` extensions on `origin/main` after commit 0bdd9c2), plus pure logic ports (`wasOvertaken`, avatar colour, Monday-of-week math, nudge cooldown rule). `app` gains six screens and a `SocialSafety` component set; small caches live in SharedPreferences.

**Tech Stack:** Unchanged from Plan 1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-android-app-design.md` (section 4 rows: leaderboard, friends, nudges, duels, teams, season, weekly challenges, achievements, weakness trend, block/report, profile identity).

**Depends on:** Plan 1 merged on `android` (commit 0a3995d or later, which already contains main's opaque friend-invite codes).

## Global Constraints

- Everything under `android/LearnWithAlphonso/`; no shared file changes except the docs listed in the last task.
- The friend invite contract is the one on `main` after 2026-09-30: `get_or_create_my_friend_code` returns `{code}`, `accept_friend_invite(_code)` returns `{ok, message}` with messages `invalid-code`, `cannot invite yourself`, `blocked`, `friends`; `get_friend_invite_preview(_code)` returns `{ok, is_self, display_name, avatar_seed}`. Invite links are `https://learn.alphonsoecosystem.app/invite/{code}`. Never build a link from a user id.
- Block and report copy is `SocialSafetyCopy` from `SocialSafetyControls.swift`, verbatim, including the the report mailbox address.
- Every `core` port carries the same vectors as its Swift or TS test file; a vector may not be dropped.
- All list rows that show another user carry the block/report menu, and a blocked user leaves every list on screen immediately.
- Commits on `android`; run git from the worktree.

## Review Focus

1. Blocking someone from the leaderboard must also remove them from the friends list and activity feed the next time those load, and immediately from the list they were blocked on (Task 5, 9 tests).
2. The nudge cooldown is 24 hours per friend and must survive process death, so it lives in SharedPreferences, not memory (Task 3 test).
3. Overtake detection returns false when the learner is missing from either snapshot, so a first launch never toasts (Task 2 test).
4. A team's `switch_locked_until` arrives with fractional seconds; parsing must use `parsePostgresTimestampMillis`, or the team reads as "no team" (Task 1 test).
5. An invite link opened by its own author shows "That's your own invite link", never a self-friendship (Task 9 test on the `is_self` preview).

---

### Task 1: Social client methods and models

**Files:**
- Modify: `core/src/main/kotlin/.../core/net/Models.kt`
- Create: `core/src/main/kotlin/.../core/net/SocialClient.kt` (extension functions on `ProgressSyncClient` grouped by feature, one file to keep `ProgressSyncClient.kt` readable)
- Test: `core/src/test/kotlin/.../core/net/SocialClientTest.kt`

**Interfaces:**
- Models: `LeaderboardRow(userId, displayName, country: String?, avatarSeed, xp)`, `FriendProgress(userId, displayName, avatarSeed, streak, weekXp)`, `FriendActivityEvent(id, userId, eventType, createdAtMillis: Long, lessonId?, xpGain?, streak?, newTier?)`, `Nudge(id, senderId, createdAtMillis)`, `Duel(duelId, challengerId, opponentId, course, status, challengerXpStart, opponentXpStart, challengerXpNow, opponentXpNow, winnerId?, endsAt?)`, `WeeklyChallenge(templateId, title, description, progress, threshold, completed)`, `TeamLeaderboardRow(teamId, name, weeklyXp)`, `MyTeam(teamId, name, joinCode, joinedAtMillis, switchLockedUntilMillis, thisWeekXp, isOwner)`, `TeamMember(userId, displayName, avatarSeed, joinedAtMillis, isOwner)`, `SeasonStatus(division, rankInCohort, cohortSize, lastWeekResult: SeasonLastWeekResult?)`, `ProfileIdentity(displayName, avatarSeed)`, `WeaknessTrendEntry(category, detectedCount, resolvedCount, openCount, lastEventAt)`, `FriendInvitePreview(ok, isSelf, displayName?, avatarSeed?)`, `sealed interface BuyStreakFreezeResult { Ok(streakFreezes, xp); InsufficientXp(streakFreezes: Int?) }`, `data class RpcOutcome(ok: Boolean, reason: String?)`.
- Methods (all `suspend`, on `ProgressSyncClient`): `fetchLeaderboard(scope, period): List<LeaderboardRow>` (RPC `get_leaderboard` `{_scope,_period}`), `getMyFriendCode(): String?`, `acceptFriendInvite(code): Pair<Boolean, String>`, `getFriendInvitePreview(code): FriendInvitePreview`, `removeFriend(friendId)`, `fetchFriendsProgress()`, `fetchFriendActivity()` (GET `friend_activity_events` select `id,user_id,event_type,payload,created_at` order desc limit 50), `sendNudge(recipientId)` (POST `nudges`, `Prefer: return=minimal`), `fetchUnreadNudges()` (`read_at=is.null`), `markNudgesRead(ids)` (PATCH `id=in.(...)` with `read_at` ISO now), `buyStreakFreezeWithXp(course)`, `createDuel(opponentId, course)`, `respondToDuel(duelId, accept)`, `fetchMyDuels()`, `joinOpenDuelQueue(course, matchByLevel): Pair<Boolean, String?>`, `leaveOpenDuelQueue()`, `getWeeklyChallenges()`, `claimWeeklyQuest(questId, course, weekStart)`, `fetchActivityXp(userId, from, to): Int` (GET `activity_days` with two `day` params `gte.` and `lt.`), `getTeamLeaderboard()`, `getMyTeam(): MyTeam?`, `getTeamMembers()`, `kickTeamMember(userId)`, `joinTeamByCode(code)`, `autoJoinTeam()`, `createTeam(name, visibility)`, `leaveTeam()`, `getSeasonStatus(): SeasonStatus?` (GET `functions/v1/get-season-status`), `fetchProfileIdentity(userId)`, `updateProfileDisplayName(name, userId)`, `updateProfileAvatarSeed(seed, userId)`, `blockUser(userId): Pair<Boolean, String>`, `unblockUser(userId)` (DELETE `blocked_users?blocked=eq.`), `reportUser(userId, reason)` (POST `content_reports`), `fetchWeaknessTrend()` (aggregates `weakness_events` client-side, sorted open desc then lastEventAt desc).
- `SupabaseHttp.rest` already supports GET/POST/PATCH/DELETE and `Prefer` headers; `fetchActivityXp` needs a query with a repeated key, so add `queryList: List<Pair<String, String>>` support to `SupabaseHttp.rest` (default empty).

- [ ] **Step 1: Failing tests** with `FakeSupabase`, one per method, mirroring `ProgressSyncClientTests.swift` and the extension test files: request path, method, body, and decoded shape. Include: `getMyTeam` with `"switch_locked_until":"2026-10-06T01:23:45.678901+00:00"` parses (Review Focus 4) and returns null for an empty array; `acceptFriendInvite` posts `{"_code":"abc"}` and returns `false to "invalid-code"` on rejection without throwing; `fetchActivityXp` sends both `day` params and sums `xp_earned`; `markNudgesRead([])` sends nothing; `buyStreakFreezeWithXp` maps `ok:false` to `InsufficientXp`; `fetchWeaknessTrend` aggregates `[detected, detected, resolved]` in category A and `[detected]` in B into A(open 1) before B(open 1) by `lastEventAt`.
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** by porting each Swift method one to one, using the private `rowsOf`/`objectOf`/`string`/`int` helpers (make them `internal` in `ProgressSyncClient.kt` so the extension file can use them).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): social, teams, season, duels, challenges and safety client methods"`

---

### Task 2: Pure social logic ports

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/LeaderboardEngagement.kt`, `AvatarColor.kt`, `WeekMath.kt`, `NudgeCooldown.kt`
- Test: matching `*Test.kt` files under `core/src/test/.../logic/`

**Interfaces:**
- `data class LeaderboardSnapshotEntry(userId, xp)`; `fun wasOvertaken(previous, current, me): Boolean` (port of `LeaderboardEngagement.swift`: true when someone now above me was below me before).
- `fun avatarRgb(seed: String): Triple<Float, Float, Float>` (first code point times 37 mod 360 as hue, HSL s 0.40 l 0.45, port of `AvatarColor.swift`).
- `fun mondayDateString(weeksAgo: Int, nowMillis: Long): String` (UTC Monday of the week, `yyyy-MM-dd`); `fun isLeaguePromotion(from, to): Boolean` over `LEAGUES`.
- `object NudgeCooldown { const val COOLDOWN_MS = 24L*60*60*1000; fun canNudge(lastNudgedAtMillis: Long?, nowMillis: Long): Boolean }`.

- [ ] **Step 1: Failing tests** — overtake vectors from `LeaderboardEngagementTests.swift` (someone jumped past me → true; I improved → false; me missing from previous → false; me missing from current → false; unchanged order → false); avatar: `avatarRgb("a")` equals the HSL conversion of hue (97*37 % 360)/360 computed independently in the test, `""` uses code 0; Monday: `2026-09-30` (Wednesday) weeksAgo 0 → `2026-09-28`, weeksAgo 1 → `2026-09-21`, a Sunday → the previous Monday, a Monday → itself; promotion: bronze→silver true, silver→bronze false, unknown tier false; cooldown: null → true, 23h59m → false, 24h → true.
- [ ] **Step 2 to 5:** compile failure, implement, pass, commit `feat(android-core): overtake detection, avatar colour, week math, nudge cooldown`.

---

### Task 3: Preference caches

**Files:**
- Create: `app/src/main/java/.../data/SocialCaches.kt`
- Test: `app/src/test/java/.../data/SocialCachesTest.kt` (JVM, over an in-memory `SharedPreferences` fake)

**Interfaces:**
- `class LeaderboardSnapshotCache(prefs)` with `var lastSnapshot: List<LeaderboardSnapshotEntry>?` stored as JSON under `lastGlobalWeeklyLeaderboardSnapshot`.
- `class WeeklyRecapCache(prefs)` with `var lastRecapLeagueTier: String?`.
- `class NudgeCooldownCache(prefs, now)` with `canNudge(friendId)` and `recordNudge(friendId)` backed by a JSON map under `nudgeCooldowns` (Review Focus 2).
- `class LeagueTierCache(prefs)` wrapping the `lastKnownLeagueTier` key `LessonScreen` already uses; move that key here and make `LessonScreen` read it from the container.

- [ ] **Step 1: Failing tests** — snapshot round-trips and clears on null; nudge recorded at t is blocked at t+23h and allowed at t+24h after constructing a second cache over the same prefs (persistence); tier cache round-trips.
- [ ] **Step 2 to 5** as above; commit `feat(android): preference caches for leaderboard snapshot, recap, nudges and tier`.

---

### Task 4: Social safety components

**Files:**
- Create: `app/src/main/java/.../ui/social/SocialSafety.kt`

**Interfaces:**
- `data class SocialTarget(id, displayName)`; `enum class ReportReason(raw, label)` with the five values from `SocialSafetyControls.swift`; `object SocialSafetyCopy { fun blockConfirmationMessage(displayName): String }` verbatim; `@Composable fun SocialSafetyMenu(onBlock, onReport)` (overflow icon with "Block User" and "Report User"); `@Composable fun BlockConfirmDialog(target, onConfirm, onDismiss)`; `@Composable fun ReportSheet(target, container, onDismiss)` (reason radio list, Submit, confirmation copy with the report address); `@Composable fun AvatarCircle(seed, displayName, size)` using `avatarRgb`; `@Composable fun ToastBanner(message)` with a 3 second auto-dismiss helper `rememberToast()`.

- [ ] **Step 1: Implement** (pure UI; verified by the screens' Compose tests in later tasks).
- [ ] **Step 2: Build** `:app:assembleDebug`.
- [ ] **Step 3: Commit** — `feat(android): social safety menu, report sheet, avatar and toast components`.

---

### Task 5: Leaderboard screen and weekly recap

**Files:**
- Create: `app/src/main/java/.../ui/league/LeaderboardViewModel.kt`, `LeaderboardScreen.kt`, `WeeklyRecapSheet.kt`
- Test: `app/src/test/java/.../ui/league/LeaderboardViewModelTest.kt`

**Interfaces:**
- `LeaderboardViewModel(client, snapshotCache, recapCache, tierCache, userId, nowMillis)` with `scope` (global/friends/country), `period` (weekly/all-time), `rows`, `isLoading`, `error`, `toast`, `load()`, `checkForOvertake()` (global weekly, compares with the cache, toasts "Someone passed you on the leaderboard!"), `block(target)` (removes the row on `ok`), `recap(): RecapState` (last week XP via `fetchActivityXp` between `mondayDateString(1)` and `mondayDateString(0)`, current global weekly rank, promotion since last recap).
- Screen: two segmented rows, list rows with rank badge (gold/silver/bronze tints for 1 to 3), avatar, YOU pill on the learner's own row, country code, XP, safety menu on other rows; top actions Teams, Season, Recap; empty-state copy per scope from `LeaderboardView.swift`.

- [ ] **Step 1: Failing tests** — load posts `{_scope,_period}`; overtake toast appears only when `wasOvertaken` is true and the cache is then replaced; a first launch with an empty cache never toasts (Review Focus 3); block removes the row and toasts the name; recap computes XP from the two Monday bounds and flags a bronze→silver promotion once (second call: no promotion).
- [ ] **Step 2 to 5:** implement, test, `assembleDebug`, commit `feat(android): leaderboard with overtake detection, weekly recap, block and report`.

---

### Task 6: Teams and Season screens

**Files:**
- Create: `app/src/main/java/.../ui/league/TeamsViewModel.kt`, `TeamsScreen.kt`, `SeasonScreen.kt`
- Test: `app/src/test/java/.../ui/league/TeamsViewModelTest.kt`

**Interfaces:**
- `TeamsViewModel(client, nowMillis)`: `myTeam`, `members`, `leaderboard`, `error`, `loadAll()`, `joinByCode(code)`, `autoJoin()`, `createTeam(name, visibility)`, `leave()`, `kick(userId)`; `canLeave = myTeam.switchLockedUntilMillis <= now`.
- Screen: my-team section (join code with a share action via `Intent.ACTION_SEND` using the iOS share text, this week's XP, leave or "Can't leave until <date>"), members with an owner badge and kick for owners, join-by-code and auto-join, create form with public/private, top teams list. Season screen: division, rank of cohort, last week's result.

- [ ] **Step 1: Failing tests** — with a team: members are loaded and the leave button is hidden while locked; without a team: members are not requested; a rejected join surfaces `reason`; create clears the name on success.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): teams and season screens`.

---

### Task 7: Friends screen, invite codes and deep link

**Files:**
- Create: `app/src/main/java/.../ui/friends/FriendsViewModel.kt`, `FriendsScreen.kt`, `InviteAcceptScreen.kt`
- Modify: `AndroidManifest.xml` (App Link intent filter for `https://learn.alphonsoecosystem.app/invite/*`), `MainActivity.kt` (route an invite URI to the accept screen), `RootScreen.kt` (route `invite/{code}`)
- Test: `app/src/test/java/.../ui/friends/FriendsViewModelTest.kt`, `InviteAcceptViewModelTest.kt`

**Interfaces:**
- `FriendsViewModel(client, nudgeCache, userId)`: `friends`, `activity`, `inviteLink` (from `getMyFriendCode`), `toast`, `loadAll()`, `nudge(friend)` (records cooldown on success), `canNudge(friend)`, `remove(friend)`, `block(friend)` (removes from friends and activity), `checkForNudges()` (toast "<name> nudged you!" or "<n> friends nudged you!", then mark read).
- `InviteAcceptViewModel(client, code)`: `preview` (`FriendInvitePreview`), `accept()`, states loading / self / invalid / ready(name) / accepted / error, copy from `invite.$code.tsx`.
- Friends screen also has an "Enter a friend code" field for links that arrive through channels Android cannot open as App Links.

- [ ] **Step 1: Failing tests** — invite link is `API_BASE_URL/invite/<code>`; nudge success records the cooldown and the same friend is not nudgeable until 24h later; block removes the friend and their activity rows (Review Focus 1); unread nudges produce the single and plural messages and are marked read; preview with `is_self` yields the self state (Review Focus 5); `invalid-code` yields the invalid state; accept success yields accepted.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): friends, nudges, activity feed, invite codes and App Link`.

Owner action recorded in the README: publish `/.well-known/assetlinks.json` on `learn.alphonsoecosystem.app` with the app's signing certificate fingerprint (Plan 5 knows the fingerprint) so Android opens invite links in the app without a chooser.

---

### Task 8: Duels screen

**Files:**
- Create: `app/src/main/java/.../ui/friends/DuelsViewModel.kt`, `DuelsScreen.kt`
- Test: `app/src/test/java/.../ui/friends/DuelsViewModelTest.kt`

**Interfaces:**
- `DuelsViewModel(client, userId)`: `pending` (status pending and I am the opponent), `active`, `finished`, `friends`, `error`, `waitingInQueue`, `respond(duel, accept)`, `challenge(friendId, course)`, `joinQueue(course, matchByLevel)`, `leaveQueue()`, `resultLabel(duel)` ("Declined", "You won", "You lost", "Tied"), `myDelta(duel)`/`theirDelta(duel)`.

- [ ] **Step 1: Failing tests** — partitioning by status and my id; `respond` reloads on `ok` and shows `reason` otherwise; queue join that matches reloads, that does not match sets waiting; result labels.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): duels`.

---

### Task 9: Achievements screen with weakness trend

**Files:**
- Create: `app/src/main/java/.../ui/achievements/AchievementsViewModel.kt`, `AchievementsScreen.kt`
- Test: `app/src/test/java/.../ui/achievements/AchievementsViewModelTest.kt`

**Interfaces:**
- `AchievementsViewModel(content, client)`: `unlockedById`, `weaknessTrend`, `error`; screen shows "<n> of <total> unlocked", a two-column grid of badges (tier colours `B07242`, `8A9099`, `C4933F`, `4A7F7A`; icon glyphs for flame, bolt, star, check, shield, snow), and the trend card ("Still working on it" vs "Mastered (n×)") for the first eight entries.

- [ ] **Step 1: Failing tests** — a failed unlock fetch keeps the catalog visible with the error copy; trend entries sort open first.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): achievements and weakness trend`.

---

### Task 10: Profile hub, identity editing, weekly challenges, streak freeze

**Files:**
- Create: `app/src/main/java/.../ui/profile/ProfileHubScreen.kt`
- Modify: `ui/settings/SettingsScreen.kt` (Profile section: avatar circle with Shuffle, display name field with Save, 40 char cap), `ui/learn/LearnScreen.kt` and `LearnViewModel.kt` (weekly challenges section with progress bars; claim button when `completed` and not yet claimed calls `claimWeeklyQuest(templateId, course, mondayDateString(0))`), `ui/learn/StatusHeader.kt` (streak-freeze count and a "Buy freeze (50 XP)" action calling `buyStreakFreezeWithXp`, showing the insufficient-XP message), `RootScreen.kt` (Profile tab renders the hub; routes `league`, `teams`, `season`, `friends`, `duels`, `achievements`)
- Test: extend `LearnViewModelTest` (challenges load; claim posts `{_quest_id,_course,_week_start}`) and add `SettingsIdentityTest` for the view-model slice (save trims and caps at 40; shuffle produces 8 hex chars).

- [ ] **Step 1: Failing tests** as listed.
- [ ] **Step 2 to 5:** implement, test, build, commit `feat(android): profile hub, identity editing, weekly challenges, streak freeze`.

---

### Task 11: Docs

**Files:**
- Modify: `android/LearnWithAlphonso/README.md` (Plan 2 row becomes "in"; owner actions: assetlinks.json), `ARCHITECTURE.md` Android section (list the new screens), `AGENTS.md` (no new rows needed unless a new top-level file appears), `CHANGELOG.md` (one V5 paragraph).

- [ ] **Step 1: Update and commit** — `docs: Android plan 2 documentation`.
- [ ] **Step 2: Push and watch `android-ci.yml`** to green, including the emulator job.

---

## Self-review

- Spec coverage: every section 4 row named in the header maps to Tasks 5 to 10; block and report to Task 4 plus per-screen wiring; profile identity to Task 10.
- Placeholders: none; each task names the exact Swift or TS source being ported and the vectors.
- Type consistency: model names in Task 1 are the ones Tasks 5 to 10 consume; `RpcOutcome` is used by every `{ok, reason}` RPC; `Pair<Boolean, String>` by the two `{ok, message}` RPCs.
- Review Focus: 1 in Tasks 5 and 7, 2 in Task 3, 3 in Task 2 and 5, 4 in Task 1, 5 in Task 7.
- Known carry-over from Plan 1: `main` now gates written translation grading behind the AI disclosure sheet on iOS (`.aiDisclosureGate()`). Android's lesson player and review queue send translations to the AI grader without that disclosure until Plan 3's disclosure gate lands; Plan 3 must wire it to both screens, not only to Hector and Practice.
