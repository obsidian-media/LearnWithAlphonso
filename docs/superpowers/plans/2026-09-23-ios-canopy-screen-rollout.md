# iOS Canopy Theme — Screen Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Canopy theme (via the shared components and tokens the foundation plan already built) to every already-styled iOS screen, so the app stops reading as "an empty piece of background with some written knowledge on it."

**Architecture:** Because `AlphonsoColor`/`AlphonsoFont` are already computed properties reading the *active* theme, no screen needs a color/font call-site change to render under Canopy — that already works the moment a user selects it. The real work here is adopting `AlphonsoMascotBanner` and `AlphonsoRowCard` (from the foundation plan) at the specific spots that are currently plain-text-with-no-imagery, screen by screen, in priority order (flagship screens users see most → the rest).

**Tech Stack:** SwiftUI. Same constraints as the foundation plan — no local Xcode/macOS, `ios-app-build` CI is the only compile gate.

**Spec:** `docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-23-ios-canopy-theme-foundation.md` must be fully merged first — every task below uses `AlphonsoThemeID.canopy`, `AlphonsoMascotBanner`, and `AlphonsoRowCard`, none of which exist until that plan lands.

## Global Constraints

- Every task's diff must compile for Meadow/Studio Ink/Manuscript exactly as it does for Canopy — these are component adoptions (swapping `Text`-only rows for `AlphonsoRowCard`, adding an `AlphonsoMascotBanner`), not Canopy-conditional branches. No `if theme == .canopy` anywhere in this plan.
- No local Xcode/macOS — `ios-app-build` CI is the only compile verification. Every task still commits independently.
- Any `Section { <bare ForEach> } header: { ... }` this plan touches must have its `ForEach` assigned to a named `let` first (the documented brace-misparse-bug fix, `ARCHITECTURE.md`'s "Known rough edges") — don't just edit the row content in place and leave the risky shape intact.
- No new mascot art, no new SF-Symbols-replacement effort, no RevenueCat/subscription-flow changes — all explicit non-goals in the spec.
- Per the spec's recorded decision: no interim real-device checkpoint between tasks in this plan.

## Review Focus

- **VoiceOver users** hitting a new `AlphonsoMascotBanner` get a real spoken label (already guaranteed by the component itself, per the foundation plan) — each task below must actually pass a real `message:` string, not an empty or placeholder one.
- **A screen with per-item state (locked lesson, today's review, current rank)** must keep conveying that state visually after swapping to `AlphonsoRowCard` — the component takes an `accent:` color precisely for this; a task that swaps to the default `accent: .moss` for every row, discarding a screen's existing locked/dimmed/highlighted distinction, is a regression, not a straight port.
- **Tap targets and navigation** must survive the `Text`-row-to-`AlphonsoRowCard` swap unchanged — `AlphonsoRowCard` is content only, so the enclosing `NavigationLink`/`Button` must still wrap it the same way it wrapped the old content.
- **The `Section`/`ForEach` brace-bug** — every task touching a `Section { ForEach ... } header: { ... }` shape must apply the named-`let` fix, checked explicitly, not left to CI to catch by accident.
- **Existing empty/loading states** (`AlphonsoEmptyState` usage, `entitlementStore.isLoading`, "not available yet" text, etc.) must still render for their actual condition after a task's edit — a common mistake when restructuring a `VStack`/`List` is accidentally making a conditional branch unconditional or vice versa.

---

### Task 1: `AuthView` — mascot banner replaces the small circular avatar

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/AuthView.swift`

**Interfaces:**
- Consumes: `AlphonsoMascotBanner(mascot: .alphonso, message:)` (foundation plan, Task 6).

- [ ] **Step 1: Replace the header block**

Current code (top of `body`):

```swift
                    VStack(spacing: AlphonsoSpacing.md) {
                        // Alphonso himself greets you -- the app's own
                        // namesake had zero visual presence anywhere
                        // before this; the sign-in screen is the first
                        // thing every user ever sees.
                        Image("Alphonso")
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 96, height: 96)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(AlphonsoColor.moss, lineWidth: 3))
                            .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.7)

                        VStack(spacing: AlphonsoSpacing.xs) {
                            Text("Learn with Alphonso")
                                .font(AlphonsoFont.display(32, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                                .multilineTextAlignment(.center)
                            Text("Sign in to start learning")
                                .font(AlphonsoFont.sans(15))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
```

Replace with:

```swift
                    VStack(spacing: AlphonsoSpacing.md) {
                        Text("Learn with Alphonso")
                            .font(AlphonsoFont.display(32, weight: .semiBold))
                            .foregroundStyle(AlphonsoColor.ink)
                            .multilineTextAlignment(.center)

                        // Alphonso himself greets you -- the app's own
                        // namesake had zero visual presence anywhere
                        // before this; the sign-in screen is the first
                        // thing every user ever sees. A banner (not just
                        // a small circular avatar) so he's actually
                        // "speaking" the greeting, not just decorating it.
                        AlphonsoMascotBanner(mascot: .alphonso, message: "Sign in to start learning")
                            .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.9)
                    }
```

(The banner's own internal text already renders "Sign in to start learning" — this removes the separate small "Sign in to start learning" `Text` that used to sit under the title, since the banner now carries that copy.)

- [ ] **Step 2: Self-review**

Confirm `emailStep`/`codeStep` and everything below the header block is untouched — this task only replaces the header, not the form. Confirm the banner's `message:` is a real, non-empty sentence (Review Focus item 1).

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/AuthView.swift
git commit -m "feat(ios): AuthView uses AlphonsoMascotBanner instead of a bare avatar"
```

---

### Task 2: `PaywallView` — mascot banner replaces the SF Symbol

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/PaywallView.swift`

**Interfaces:**
- Consumes: `AlphonsoMascotBanner(mascot: .hector, message:)`.

- [ ] **Step 1: Replace the sparkles-icon header**

Current code:

```swift
        VStack(spacing: AlphonsoSpacing.lg) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(AlphonsoColor.ember)
            Text("Alphonso Pro")
                .font(AlphonsoFont.display(28, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("Unlock Hector, your personal AI tutor, for $9.99/month.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
```

Replace with:

```swift
        VStack(spacing: AlphonsoSpacing.lg) {
            // This is the exact screen the account owner pointed at
            // during brainstorming as "everything wrong with how it
            // looks" -- an SF Symbol and plain text, despite Hector's
            // real bundled portrait existing. This banner is that fix.
            AlphonsoMascotBanner(mascot: .hector, message: "Meet Hector, your AI tutor")
            Text("Unlock Hector, your personal AI tutor, for $9.99/month.")
                .font(AlphonsoFont.sans(14))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
```

("Alphonso Pro" as a separate large title is dropped — the banner already names Hector, and the subtitle line right below still explains the offer; this avoids saying "Alphonso Pro" and "Hector" as two separate headline concepts stacked on top of each other, matching the reference mockups from brainstorming, which used one clear headline.)

- [ ] **Step 2: Self-review**

Confirm every line below — `entitlementStore.isLoading`/`.packages.isEmpty`/the purchase `ForEach`/`Restore Purchases`/`errorMessage` — is untouched; this task only replaces the header block above them. Confirm the `.buttonStyle(.alphonsoEmber)` call two lines below the header is unchanged (already correctly gets Canopy's `onAccent` dark text from the foundation plan's Task 2 — nothing to do here).

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/PaywallView.swift
git commit -m "feat(ios): PaywallView uses AlphonsoMascotBanner instead of an SF Symbol"
```

---

### Task 3: Learn tab — greeting banner + row-card lessons (`StatusHeaderView`, `LessonBrowserView`)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/StatusHeaderView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonBrowserView.swift`

**Interfaces:**
- Consumes: `AlphonsoMascotBanner(mascot: .alphonso, message:)`, `AlphonsoRowCard(title:subtitle:accent:)`.

- [ ] **Step 1: Add a greeting banner below `StatusHeaderView`'s pills**

This is the exact screen validated in the brainstorming mockups (`Learn tab — Canopy`). `StatusHeaderView`'s existing `HStack` of streak/hearts/xp/league pills stays completely as-is (it already works, isn't part of the "plain text" complaint). Add the banner as a second row inside the same view. Current `body`:

```swift
    var body: some View {
        if let progress {
            HStack(spacing: AlphonsoSpacing.sm) {
                ...
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .springEntrance(response: 0.55, dampingFraction: 0.7, minScale: 0.9)
        }
    }
```

Replace with:

```swift
    var body: some View {
        if let progress {
            VStack(spacing: AlphonsoSpacing.sm) {
                HStack(spacing: AlphonsoSpacing.sm) {
                    ...
                }

                // Direct user feedback (see this file's own header doc
                // comment) was that the Learn tab "feels like an empty
                // piece of background with some written knowledge on
                // it" -- this banner is the fix for the top of that
                // screen specifically (LessonBrowserView's row-card
                // work below addresses the rest of it).
                AlphonsoMascotBanner(mascot: .alphonso, message: greeting(streak: progress.streak))
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .springEntrance(response: 0.55, dampingFraction: 0.7, minScale: 0.9)
        }
    }

    private func greeting(streak: Int) -> String {
        streak > 0 ? "Nice \(streak)-day streak! Ready for today's lesson?" : "Ready for today's lesson?"
    }
```

(The `HStack {...}` body itself — the streak/hearts/xp/league pills — is unchanged; only wrapped in a new outer `VStack` with the banner added below it. `greeting(streak:)` is a small private helper so the message is real/specific rather than generic, per this plan's Review Focus on real banner copy.)

- [ ] **Step 2: Fix the brace-risk shape and swap to row cards in `LessonBrowserView`**

Current code (the exact `Section { <bare ForEach> } header: { ... }` shape flagged as risky):

```swift
                ForEach(contentStore.bundle(for: course).units) { unit in
                    Section {
                        ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
                            NavigationLink(value: lesson.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lesson.title)
                                        .font(AlphonsoFont.sans(16, weight: .medium))
                                        .foregroundStyle(AlphonsoColor.ink)
                                    Text(lesson.subtitle)
                                        .font(AlphonsoFont.sans(13))
                                        .foregroundStyle(AlphonsoColor.inkSoft)
                                }
                                .padding(.vertical, 2)
                            }
                            .springEntrance(delay: Double(index % 8) * 0.04)
                        }
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(AlphonsoColor.parchment)
                }
```

Replace with (named-`let` fix applied — matching `DuelsView.swift`'s already-established pattern per `ARCHITECTURE.md` — plus the plain-`Text` row content swapped for `AlphonsoRowCard`):

```swift
                ForEach(contentStore.bundle(for: course).units) { unit in
                    let lessonRows = ForEach(Array(unit.lessons.enumerated()), id: \.element.id) { index, lesson in
                        NavigationLink(value: lesson.id) {
                            AlphonsoRowCard(
                                title: lesson.title,
                                subtitle: lesson.subtitle,
                                accent: index == 0 ? AlphonsoColor.ember : AlphonsoColor.moss
                            )
                        }
                        .springEntrance(delay: Double(index % 8) * 0.04)
                    }
                    Section {
                        lessonRows
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(Color.clear)
                }
```

Two deliberate changes beyond the row-card swap: `.listRowBackground(Color.clear)` replaces `.listRowBackground(AlphonsoColor.parchment)` — `AlphonsoRowCard` already paints its own `parchment` background per-row (see the foundation plan's Task 7), so keeping the *section's* row background would double up two parchment fills with a visible seam between rows; and `accent: index == 0 ? .ember : .moss` gives the first lesson in each unit a visually distinct "start here" accent dot rather than every row looking identical (this app has no other per-lesson "next up" signal in `LessonBrowserView` today — this is a small, cheap improvement directly in the spirit of "not an empty background," not scope creep, since it reuses a parameter `AlphonsoRowCard` already has).

- [ ] **Step 3: Self-review**

Re-check the diff against this plan's Review Focus items: (a) `Section`/`ForEach` — the `ForEach` is now a named `let lessonRows` assigned *before* `Section`, so there is no nested unclosed-brace-before-`header:` shape left for the compiler to misattach; (b) tap targets — `NavigationLink(value: lesson.id) { AlphonsoRowCard(...) }` still wraps the identical `NavigationLink`, just with different content, so `.navigationDestination(for: String.self)` below (unchanged) still fires the same way; (c) `WeeklyChallengesSection(session: session)` and the toolbar/`CoursePicker`/settings sheet below are all untouched by this task.

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/StatusHeaderView.swift ios/LearnWithAlphonso/Sources/LessonBrowserView.swift
git commit -m "feat(ios): Learn tab gets a greeting banner and row-card lessons"
```

---

### Task 4: `LessonPlayerView` — celebration banners (lesson finish, league promotion)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`

**Interfaces:**
- Consumes: `AlphonsoMascotBanner(mascot:message:)`.

- [ ] **Step 1: `FinishView` — replace the checkmark icon + separate title with a banner**

Current code:

```swift
        ScrollView {
            VStack(spacing: AlphonsoSpacing.md) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(AlphonsoColor.moss)
                Text("Lesson complete")
                    .font(AlphonsoFont.display(21, weight: .semiBold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text("+\(result.xpGain) XP")
```

Replace the icon+title pair with a banner (the XP number stays a separate, large, prominent line right after — that's the number a learner actually looks for, not the copy):

```swift
        ScrollView {
            VStack(spacing: AlphonsoSpacing.md) {
                // The exact "no imagery, just text/icon" pattern the
                // spec's Background section calls out on PaywallView
                // shows up here too -- same fix.
                AlphonsoMascotBanner(mascot: .alphonso, message: "Nice work — lesson complete!")
                Text("+\(result.xpGain) XP")
```

Everything from `Text("+\(result.xpGain) XP")` onward (the `\(correct)/\(total) correct` line, hearts-bonus text, achievements grid, `GeneratedPracticeSection`) is unchanged.

- [ ] **Step 2: `LeaguePromotionOverlay` — add a banner without discarding the tier-colored shield**

The shield icon here is deliberately tier-colored (`LeagueTierPalette.color(for: tier)` — bronze/silver/sapphire/ruby/diamond), which is meaningful information, not the "no imagery" pattern — keep it. Current code:

```swift
                Image(systemName: "shield.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(LeagueTierPalette.color(for: tier))
                    .springEntrance(response: 0.6, dampingFraction: 0.6, minScale: 0.4)
                Text("League up!")
                    .font(AlphonsoFont.display(34, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                Text("You've been promoted to \(LeagueTierPalette.label(for: tier))")
                    .font(AlphonsoFont.sans(17))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
```

Add Alphonso's congratulations below the existing shield/title (additive, not a replacement — this is the one banner spot in the plan that sits *alongside* an existing meaningful icon rather than replacing it):

```swift
                Image(systemName: "shield.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(LeagueTierPalette.color(for: tier))
                    .springEntrance(response: 0.6, dampingFraction: 0.6, minScale: 0.4)
                Text("League up!")
                    .font(AlphonsoFont.display(34, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                AlphonsoMascotBanner(mascot: .alphonso, message: "You've been promoted to \(LeagueTierPalette.label(for: tier))!")
                    .padding(.horizontal)
```

(The old plain `Text("You've been promoted to...")` is removed — its copy moved into the banner's `message:`.)

- [ ] **Step 3: Self-review**

Confirm no other part of `LessonPlayerView.swift` (`QuestionCard`, `OverviewScreen`, `VocabScreen`, `GeneratedPracticeSection`, `OfflineFinishView`) is touched — this task is scoped to exactly the two celebration spots above. Confirm `.fullScreenCover`/`.onAppear` wiring around `LeaguePromotionOverlay` (lines below `FinishView`'s `body`) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/LessonPlayerView.swift
git commit -m "feat(ios): lesson-finish and league-promotion screens get mascot banners"
```

---

### Task 5: `HectorView` — sign-in banner (mirrors `AuthView`)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/HectorView.swift`

**Interfaces:**
- Consumes: `AlphonsoMascotBanner(mascot: .hector, message:)`.

- [ ] **Step 1: Replace the circular avatar + separate title**

Current code (`signInBody`):

```swift
        VStack(spacing: AlphonsoSpacing.md) {
            // Hector's own visual presence -- previously text/voice-only
            // everywhere in the app despite being a fully-named persona.
            Image("Hector")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 96, height: 96)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(AlphonsoColor.ember, lineWidth: 3))
                .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.7)

            Text("Sign in to Hector")
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("Hector uses a separate account from your main Learn with Alphonso sign-in.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
```

Replace with (same banner pattern as `AuthView`'s Task 1, using `.hector` instead of `.alphonso`; the "separate account" explanation is substantive information, not greeting copy, so it stays as its own line below the banner rather than folding into `message:`):

```swift
        VStack(spacing: AlphonsoSpacing.md) {
            AlphonsoMascotBanner(mascot: .hector, message: "Sign in to Hector")
                .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.9)

            Text("Hector uses a separate account from your main Learn with Alphonso sign-in.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
```

- [ ] **Step 2: Self-review**

Confirm the `switch hectorSession.state` block and everything below it is untouched. Note that `HectorView`'s embedded `PaywallView(entitlementStore: entitlementStore)` (for non-Pro users, elsewhere in this file) already picks up Task 2's paywall banner automatically — no separate change needed for that state.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/HectorView.swift
git commit -m "feat(ios): HectorView sign-in uses AlphonsoMascotBanner"
```

---

### Task 6: `TeamsView` — row-card for the top-teams list

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/TeamsView.swift`

**Interfaces:**
- Consumes: `AlphonsoRowCard(title:subtitle:)`.

- [ ] **Step 1: Swap the plain `HStack` row for `AlphonsoRowCard`**

Current code:

```swift
            Section {
                if isLoading {
                    ProgressView().tint(AlphonsoColor.moss)
                } else {
                    ForEach(Array(leaderboard.enumerated()), id: \.element.teamID) { i, team in
                        HStack {
                            Text("\(i + 1). \(team.name)")
                                .font(AlphonsoFont.sans(14, weight: .medium))
                                .foregroundStyle(AlphonsoColor.ink)
                            Spacer()
                            Text("\(team.weeklyXP) XP")
                                .font(AlphonsoFont.sans(14, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
                }
            } header: {
                Text("This week's top teams")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(AlphonsoColor.parchment)
```

Replace with:

```swift
            Section {
                if isLoading {
                    ProgressView().tint(AlphonsoColor.moss)
                } else {
                    ForEach(Array(leaderboard.enumerated()), id: \.element.teamID) { i, team in
                        AlphonsoRowCard(title: "\(i + 1). \(team.name)", subtitle: "\(team.weeklyXP) XP this week")
                    }
                }
            } header: {
                Text("This week's top teams")
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .tracking(0.4)
                    .foregroundStyle(AlphonsoColor.ember)
            }
            .listRowBackground(Color.clear)
```

(`ForEach` here is already inside the `else` branch of an `if isLoading {...} else {...}`, not bare — this section was never the risky brace shape and stays that way; no named-`let` fix needed. `.listRowBackground` changes to `.clear` for the same double-parchment reason as Task 3.)

- [ ] **Step 2: Self-review**

Confirm the `myTeam`/join-code sections above this one, and the error-message line below it, are untouched.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/TeamsView.swift
git commit -m "feat(ios): TeamsView top-teams list uses AlphonsoRowCard"
```

---

### Task 7: `DuelsView` — row-card for past duels

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DuelsView.swift`

**Interfaces:**
- Consumes: `AlphonsoRowCard(title:subtitle:)`.

- [ ] **Step 1: Swap `pastDuelsSection`'s row content**

Current code:

```swift
    private var pastDuelsSection: some View {
        let content = ForEach(finished) { d in
            HStack {
                Text(d.course)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.ink)
                Spacer()
                Text(resultLabel(d))
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        }
        return Section {
            content
        } header: {
            Text("Past duels")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }
```

Replace with (the file's own already-established `let content = ForEach...; return Section { content } header: {...}` shape — `ARCHITECTURE.md`'s own cited fix example — is preserved exactly, only the row's inner content changes):

```swift
    private var pastDuelsSection: some View {
        let content = ForEach(finished) { d in
            AlphonsoRowCard(title: d.course, subtitle: resultLabel(d))
        }
        return Section {
            content
        } header: {
            Text("Past duels")
                .font(sectionHeaderFont)
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(Color.clear)
    }
```

`pendingSection` (has Accept/Decline buttons) and `activeSection` (two-value XP comparison, already inside an `if/else`) are intentionally left untouched — neither fits `AlphonsoRowCard`'s title/subtitle/no-action-slot shape without losing information, per this plan's Review Focus on not discarding a screen's existing state distinctions.

- [ ] **Step 2: Self-review**

Confirm `pendingSection`/`activeSection`/`challengeFriendSection`/`openDuelSection` are byte-for-byte unchanged.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DuelsView.swift
git commit -m "feat(ios): DuelsView past-duels list uses AlphonsoRowCard"
```

---

### Task 8: `FriendsView` — fix the live brace-bug-shaped Activity section

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/FriendsView.swift`

**Interfaces:** none new — this task only restructures existing code, no new component adoption (see reasoning below for why `ActivityEventRow`/`FriendRowView` are left as-is).

- [ ] **Step 1: Apply the named-`let` fix to the Activity section**

This section is a **live, currently-working instance of the exact bug shape** `ARCHITECTURE.md`'s "Known rough edges" describes (a bare `ForEach` as a `Section`'s sole content, immediately followed by `header:`) — it happens to compile correctly today only because nobody has yet made the edit that mis-nests the brace. Fix it proactively rather than leave a live landmine in a file this plan is already touching conceptually (even though no other change is needed here). Current code:

```swift
                    if !activityEvents.isEmpty {
                        Section {
                            ForEach(activityEvents) { event in
                                ActivityEventRow(event: event, displayName: displayName(for: event.userID))
                            }
                        } header: {
                            Text("Activity")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .tracking(0.4)
                                .foregroundStyle(AlphonsoColor.ember)
                        }
                        .listRowBackground(AlphonsoColor.parchment)
                    }
```

Replace with:

```swift
                    if !activityEvents.isEmpty {
                        let activityRows = ForEach(activityEvents) { event in
                            ActivityEventRow(event: event, displayName: displayName(for: event.userID))
                        }
                        Section {
                            activityRows
                        } header: {
                            Text("Activity")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .tracking(0.4)
                                .foregroundStyle(AlphonsoColor.ember)
                        }
                        .listRowBackground(AlphonsoColor.parchment)
                    }
```

`ActivityEventRow`'s own content (icon + text) is deliberately left unchanged — it's already a purpose-built, icon-led component, not the plain-text-on-background pattern `AlphonsoRowCard` targets, and `AlphonsoRowCard` has no icon slot (only a status-dot `accent:`) so swapping it in here would lose the icon rather than improve the row. `FriendRowView` (avatar/streak/XP/nudge-button row) is similarly bespoke and left untouched — not a component-swap candidate.

- [ ] **Step 2: Self-review**

Confirm the "Invite a friend" section and the friends-list section (both already safely wrapped in `if/else` branches, not bare `ForEach`) are untouched. Confirm `.listRowBackground(AlphonsoColor.parchment)` is unchanged here (unlike Tasks 3/6/7, `ActivityEventRow` doesn't paint its own card background, so the section-level parchment fill is still the only background and must stay).

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/FriendsView.swift
git commit -m "fix(ios): FriendsView activity section avoids the Section/ForEach brace-misparse risk"
```

---

### Task 9: `CampaignView`/`ConversationView` — extend `AlphonsoRowCard` with an emoji slot, fix two live brace-bug shapes

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`
- Modify: `ios/LearnWithAlphonso/Sources/CampaignView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/ConversationView.swift`

**Interfaces:**
- Consumes: `AlphonsoRowCard` (foundation plan, Task 7).
- Produces: `AlphonsoRowCard(title:subtitle:accent:leadingEmoji:)` — a backward-compatible addition (new parameter defaults to `nil`); every existing call site from Tasks 3/6/7 keeps compiling unchanged.

Both files have **structurally identical** rows (`Text(emoji).font(.largeTitle)` + title/subtitle `VStack`, inside a `Section` whose content closure is a bare `ForEach` — the exact brace-bug shape, live in both files) picking either a campaign or a scenario. This one task covers both since the fix is the same shape applied twice, and the component extension only makes sense written once.

- [ ] **Step 1: Add an optional `leadingEmoji` to `AlphonsoRowCard`**

Current component (from the foundation plan):

```swift
struct AlphonsoRowCard: View {
    let title: String
    let subtitle: String
    var accent: Color = AlphonsoColor.moss

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 2) {
            Circle()
                .fill(accent)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
```

Change to:

```swift
struct AlphonsoRowCard: View {
    let title: String
    let subtitle: String
    var accent: Color = AlphonsoColor.moss
    /// An emoji shown in place of the accent dot when present -- used by
    /// scenario/campaign pickers where the emoji itself is the
    /// meaningful visual (a specific scene's character), not just a
    /// status indicator. `nil` (the default) keeps every existing call
    /// site's plain accent-dot appearance unchanged.
    var leadingEmoji: String? = nil

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 2) {
            if let leadingEmoji {
                Text(leadingEmoji).font(.largeTitle)
            } else {
                Circle()
                    .fill(accent)
                    .frame(width: 8, height: 8)
            }

            VStack(alignment: .leading, spacing: 2) {
```

(Everything from the `VStack(alignment: .leading, spacing: 2) {` line onward — title/subtitle `Text`s, padding, background — is unchanged.)

- [ ] **Step 2: `CampaignView.swift` — fix the brace shape and adopt the row card**

Current code:

```swift
    var body: some View {
        Section {
            ForEach(campaigns) { campaign in
                NavigationLink {
                    CampaignSessionView(campaign: campaign, session: session)
                } label: {
                    HStack(spacing: AlphonsoSpacing.sm + 4) {
                        Text(campaign.emoji).font(.largeTitle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(campaign.title)
                                .font(AlphonsoFont.sans(16, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            Text(campaign.blurb)
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        } header: {
            Text("Campaigns")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }
```

Replace with:

```swift
    var body: some View {
        let rows = ForEach(campaigns) { campaign in
            NavigationLink {
                CampaignSessionView(campaign: campaign, session: session)
            } label: {
                AlphonsoRowCard(title: campaign.title, subtitle: campaign.blurb, leadingEmoji: campaign.emoji)
            }
        }
        Section {
            rows
        } header: {
            Text("Campaigns")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.ember)
        }
        .listRowBackground(Color.clear)
    }
```

- [ ] **Step 3: `ConversationView.swift` — fix the brace shape and adopt the row card**

Current code:

```swift
                Section {
                    ForEach(contentStore.scenarios) { scenario in
                        NavigationLink {
                            ConversationSessionView(scenario: scenario, session: session)
                        } label: {
                            HStack(spacing: AlphonsoSpacing.sm + 4) {
                                Text(scenario.emoji).font(.largeTitle)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(scenario.title)
                                        .font(AlphonsoFont.sans(16, weight: .semiBold))
                                        .foregroundStyle(AlphonsoColor.ink)
                                    Text(scenario.blurb)
                                        .font(AlphonsoFont.sans(12))
                                        .foregroundStyle(AlphonsoColor.inkSoft)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                } header: {
                    if !contentStore.campaigns.isEmpty {
                        Text("Scenarios")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                }
                .listRowBackground(AlphonsoColor.parchment)
```

Replace with:

```swift
                let scenarioRows = ForEach(contentStore.scenarios) { scenario in
                    NavigationLink {
                        ConversationSessionView(scenario: scenario, session: session)
                    } label: {
                        AlphonsoRowCard(title: scenario.title, subtitle: scenario.blurb, leadingEmoji: scenario.emoji)
                    }
                }
                Section {
                    scenarioRows
                } header: {
                    if !contentStore.campaigns.isEmpty {
                        Text("Scenarios")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                }
                .listRowBackground(Color.clear)
```

(`let scenarioRows = ...` sits directly inside `List { ... }`'s builder, alongside the existing `if !contentStore.campaigns.isEmpty { CampaignPickerSection(...) }` line above it — SwiftUI's `List`/`ViewBuilder` allows a `let` statement inside a result-builder block, same as this exact pattern already being used inside `CampaignPickerSection`'s own `body` and `DuelsView`'s `pendingSection`/`pastDuelsSection`.)

- [ ] **Step 4: `CampaignSessionView.completionCard` — same celebration-banner treatment as `LessonPlayerView`'s `FinishView`**

Current code (`CampaignView.swift`):

```swift
    private var completionCard: some View {
        VStack(spacing: 8) {
            Text("Nice work — campaign complete!")
                .font(AlphonsoFont.display(19, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("You made it through all \(campaign.scenes.count) scenes of \(campaign.title).")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
```

Replace with:

```swift
    private var completionCard: some View {
        VStack(spacing: 8) {
            AlphonsoMascotBanner(mascot: .alphonso, message: "Nice work — campaign complete!")
            Text("You made it through all \(campaign.scenes.count) scenes of \(campaign.title).")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
```

`ConversationSessionView` (the scenario equivalent, in `ConversationView.swift`) has no equivalent completion screen to touch — confirmed by reading the file, not assumed.

- [ ] **Step 5: Self-review**

Confirm both files' `NavigationLink` destinations (`CampaignSessionView`/`ConversationSessionView`) are unchanged — only the link's `label:` content changed. Confirm the foundation plan's existing `AlphonsoRowCard` call sites (Tasks 3, 6, 7) don't need updating — `leadingEmoji` defaults to `nil`, so they're source-compatible as written. Confirm `completionCard`'s enclosing view (the rest of `CampaignSessionView` — chat bubbles, mic button, turn recorder) is untouched by Step 4.

- [ ] **Step 6: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift ios/LearnWithAlphonso/Sources/CampaignView.swift ios/LearnWithAlphonso/Sources/ConversationView.swift
git commit -m "feat(ios): campaign/scenario pickers use AlphonsoRowCard, fix live brace-bug shapes, add campaign-complete banner"
```

---

### Task 10: Verify the remaining screens need no changes

**Files:** none modified — this task is a documented verification pass, not a no-op skipped silently. Covers `ReviewQueueView.swift`, `LeaderboardView.swift`, `AchievementsView.swift`, `SeasonView.swift`, `RootView.swift`.

The spec commits to "every already-styled screen" being redesigned under Canopy — for these five, that commitment is satisfied by already reading `AlphonsoColor`/`AlphonsoFont` generically (true for all five, confirmed while writing this plan) with no plain-text-list-row or no-imagery-hero pattern left unaddressed by design, not by an oversight. Recorded here so the spec's screen inventory has an explicit answer for each of these five, rather than a silent gap:

- [ ] **`ReviewQueueView.swift`**: single-question-at-a-time screen (no `List`/`Section`), no plain-list rows to convert. Its two `ContentUnavailableView` empty states ("All caught up"/"Queue cleared") intentionally keep the existing SF-Symbol-based pattern — per the spec's explicit decision to retint system icons rather than replace them, and per this plan's own restraint principle (mascot banners are reserved for genuine greeting/celebration moments — Auth, Paywall, Learn-tab greeting, lesson-finish, league-promotion, Hector sign-in — not blanket-applied to every routine empty state, which would dilute rather than strengthen the effect).
- [ ] **`LeaderboardView.swift`**: `LeaderboardRowView` already reads `AlphonsoColor.ink`/`.inkSoft`/`.ember`/`.surface` generically. Its `rankBadgeColor` (fixed gold/silver/bronze medal colors) and `avatarColor` (per-user HSL-seed-derived color, ported from web's exact math) are *intentionally* theme-independent — both are meaningful, non-decorative signals (medal tier; a stable per-user identity color), not part of the "plain background" pattern, and must not be retinted.
- [ ] **`AchievementsView.swift`**: `WeaknessTrendSection`'s rows already convey real status (ember "Still working on it" vs. moss "Mastered") via trailing colored text, inside a shared parchment card — this is meaningfully different from, and already better-differentiated than, the plain-text rows `AlphonsoRowCard` was built to fix elsewhere; forcing it into `AlphonsoRowCard`'s title/subtitle shape would remove the per-row status distinction for no gain. `AchievementBadgeView`'s grid tiles are already card-styled with tier coloring, not a "plain background" case either.
- [ ] **`SeasonView.swift`**: two small `Section`s, no `ForEach`/list at all — already fully generic over `AlphonsoColor`/`AlphonsoFont`, nothing to convert.
- [ ] **`RootView.swift`**: app chrome only (`TabView`, `.preferredColorScheme`) — no content to redesign. This is, however, the single place to specifically double-check during real-device verification that `.preferredColorScheme(AlphonsoThemeManager.shared.palette.colorScheme)` (line 75, reading the palette's `colorScheme` generically) resolves correctly for Canopy's `.light` value — confirmed by reading this file that the mechanism itself needs no code change, but per the spec's Real-device verification section, "verify, don't assume" still applies to the *result*, not just the code.

- [ ] **Step 1: Commit**

No files changed — nothing to commit for this task. (If a future review of this plan finds one of the five above actually does need a change, upgrade that bullet into a real task with its own diff rather than editing this verification note in place.)

---

### Task 11: `SettingsView` — fix the live brace-bug-shaped theme picker

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/SettingsView.swift`

**Interfaces:** none new — same reasoning as Task 8: this is a structural fix, not a component adoption. `ThemeSwatch` already gives each row real per-theme visual interest (a two-tone circle swatch), so it isn't the plain-text-on-background pattern `AlphonsoRowCard` targets, and `AlphonsoRowCard` has no room for a swatch + trailing checkmark anyway.

This screen is where a user actually picks Canopy — in scope per the spec's screen inventory, missed in this plan's first pass and caught here rather than left as a silent gap.

- [ ] **Step 1: Apply the named-`let` fix**

Current code (`Section { <bare ForEach> } header: { ... }` — the exact risky shape):

```swift
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(AlphonsoThemeID.allCases) { themeID in
                        Button {
                            select(themeID)
                        } label: {
                            HStack(spacing: AlphonsoSpacing.sm + 4) {
                                ThemeSwatch(themeID: themeID)
                                Text(themeID.displayName)
                                    .font(AlphonsoFont.sans(15, weight: .medium))
                                    .foregroundStyle(AlphonsoColor.ink)
                                Spacer()
                                if selectedTheme == themeID {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(AlphonsoColor.moss)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Theme")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)
```

Replace with:

```swift
    var body: some View {
        NavigationStack {
            let themeRows = ForEach(AlphonsoThemeID.allCases) { themeID in
                Button {
                    select(themeID)
                } label: {
                    HStack(spacing: AlphonsoSpacing.sm + 4) {
                        ThemeSwatch(themeID: themeID)
                        Text(themeID.displayName)
                            .font(AlphonsoFont.sans(15, weight: .medium))
                            .foregroundStyle(AlphonsoColor.ink)
                        Spacer()
                        if selectedTheme == themeID {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(AlphonsoColor.moss)
                        }
                    }
                }
            }
            List {
                Section {
                    themeRows
                } header: {
                    Text("Theme")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)
```

(The `Section`'s `.listRowBackground(AlphonsoColor.parchment)` stays — `ThemeSwatch` paints only its own small circle, not a full-row background, so the section-level parchment fill is still needed here, unlike the `AlphonsoRowCard` cases elsewhere in this plan.)

- [ ] **Step 2: Self-review**

Confirm the "Sign out" `Section` below, and everything from `.scrollContentBackground(.hidden)` onward, is unchanged. Confirm `ThemeSwatch` (the private struct at the bottom of this file) is untouched — it already reads `AlphonsoPaletteCatalog.all[themeID]` directly (not the *active* theme), which is exactly correct for a swatch that must show each theme's own colors regardless of which one is currently selected, including Canopy's once Task 1 of the foundation plan lands.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/SettingsView.swift
git commit -m "fix(ios): SettingsView theme picker avoids the Section/ForEach brace-misparse risk"
```

---

## After this plan

Every task above should be independently CI-green (`ios-app-build`) before the next. Once all eleven tasks are merged, every screen in the spec's inventory has been accounted for — `AuthView`, `PaywallView`, `LessonBrowserView`/`StatusHeaderView`/`CoursePicker` (Canopy's `.menu`-style `CoursePicker` needed no change — already fully generic, confirmed while writing Task 3), `LessonPlayerView`, `ReviewQueueView`, `LeaderboardView`, `SettingsView`, `AchievementsView`, `SeasonView`, `TeamsView`, `DuelsView`, `FriendsView`, `CampaignView`, `ConversationView`, `HectorView`, `RootView` — each either with a real diff or a recorded, reasoned "no change needed." Per the spec's recorded Verification Cadence decision, the account owner reviews the finished result on a real device via TestFlight — there is no earlier checkpoint built into this plan by design.

