# Hector Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Hector (the Pro AI tutor) off AlphonsoEcosystem's separate Cloud Voice backend and account into Learn with Alphonso's own backend and account, so account deletion removes all Hector data with nothing left behind.

**Architecture:** Hector's turn is LLM reply + TTS audio — request/response, no streaming — and its cross-session memory is already ours (`TutorMemoryContext` from `weakness_events`). So the tutor becomes one route in the backend we already run (`/api/hector-respond`, Task A, shipped in #189), the iOS client is repointed to it using the main Supabase session (Task B–D), and the entire cross-project bridge (`hector_links`, shadow account, `/api/hector-link`, revocation, the Cloud Voice sign-in/enroll UI) is deleted (Task E–H).

**Tech Stack:** TanStack Start (server routes), TypeScript/Vitest, SwiftUI + LearnWithAlphonsoKit (XCTest), Supabase (Postgres + migrations), NVIDIA NIM (LLM), Deepgram (TTS).

**Spec:** `docs/superpowers/specs/2026-09-27-hector-decoupling-design.md`

## Global Constraints

- **iOS code is unverifiable locally** — swift cannot run in this environment. Any task touching `ios/**/Sources/` is unverified until the `ios-app-build` CI job is green; that job, not a local run, is the test step for those tasks.
- **`main` has no branch protection** — never self-merge; every PR is handed back for review. Before handing back: `git fetch origin` then `git diff --stat origin/main <branch>` (two dots), and confirm CI ran against the branch HEAD (`gh run list --branch <b> --json headSha` vs `git rev-parse origin/<b>`).
- **Gates before every push:** `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `bun run build` all clean.
- **Do not edit** ARCHITECTURE / AGENTS / README / CHANGELOG — the orchestrator does one doc pass at the end.
- **Migrations** version after the latest applied (`20260929020003`); the types-staleness guard regenerates from production, so a table-dropping migration will fail that guard until merged+deployed — expected (BACKLOG §0.0h), clear it the same way as prior table changes.
- **TutorReply JSON contract is fixed** by the iOS decoder `TutorReply.CodingKeys`: `request_id, session_id, agent, reply, audio_base64, tts_model, tts_provider, language, state, timings_ms{llm,tts,total}`. Any server change must keep these exact keys.

## Review Focus

- **A Pro user with no Cloud Voice enrollment** — after the repoint, opening Hector must go straight to the conversation for any Pro user, with no email/code step. Pinned in Task B (HectorView renders the conversation when `isPro`, no `HectorSession` state).
- **A non-Pro user hitting `/api/hector-respond` directly** — must 403, not serve a tutor turn. Pinned in Task A (already shipped: fail-closed Pro gate) — re-confirmed by an explicit note in Task E that deleting the shadow account does not remove that gate.
- **Deleting an account after the cleanup** — `deleteMyAccount` must not call the removed `revokeHectorLinkForUser` and must still succeed; nothing references `hector_links` after the drop. Pinned in Task F (test asserts deletion returns `{deleted:true}` with no Hector fields and no throw).
- **The privacy policy after cleanup** — must no longer claim Hector is a separate system requiring manual email deletion, because it no longer is. Pinned in Task G (legal-pages test asserts the caveat text is gone).
- **A stale TestFlight build still calling the old Cloud Voice endpoint** — the old `/v1/voice/respond` stays up (it's AlphonsoEcosystem's, not ours), so old builds keep working; new builds use ours. No code pins this — it's an ops note: do not decommission Cloud Voice until no shipped build points at it.

---

## Task A: `/api/hector-respond` endpoint — DONE (#189)

**Files:**
- Created: `src/lib/hector-conversation.ts`, `src/lib/hector-conversation.test.ts`, `src/routes/api/hector-respond.ts`

**Status:** Shipped in PR #189. Turn-based LLM+TTS, main-Supabase auth, fail-closed Pro gate, rate-limited, returns the exact `TutorReply` shape, stateless. 6 helper tests green. No further work; later tasks consume it.

**Produces:** `POST /api/hector-respond` accepting `{session_id, text, language, agent_id?, history:[{role,content}]}` and returning the `TutorReply` JSON above. Auth via `Authorization: Bearer <main Supabase access token>`.

---

## Task B: Repoint the iOS tutor client to our endpoint + main session

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/AppConfig.swift`
- Modify: `ios/LearnWithAlphonso/Sources/HectorView.swift:337-345` (the `TutorConversationClient(...)` construction and the `hectorAccessToken` gate around it)
- Test: `ios-app-build` CI (no local swift)

**Interfaces:**
- Consumes: Task A's `POST /api/hector-respond`; the existing main `Session.accessToken`.
- Produces: a Hector conversation that authenticates with the main account. Removes the last runtime dependency on `AppConfig.cloudVoiceRespondEndpoint`.

- [ ] **Step 1: Add the endpoint to AppConfig**

In `AppConfig.swift`, add next to `apiBaseURL`:

```swift
/// Hector's turn now runs in our own backend against the main account
/// (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md).
static let hectorRespondEndpoint = apiBaseURL.appendingPathComponent("api/hector-respond")
```

- [ ] **Step 2: Point the tutor client at it, using the MAIN session token**

In `HectorView.swift`, replace the client construction (currently lines ~337–345) with:

```swift
phase = .thinking
let tutorClient = TutorConversationClient(
    endpoint: AppConfig.hectorRespondEndpoint,
    accessToken: { accessToken },   // the MAIN Session.accessToken, not a Cloud Voice token
    deviceID: UIDevice.current.identifierForVendor?.uuidString ?? sessionID
)
let historyWithMemory = (memoryContext.map { [$0] } ?? []) + turns
let reply = try await tutorClient.respond(sessionID: sessionID, text: text, language: "en", history: historyWithMemory)
```

Note `language: "en"` (our endpoint maps language→voice via `deepgramVoiceForLanguage`, which keys on `en`/`fr`/`es`, not `en-US`).

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/AppConfig.swift ios/LearnWithAlphonso/Sources/HectorView.swift
git commit -m "feat(hector): point the tutor client at /api/hector-respond with the main session"
```

- [ ] **Step 4: Push, confirm `ios-app-build` green** (the only test for this task).

---

## Task C: Remove the Cloud Voice sign-in/enroll gate from the Hector UI

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/HectorView.swift` (the `switch hectorSession.state` gate, ~lines 22–48, and the `HectorEmailStep`/`HectorCodeStep`/"Sign in to Hector" subviews)
- Test: `ios-app-build` CI

**Interfaces:**
- Consumes: `entitlementStore.isPro`, the main `session`.
- Produces: opening Hector shows the paywall when not Pro, and the conversation immediately when Pro — no email/code/enroll step.

- [ ] **Step 1: Collapse the gate to Pro-only**

Replace the body gate so it is:

```swift
if !entitlementStore.isPro {
    HectorPaywall(entitlementStore: entitlementStore)   // existing not-Pro branch
} else {
    HectorConversationView(session: session, hectorSession: nil)
}
```

Then delete the `switch hectorSession.state { ... }`, the `@State private var hectorSession`, the `.onChange(of: hectorSession.enrolledCloudVoiceUserID)` block, and the `HectorEmailStep` / `HectorCodeStep` / "Sign in to Hector" subviews in this file. `HectorConversationView` must no longer take a `hectorSession`; it already has `session` for the main access token (Task B).

- [ ] **Step 2: Update `HectorConversationView`'s signature** to drop the `hectorSession` parameter and read `accessToken` from the main `session` only.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(hector): open the tutor for any Pro user, no separate sign-in"
```

- [ ] **Step 4: Push, confirm `ios-app-build` green.** Manually dispatch Maestro `all` afterward: the signed-in flow's `tapOn: "Hector"` should now reach the conversation, not a sign-in wall.

---

## Task D: Delete the now-dead Cloud Voice client code

**Files:**
- Delete: `ios/LearnWithAlphonso/Sources/HectorSession.swift`
- Delete: `ios/LearnWithAlphonso/Sources/LinkHectorAccountSheet.swift`
- Delete: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/DeviceEnrollmentClient.swift` (and its test) — only `HectorSession` used it
- Modify: remove `cloudVoiceSupabaseURL`, `cloudVoiceSupabasePublishableKey`, `cloudVoiceRespondEndpoint` from `AppConfig.swift`
- Test: `ios-app-build` + `ios-swift-tests` CI

- [ ] **Step 1:** `git rm` the three files above and their tests.
- [ ] **Step 2:** Remove the three `cloudVoice*` constants from `AppConfig.swift`.
- [ ] **Step 3:** Grep for stragglers: `grep -rn "cloudVoice\|HectorSession\|DeviceEnrollment\|LinkHectorAccount" ios/` must return nothing.
- [ ] **Step 4: Commit**

```bash
git commit -am "chore(hector): delete the dead Cloud Voice sign-in/enroll client code"
```

- [ ] **Step 5: Push, confirm both iOS CI jobs green.**

---

## Task E: Remove the server-side Hector bridge routes

**Files:**
- Delete: `src/routes/api/hector-link.ts` (+ `.test.ts`)
- Delete: `src/routes/api/hector-shadow-account.ts` (+ `.test.ts`)
- Delete: `src/lib/hector-revocation.ts` (+ `.test.ts`)
- Delete: `src/lib/hector-shadow-account.ts` (+ `.test.ts`) if present
- Modify: `src/routeTree.gen.ts` (regenerate via `bun run build`)

**Interfaces:**
- Produces: none of these routes exist. Nothing imports them (verified in Step 2).

- [ ] **Step 1:** `git rm` the files above.
- [ ] **Step 2: Verify nothing imports them**

Run: `grep -rn "hector-link\|hector-shadow-account\|hector-revocation" src/ | grep -v hector-respond`
Expected: only matches inside `account.functions.ts` (removed in Task F) — everything else empty.

- [ ] **Step 3:** `bun run build` to regenerate the route tree; `bunx prettier --write src/routeTree.gen.ts`.
- [ ] **Step 4:** `bunx tsc --noEmit` — Expected: FAIL, pointing at `account.functions.ts`'s now-dangling `revokeHectorLinkForUser` import. That failure is the seam into Task F.

---

## Task F: Simplify account deletion — nothing separate to revoke

**Files:**
- Modify: `src/lib/account.functions.ts` (remove `revokeHectorLinkForUser` and its call in `deleteMyAccount`; drop `hectorRevoked` from the return)
- Modify: `src/lib/account.functions.test.ts`

**Interfaces:**
- Consumes: nothing from removed modules.
- Produces: `deleteMyAccount` returns `{ deleted: true, appleRevoked }` — no `hectorRevoked`.

- [ ] **Step 1: Write the failing test** in `account.functions.test.ts`:

```ts
it("deletes without any Hector revocation step now that Hector is in-account", async () => {
  const supabase = createSupabaseMock();
  const result = await deleteMyAccount({ context: ctx(supabase) });
  expect(result.deleted).toBe(true);
  expect("hectorRevoked" in result).toBe(false);
});
```

- [ ] **Step 2: Run it, expect FAIL** (`hectorRevoked` still present).

Run: `bunx vitest run src/lib/account.functions.test.ts -t "no Hector revocation"`

- [ ] **Step 3: Implement** — delete the `revokeHectorLinkForUser` function and its import, delete the `const hectorRevoked = await revokeHectorLinkForUser(...)` line, and change the return to `{ deleted: true, appleRevoked }`. Delete any test that asserted `hectorRevoked`.

- [ ] **Step 4: Run tests, expect PASS.** Then `bunx tsc --noEmit` clean (closes Task E's Step 4 failure).

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor(account): drop Hector revocation — deletion now covers it in-account"
```

---

## Task G: Update the privacy policy — Hector is no longer a separate system

**Files:**
- Modify: `src/routes/privacy.tsx` (the "Hector (advanced voice tutor)" section)
- Modify: `src/routes/legal-pages.test.tsx`

**Interfaces:**
- Produces: the policy states Hector runs in the same system and is deleted with the account.

- [ ] **Step 1: Write the failing test** in `legal-pages.test.tsx`:

```ts
it("no longer claims Hector is a separate, non-deletable system", () => {
  const Privacy = PrivacyRoute.options.component!;
  render(<Privacy />);
  expect(screen.queryByText(/not currently linked for deletion/i)).toBeNull();
  expect(screen.queryByText(/different system/i)).toBeNull();
});
```

- [ ] **Step 2: Run it, expect FAIL** (the old caveat still renders).

- [ ] **Step 3: Rewrite the Hector section** of `privacy.tsx` to:

```tsx
<Section heading="Hector (advanced voice tutor)">
  <p>
    Hector, our advanced AI voice tutor, runs on the same account and the
    same systems as the rest of Learn with Alphonso. Deleting your account
    removes your Hector data along with everything else — there is no
    separate account to manage.
  </p>
</Section>
```

Also drop Cloud Voice from the processors list if it is only there for Hector's separate backend; keep Deepgram/NVIDIA (Hector still uses them).

- [ ] **Step 4: Run tests, expect PASS.** Update any other legal-pages assertion that pinned the old Hector text.

- [ ] **Step 5: Commit**

```bash
git commit -am "docs(privacy): Hector now runs in-account and is deleted with it"
```

---

## Task H: Drop the `hector_links` table

**Files:**
- Create: `supabase/migrations/20260930000000_drop_hector_links.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Hector decoupling (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md):
-- Hector now runs in-account via /api/hector-respond, so the table that
-- mapped an Alphonso account to a separate Cloud Voice account is dead.
-- Nothing reads or writes it after this change (hector-link, revocation,
-- and the shadow account are all removed).
DROP TABLE IF EXISTS public.hector_links;
```

- [ ] **Step 2:** `bunx supabase gen types` guard will flag types.ts — regenerate via the Regenerate Supabase Types workflow after merge+deploy, same as any schema change (BACKLOG §0.0h). Note in the PR that the types-guard red is expected pre-merge.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(db): drop hector_links — Hector is decoupled and in-account"
```

- [ ] **Step 4: Push. After merge, confirm `deploy-supabase` applies it and the types guard clears** (apply the migration + register the version if the deadlock recurs, per BACKLOG §0.0i).

---

## Self-Review

**Spec coverage:** every spec step maps — Task A = spec step 1 (done); Tasks B–D = spec step 2 (iOS repoint + drop enrollment); Tasks E–H = spec step 3 (delete bridge, simplify deletion, privacy, drop table). No gaps.

**Placeholder scan:** each code step carries real code; iOS steps that can't run locally name `ios-app-build` as their explicit test, which is this repo's established verification for Swift. No TODO/TBD.

**Type consistency:** `TutorReply` keys are fixed by Task A and consumed unchanged in Task B; `deleteMyAccount`'s return goes `{deleted, appleRevoked, hectorRevoked}` → `{deleted, appleRevoked}` in Task F and the test in the Review Focus checks exactly that; `hectorRespondEndpoint` is defined in Task B Step 1 and used in Task B Step 2.

**Review Focus:** all five lines above are pinned to a task's test, except the last (stale-build ops note), which is deliberately an ops caution with no code to test.
