# Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the iPhone app and the website a loud, illustrated, full look:
- 3D characters;
- 3D icons;
- a colour per topic;
- tiles;
- chunky buttons.

No behaviour changes come with it.

**Architecture:** New design values live in shared JSON files under `src/design-tokens/` and `src/data/`:
- tile tones;
- button edges;
- emoji-to-3D-icon mapping;
- mascot moments.

Generator scripts turn them into web CSS and Swift, and vitest freshness guards keep both sides in step. Pure logic lives in the Kit (iPhone) and `src/lib` (web), and both are tested:
- contrast;
- icon lookup;
- pose choice;
- tile tone;
- unit path;
- reward chips;
- Hector status label.

The screens are then restyled on top of these pieces.

**Tech Stack:**
- Web: TanStack Start, React 19, Tailwind v4 (CSS-first `src/styles.css`), vitest (`bunx vitest` in Git Bash), Playwright, and `sharp` (already a dependency).
- iPhone: SwiftUI with XcodeGen. The app target builds only in CI (`ios-app-build`). The Kit is tested in CI (`ios-swift-tests`), because local `swift test` is blocked by Windows Application Control.

**Spec:** `docs/superpowers/specs/2026-11-02-visual-refresh-design.md`

## Global Constraints

- **No behaviour changes.** Lessons, billing, Hector logic, sync and leagues are untouched.
  - The only additions are a "Practise with Hector" button on lesson complete (it uses the existing paywall and Hector flows) and one new paywall source value, `lesson_complete`.
- **No new stored data.** Every number shown already exists in the app.
- **Four themes** (meadow, canopy, manuscript, studio-ink):
  - On iPhone, meadow, canopy and manuscript also have dark variants. Studio Ink is dark only.
  - On the web, only studio-ink is dark.
  - Every new colour pairing passes WCAG AA, 4.5:1 for text.
- **Canopy is already the default theme.** Don't touch the theme fallback.
- **Keep these UI test identifiers and labels:** `firstLessonRow`, `practiceScenarioRow`, `practiceHectorCard`, `hectorHandsFreeToggle`, `hectorHandsFreePause`, `paywallClose`, the tab labels, "Ordering Coffee", "English", "A1", "Done" and "Begin lesson".
- **Keep the Swift type and function names** that the guards in `src/lib/ios-*.test.ts` slice by. If a guard has to change because the guarded code changed on purpose, update it in the same commit. Never delete a guard.
- **Accessibility:** 3D icons and mascot art are decorative (`accessibilityHidden(true)` on iPhone, `alt=""` on the web), and the text labels stay. Dynamic Type sizes stay (`AlphonsoFont` scales). All motion respects Reduced Motion.
- **Keep the plain glyphs** ✕, ✓ and 🔊 as controls (SF Symbols or SVG).
- **Licences:** Fluent Emoji is MIT. Commit its LICENSE next to the vendored PNGs.
- **Public repo:** no local paths and no plan ids in code or commits.
- **Git:** squash-merge on green CI. No build is cut without the owner's OK. Build 53 waits for approved poses and for PR #339.
- **PRs:**
  - PR A: Step 1, Tasks 1–7.
  - PR B: Step 2, Tasks 8–11.
  - PR C: web Hector, Task 12, on #339.
  - Task 13: the final check of the whole branch.
  - The art (Tasks 5a and 5b) goes in whichever PR is open when it's approved.

## Review Focus

1. **The offline lesson finish.** It has no server progress, so it has no streak. Its reward chips must leave out the streak chip rather than show 0. Tested in Task 10.
2. **A lesson with no questions** (`total == 0`). There's no accuracy chip, and nothing divides by zero. Tested in Task 10.
3. **An emoji with or without the U+FE0F variation selector**, such as "⭐️" vs "⭐" or "⚙️" vs "⚙". It must find the same 3D icon. An unknown emoji falls back to the text emoji, never a blank. Tested in Task 2.
4. **A pose that isn't bundled yet.** The art must fall back to the base mascot image, never a missing-image box. Tested in Task 4.
5. **A unit whose lessons were completed out of order.** "Next" is the first lesson not yet done, and done lessons after it still show as done. A unit that is fully done has no "next". Tested in Task 8.

---

### Task 1: Tile tones and button edges, shared across platforms

**Files:**
- Create: `src/design-tokens/tile-tones.json`
- Create: `scripts/export-design-tokens.ts`
- Generated: `src/styles/tile-tones.generated.css`
- Generated: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTileTones.generated.swift`
- Modify: `src/styles.css` (import the generated CSS)
- Test: `src/lib/tile-tones.test.ts`

**Interfaces:**
- Produces, JSON shape: `{ tones: ["coral","sky","sun","lilac","mint"], palettes: { "<paletteKey>": { "<tone>": { bg: "#rrggbb", ink: "#rrggbb" }, edge: { moss: "#rrggbb", ember: "#rrggbb" }, surface: "#rrggbb" } } }`.
  - The paletteKeys are `meadow`, `meadow-dark`, `canopy`, `canopy-dark`, `manuscript`, `manuscript-dark` and `studio-ink`.
  - `surface` is copied from the existing palette (iPhone `AlphonsoPaletteCatalog`) and is used only by the contrast test.
- Produces, web CSS variables per `[data-theme]` (plus `:root` for meadow): `--tile-<tone>-bg`, `--tile-<tone>-ink`, `--edge-moss` and `--edge-ember`. Register them in `@theme inline` as `--color-tile-<tone>-bg` etc., so Tailwind classes like `bg-tile-coral-bg` work.
- Produces, Swift: `enum AlphonsoTileTone: String, CaseIterable { case coral, sky, sun, lilac, mint }`, with `var background: Color` and `var ink: Color` that resolve from `AlphonsoThemeManager.shared` (theme plus dark). Also `AlphonsoColor.edgeMoss` and `AlphonsoColor.edgeEmber`.
- Produces, the tone rule: web `tileTone(index: number): TileTone` in `src/lib/tile-tones.ts`, and the Kit `TileTone.forIndex(_ index: Int) -> String` in `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/TileTone.swift`. It returns `tones[index % 5]`, and a negative index is treated as 0.

- [ ] **Step 1: Write the failing tests** in `src/lib/tile-tones.test.ts`:
  - `"every tone's ink reads on its bg at 4.5:1 or more in every palette"`: loop over palettes × tones, `expect(contrast(p[t].ink, p[t].bg)).toBeGreaterThanOrEqual(4.5)`. Write the WCAG relative-luminance `contrast(hexA, hexB)` helper in the test file.
  - `"tile bg is distinguishable from the surface"`: for each palette and tone, `contrast(bg, surface) >= 1.15` (tinted, not invisible).
  - `"all seven palettes and five tones exist"`.
  - `"generated CSS and Swift are up to date"`: import the generator's pure `renderCss(json)` and `renderSwift(json)` and compare them with the committed files' contents.
  - `"tileTone cycles"`: `tileTone(0)=="coral"`, `tileTone(4)=="mint"`, `tileTone(5)=="coral"`, `tileTone(7)=="sun"`, `tileTone(-1)=="coral"`.
- [ ] **Step 2: Run** `bunx vitest run src/lib/tile-tones.test.ts`. Expected: FAIL (the module and JSON don't exist).
- [ ] **Step 3: Write `tile-tones.json`.**
  - Light themes start from the mockups: coral `#ffe1d9`, sky `#dcecff`, sun `#fff1c7`, lilac `#ece3ff`, mint `#d4f5e4`, with dark inks of the same hue.
  - Dark palettes use deep tints with light inks.
  - Edges: `moss` = each palette's mossDeep, and `ember` = a darker ember. For meadow the ember edge is `oklch(0.5 0.15 40)`, converted to hex.
- [ ] **Step 4: Write `scripts/export-design-tokens.ts`.** It exports pure `renderCss` and `renderSwift`, and a `main` that writes both files. Run it with `bun scripts/export-design-tokens.ts`. Add `@import "./styles/tile-tones.generated.css";` to `src/styles.css`, plus the `@theme inline` registrations.
- [ ] **Step 5: Add the Kit `TileTone.forIndex`** and the test `TileToneTests.testCycles`, with the same vectors as the web test.
- [ ] **Step 6: Run** `bunx vitest run src/lib/tile-tones.test.ts` (expected: PASS), then `bunx tsc --noEmit` (expected: clean).
- [ ] **Step 7: Commit:** `feat(design): shared tile tones and button edges for all themes`.

### Task 2: One 3D icon set (Fluent Emoji), with emoji-to-icon lookup

**Files:**
- Create: `assets/fluent-3d/LICENSE` (MIT, copied from microsoft/fluentui-emoji)
- Create: `assets/fluent-3d/source/<slug>.png` (the 256 px 3D PNGs, only the emoji used)
- Create: `src/data/icon3d.json`
- Create: `scripts/build-icon3d.ts`
- Generated: `public/icons3d/<slug>.png` (128 px)
- Generated: `ios/LearnWithAlphonso/Sources/Assets.xcassets/Icon3D/<slug>.imageset/` (@2x 96 px, @3x 144 px, plus `Contents.json`), and a folder `Contents.json` with `"provides-namespace": true`
- Generated: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/icon3d.json`
- Create: `src/lib/icon3d.ts`
- Create: `src/components/Icon3D.tsx`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Icon3DCatalog.swift`
- Create: `ios/LearnWithAlphonso/Sources/DesignSystem/Icon3DView.swift`
- Test: `src/lib/icon3d.test.ts`
- Test: `src/components/Icon3D.test.tsx`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Icon3DCatalogTests.swift`

**Interfaces:**
- Produces:
  - `icon3d.json` = `{ "<emoji>": "<slug>" }`, with keys stored without U+FE0F.
  - Web `icon3dSlug(emoji: string): string | null` strips U+FE0F, then looks the emoji up.
  - Web `<Icon3D emoji={string} size={number} className? />` renders `<img src="/icons3d/<slug>.png" alt="" width height>` for a known emoji, and `<span aria-hidden>{emoji}</span>` otherwise.
  - Kit `Icon3DCatalog.assetName(for emoji: String) -> String?` returns `"Icon3D/<slug>"` or nil.
  - App `Icon3DView(emoji: String, size: CGFloat)` shows `Image(assetName)` or falls back to `Text(emoji)`, and is accessibility-hidden.
- The emoji to cover are:
  - every `emoji` in `src/data/scenarios.ts` and `src/data/campaigns.ts`;
  - the Profile rows 🏆 👥 ⭐ ⚙;
  - Listen 📁 🎧;
  - Hector ✨ 🎙;
  - the stat pills 🔥 ❤ ⚡ ⭐;
  - the lesson-complete chips ⭐ 🔥 🎯;
  - the Learn path 📚 🎯 🏆 🔒;
  - one emoji for each achievement glyph key in `src/data/achievements.ts`.

  Put that last mapping in `src/data/icon3d-achievements.json` as `{ "<glyphKey>": "<emoji>" }`. It is exported to the Kit too, for iPhone `achievements.json` glyphs, and resolved through `icon3dSlug`.

- [ ] **Step 1: Write the failing tests** in `src/lib/icon3d.test.ts`:
  - `"every scenario and campaign emoji has a 3D icon"`: loop the data files, `expect(icon3dSlug(e)).not.toBeNull()`.
  - `"FE0F and bare forms resolve the same"`: `icon3dSlug("⭐️") === icon3dSlug("⭐")`, and the same for `"⚙️"` and `"⚙"`.
  - `"unknown emoji gives null"`: `icon3dSlug("🦄🦄") === null`.
  - `"every slug has a web PNG and an iOS imageset"`: `fs.existsSync` for both paths.
  - `"every achievement glyph key maps to a known icon"`.
  - `"Kit copy of icon3d.json equals the source"`.
- [ ] **Step 2: Write the component test** in `src/components/Icon3D.test.tsx`. A known emoji renders an `img` with `alt=""` and the right `src`; an unknown one renders the emoji text.
- [ ] **Step 3: Run** `bunx vitest run src/lib/icon3d.test.ts src/components/Icon3D.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Vendor the PNGs** from `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/<Name>/3D/<name>_3d.png`. Write `scripts/build-icon3d.ts`: it uses sharp to resize, writes the imagesets and `Contents.json`, and copies both JSON files into the Kit resources. Run it.
- [ ] **Step 5: Implement `icon3d.ts`, `Icon3D.tsx`, `Icon3DCatalog.swift` and `Icon3DView.swift`.** The Kit catalog loads `icon3d.json` from `Bundle.module`, the same way the Kit loads its other resources.
- [ ] **Step 6: Write the Kit tests** `Icon3DCatalogTests`, covering a known emoji, the FE0F variant, an unknown emoji, and every key in the JSON resolving.
- [ ] **Step 7: Run** `bunx vitest run src/lib/icon3d.test.ts src/components/Icon3D.test.tsx`. Expected: PASS.
- [ ] **Step 8: Commit:** `feat(design): 3D icon set with emoji lookup on web and iPhone`.

### Task 3: Chunky buttons, elevated cards, tiles and pills (shared components)

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/TileCard.tsx`
- Create: `src/components/ui/StatPill.tsx`
- Modify: `src/styles.css` (add a `card-lift` utility: a soft shadow, plus a hover/active lift)
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and Task 2 `Icon3D`/`Icon3DView`.
- Produces, web:
  - `<Button variant="primary"|"ember"|"secondary" fullWidth? ...buttonProps>`: chunky, a 4px bottom edge from `--edge-moss` or `--edge-ember`, and `active:translate-y-1` with the edge removed.
  - `<Card elevated? as?>`.
  - `<TileCard tone={TileTone} icon={emoji} title subtitle? onClick?|href?>`.
  - `<StatPill emoji value label>`: `label` is used for `aria-label`.
- Produces, iPhone:
  - Restyle `AlphonsoPrimaryButtonStyle` and `AlphonsoSecondaryButtonStyle` in place. Keep their names and shorthands. They get the bottom edge (`AlphonsoColor.edgeMoss` or `edgeEmber`), press offset and edge collapse, and a light haptic (`.sensoryFeedback(.impact(weight: .light), trigger:)`).
  - Add `AlphonsoCard(elevated: Bool = false)` (shadow when elevated).
  - New `AlphonsoTile(tone: AlphonsoTileTone, emoji: String, title: String, subtitle: String?)`.
  - `AlphonsoPillBadge` gets an optional `emoji:` that renders `Icon3DView` in place of text.
  - `AlphonsoRowCard`'s title goes from its current size to 17, and its leading emoji renders through `Icon3DView(size: 36)`.

- [ ] **Step 1: Write the failing tests** in `src/components/ui/ui.test.tsx`:
  - `"Button ember uses the ember edge"`: the class contains `edge-ember`.
  - `"Button is a real button with type=button by default"`.
  - `"TileCard applies the tone background and renders Icon3D"`.
  - `"StatPill exposes its label to screen readers and hides the icon"`.
- [ ] **Step 2: Run** `bunx vitest run src/components/ui/ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the web components and the iPhone component changes.**
- [ ] **Step 4: Run** `bunx vitest run src/components/ui/ui.test.tsx` (expected: PASS), then the full `bunx vitest run` (expected: green apart from tests that assert old classes; fix those only where the restyle is intended).
- [ ] **Step 5: Commit:** `feat(design): chunky buttons, elevated cards, tiles and 3D pills`.

### Task 4: Mascot moments and pose lookup

**Files:**
- Create: `src/data/mascot-moments.json`
- Create: `src/data/mascot-poses-available.json` (starts as `[]`)
- Create: `src/lib/mascot-poses.ts`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/MascotPoses.swift`
- Copy: both JSON files to the Kit Resources (extend `scripts/build-icon3d.ts`, or the token exporter, so one script copies all shared JSON)
- Modify: `src/components/MascotBanner.tsx`
- Modify: the `AlphonsoMascotBanner` and `AlphonsoMascot` enum in `AlphonsoComponents.swift`
- Test: `src/lib/mascot-poses.test.ts`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/MascotPosesTests.swift`

**Interfaces:**
- Poses: `happy`, `proud`, `thinking`, `surprised`, `encouraging`, `waving`, `listening`, `talking`.
- Moments, as moment → { mascot, pose }:
  - `learnGreeting` → alphonso/waving
  - `lessonComplete` → alphonso/proud
  - `lessonCompleteOffline` → alphonso/happy
  - `leaguePromotion` → alphonso/proud
  - `emptyState` → alphonso/thinking
  - `streakEncourage` → alphonso/encouraging
  - `campaignComplete` → alphonso/proud
  - `authWelcome` → alphonso/waving
  - `hectorIdle` → hector/happy
  - `hectorListening` → hector/listening
  - `hectorSpeaking` → hector/talking
  - `hectorThinking` → hector/thinking
  - `paywall` → hector/waving
- Produces, web: `mascotArt(moment: MascotMoment): { src: string; mascot: "alphonso"|"hector" }`. It returns `/mascots/<mascot>-<pose>.png` when `"<mascot>-<pose>"` is in the available list, otherwise `/mascots/<mascot>.png`.
- Produces, Kit: `MascotPoseCatalog.art(for moment: MascotMoment, available: Set<String>) -> (mascot: String, assetName: String)`. The asset name is `"<Mascot>-<pose>"` (for example `Alphonso-proud`) when available, otherwise `"Alphonso"` or `"Hector"`. In the app, `available` comes from the Kit-bundled `mascot-poses-available.json`.
- `MascotBanner` and `AlphonsoMascotBanner` gain an optional `moment` parameter. Without one they behave as today.

- [ ] **Step 1: Write the failing tests:**
  - `"lessonComplete is Alphonso proud"`.
  - `"a pose not in the available list falls back to the base image"`: with available `[]`, `mascotArt("lessonComplete").src === "/mascots/alphonso.png"`.
  - `"an available pose is used"`.
  - `"every moment names a known mascot and pose"`.
  - `"every available pose has its web PNG and iOS imageset"`.
  - `"Kit copies equal the sources"`.
  - Add the Kit mirror tests in `MascotPosesTests`.
- [ ] **Step 2: Run** `bunx vitest run src/lib/mascot-poses.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the web and Kit lookup, and the banner parameter.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): mascot moments with pose fallback`.

### Task 5a: Generate the pose set (art; needs the owner)

This task has no code. It is gated on the owner's Higgsfield trial or credits.

- [ ] **Step 1: Make a trial batch.** Upload `ios/LearnWithAlphonso/Sources/Assets.xcassets/Alphonso.imageset/Alphonso.png` and `Hector.imageset/Hector.png` with `media_upload`. Generate 2 poses per character (proud, waving), 2 variants each, with `nano_banana_pro` at 1:1, 2k. Each prompt names the pose, says "same character, identical 3D render style, same outfit, waist-up, plain light background", and passes the reference image as `image_references`.
- [ ] **Step 2: Show the trial batch** to the owner on a private review page next to the originals. Continue only if the owner says the character matches.
- [ ] **Step 3: Generate the remaining poses** (8 per character in all), 2–3 variants each. Stay within the trial's 100 credits unless the owner says otherwise.
- [ ] **Step 4: Owner picks one variant per pose** on the review page. Record the chosen job ids in the ledger.

### Task 5b: Import the approved poses

**Files:**
- Create: `scripts/import-mascot-poses.ts`
- Generated: `public/mascots/<mascot>-<pose>.png` (512 px)
- Generated: `ios/LearnWithAlphonso/Sources/Assets.xcassets/<Mascot>-<pose>.imageset/` (@2x, @3x)
- Modify: `src/data/mascot-poses-available.json`
- Test: Task 4's `"every available pose has its web PNG and iOS imageset"` now runs against real entries.

- [ ] **Step 1: Write the import script.** It reads a local folder of the approved PNGs named `<mascot>-<pose>.png`, removes a plain background where the model didn't give transparency (sharp trim, then a flood-fill alpha on a near-uniform background), squares and resizes the images, writes both platforms, and updates the available list.
- [ ] **Step 2: Run** the import script, then `bunx vitest run src/lib/mascot-poses.test.ts`. Expected: PASS, with the new entries.
- [ ] **Step 3: Commit:** `feat(design): approved 3D poses for Alphonso and Hector`.

### Task 6: Hector screen on iPhone

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/HectorView.swift`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/HectorStatus.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/HectorStatusTests.swift`

**Interfaces:**
- Consumes: Task 4 `MascotPoseCatalog` and Task 3 components.
- Produces: `HectorStatus.from(handsFree: HandsFreeLoop.Status, isRecording: Bool, isBusy: Bool) -> HectorStatus?`, where `HectorStatus` is `.listening` or `.thinking` or `.speaking`, with a `label` ("Listening", "Thinking", "Speaking") and a `moment` (hectorListening, hectorThinking, hectorSpeaking).
  - `.listening` covers recording, or hands-free `.listening`/`.hearing`.
  - `.thinking` is `isBusy` while not recording. Read `VoiceSession.isBusy` to confirm it means a request or reply is in flight. If it doesn't, drop `.thinking`, and record a Ruling.
  - `.speaking` is only if an existing reply-playback flag exists. If not, leave it out and record a Ruling.
  - Otherwise nil, and the art uses `hectorIdle`.

- [ ] **Step 1: Write the failing Kit tests**, one per mapping row, plus "off and idle gives nil".
- [ ] **Step 2: Implement `HectorStatus`.**
- [ ] **Step 3: Restyle `HectorConversationView` and its empty state:**
  - Mascot art across the full width at the top, about 45% of the screen height. It fades into `AlphonsoColor.surface` and changes with `HectorStatus.moment`.
  - A status pill and a language pill over the art.
  - The turns as caption bubbles below it, using the existing `bubble(for:)`, restyled. The 26 pt avatar is removed.
  - The mic button at 64 pt with `PulsingGlow` while listening.
  - The hands-free controls keep their identifiers and copy.
  - Keep `AssistantReply(... isOpener: false ...)` exactly, because `ios-ai-consent-guard.test.ts` checks it.
- [ ] **Step 4: Run** `bunx vitest run src/lib/ios-ai-consent-guard.test.ts src/lib/ios-voice-guards.test.ts src/lib/ios-screen-behaviour-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ios): Hector screen with full 3D art and live status`.

### Task 7: Practice as tiles (web and iPhone)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ConversationView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/CampaignView.swift` (`CampaignPickerSection`)
- Modify: `src/routes/_authenticated/converse.tsx`
- Test: `src/routes/_authenticated/converse.test.tsx` (extend it)

**Interfaces:**
- Consumes:
  - `TileTone.forIndex` / `tileTone`, where the index is the scenario's position in the course's scenario list;
  - `AlphonsoTile` / `TileCard`;
  - `Icon3D`.

- [ ] **Step 1: Write the failing web tests:**
  - `"scenarios render as tiles with tones in list order"`: the first tile has `data-tone="coral"` and the sixth has `data-tone="coral"`.
  - `"campaign renders as a hero card with its progress"`, using the existing campaign progress value.
  - `"scenario tile icons are 3D images"`.
- [ ] **Step 2: Run** `bunx vitest run src/routes/_authenticated/converse.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Web: a 2-column grid of `TileCard`, and the campaign as a gradient hero `Card` with `Icon3D` and a progress bar.
  - iPhone: replace the `List` rows with a `LazyVGrid` of 2 flexible columns inside a `ScrollView`. Keep `practiceScenarioRow` on each tile, `practiceHectorCard` on the Hector card (restyled as a wide tile), and the existing navigation destinations and sheets.
- [ ] **Step 4: Run** `bunx vitest run src/routes/_authenticated/converse.test.tsx src/lib/ios-ai-consent-guard.test.ts src/lib/ios-learning-flow-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): Practice as colour tiles with a campaign hero card`.

**End of Step 1:** run the full `bunx vitest run` and `bunx tsc --noEmit`, open PR A, and wait for green CI, including `ios-app-build` and `ios-swift-tests`. Then run `capture-app-store-screenshots.yml` from the branch, and read every PNG against the mockups before asking the owner to merge.

### Task 8: Learn home (web and iPhone)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/UnitPath.swift`
- Create: `src/lib/unit-path.ts`
- Modify: `ios/LearnWithAlphonso/Sources/StatusHeaderView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/LessonBrowserView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/GoalCardView.swift`
- Modify: `src/routes/_authenticated/learn.tsx`
- Modify: `src/components/AppShell.tsx` (stat pills)
- Modify: `src/components/GoalCard.tsx`
- Modify: `src/components/WeeklyChallengesCard.tsx`
- Test: `src/lib/unit-path.test.ts`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/UnitPathTests.swift`
- Test: extend `src/routes/_authenticated/learn.test.tsx`

**Interfaces:**
- Produces:
  - `unitPathNodes(lessonIds: string[], completed: Set<string>, max = 5): { id: string; state: "done"|"next"|"locked" }[]`
  - Kit `UnitPath.nodes(lessonIDs: [String], completed: Set<String>, max: Int = 5) -> [UnitPathNode]`
- The rules:
  - "next" is the first id not in `completed`.
  - Ids in `completed` are "done", wherever they sit.
  - The rest are "locked".
  - The window holds `max` nodes, starting up to 2 before "next".
  - If every lesson is done, there's no "next" and the window shows the last `max` lessons.
- The data is the current unit's lessons and the completed set the screens already use: web `completedSet` in `learn.tsx`, and the iPhone equivalent in `LessonBrowserView`.

- [ ] **Step 1: Write the failing tests** in `unit-path.test.ts`, plus the Kit mirror:
  - `"none done: first is next, rest locked"`.
  - `"out of order: next is first undone, later done stay done"`: with lessons `[a,b,c,d]` and completed `{a,c}`, the states are `[done,next,done,locked]`.
  - `"all done: no next"`.
  - `"window is max nodes around next"`.
- [ ] **Step 2: Run** `bunx vitest run src/lib/unit-path.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the lookups, then restyle:**
  - 3D `StatPill`s for 🔥, ❤ and ⭐ (or ⚡ for XP, matching today's icon meaning), so the iPhone no longer uses SF Symbols here;
  - an Alphonso greeting card (`moment: learnGreeting`) with the existing streak message;
  - one ember "Continue" card for the next lesson, opening what the next-lesson row opens today;
  - the path of coloured nodes with 3D icons (📚 for done, 🎯 for next, 🔒 for locked);
  - the goal and challenges cards with tile tones.
  - Keep `firstLessonRow` on the element that opens the first lesson today.
- [ ] **Step 4: Run** `bunx vitest run src/lib/unit-path.test.ts src/routes/_authenticated/learn.test.tsx src/components`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): Learn home with greeting, Continue card and unit path`.

### Task 9: Lesson overview (web and iPhone)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift` (`OverviewScreen`)
- Modify: `src/routes/_authenticated/lesson.$id.tsx` (the overview phase, near "Begin lesson")
- Test: extend `src/routes/_authenticated/lesson.$id.test.tsx`

- [ ] **Step 1: Write the failing web test:** `"overview shows the three steps as coloured cards and a chunky Begin lesson button"`. Assert that the step cards carry `data-tone` and that the "Begin lesson" button is the shared `Button`.
- [ ] **Step 2: Run** `bunx vitest run 'src/routes/_authenticated/lesson.$id.test.tsx'`. Expected: FAIL.
- [ ] **Step 3: Implement the layout.** Large title, a mascot (`moment: emptyState` is fine; use thinking), the step cards in tones coral, sky and mint, and a full-width `.alphonsoPrimary` / `Button`. The button keeps the "Begin lesson" text.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): fuller lesson overview`.

### Task 10: Lesson complete, with reward chips and "Practise with Hector"

**Files:**
- Create: `src/lib/lesson-rewards.ts`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/LessonRewards.swift`
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PaywallPresentation.swift` (add `case lessonComplete = "lesson_complete"`)
- Modify: `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift` (`FinishView`, `OfflineFinishView`)
- Modify: `src/routes/_authenticated/lesson.$id.tsx` (`FinishScreen`)
- Test: `src/lib/lesson-rewards.test.ts`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/LessonRewardsTests.swift`
- Test: extend `src/routes/_authenticated/lesson.$id.finishscreen.test.tsx`

**Interfaces:**
- Produces:
  - `lessonRewardChips({ xp, streak, correct, total }: { xp: number; streak: number | null; correct: number; total: number }): { kind: "xp"|"streak"|"accuracy"; value: string; emoji: string }[]`
  - Kit `LessonRewards.chips(xp: Int, streak: Int?, correct: Int, total: Int) -> [LessonRewardChip]`
- The chips:
  - XP is always present: `"+<xp>"` with ⭐.
  - Streak is present only when `streak` is non-null and above 0: `"<n>"` with 🔥.
  - Accuracy is present only when `total > 0`: `"<round(correct/total*100)>%"` with 🎯.
- Where the values come from:
  - iPhone `FinishView` passes `result.progress.streak`.
  - `OfflineFinishView` passes nil.
  - Web `FinishScreen` passes `useProgress((s) => s.streak)` and does not add a new prop source.
- "Practise with Hector" on iPhone, in both finish views:
  - For non-Pro learners (`entitlementStore.isPro == false`), present `PaywallView(entitlementStore:, source: .lessonComplete, onClose:)` as a sheet, the same way `ConversationView` does for its card.
  - For Pro learners, present `HectorView` in a sheet, with the same dependencies `RootView` passes to the Hector tab. Thread `entitlementStore` and those dependencies into `LessonPlayerView` from its caller.
- "Practise with Hector" on the web: not in this task, because the web Hector page only exists in #339 (see Task 12).

- [ ] **Step 1: Write the failing tests:**
  - `"xp, streak and accuracy chips"`: xp 20, streak 12, correct 11, total 12 gives `["+20","12","92%"]`.
  - `"offline: no streak chip"`: a null streak gives the xp and accuracy chips only.
  - `"zero streak: no streak chip"`.
  - `"no questions: no accuracy chip, no NaN"`.
  - Add the Kit mirror tests, plus `"lessonComplete paywall source raw value is lesson_complete"`.
- [ ] **Step 2: Run** `bunx vitest run src/lib/lesson-rewards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the chips and restyle the finish screens:**
  - the large Alphonso art (`lessonComplete`, or `lessonCompleteOffline`);
  - the existing headline copy (`LessonFinishCopy`) and the existing hearts-bonus and achievements lines;
  - the chips with a `SpringEntrance` stagger, skipped under Reduced Motion;
  - a chunky Continue button that keeps the existing next-lesson action;
  - the secondary Hector button, iPhone only;
  - the offline "saved, will sync" message, unchanged.
- [ ] **Step 4: Run** `bunx vitest run src/lib/lesson-rewards.test.ts 'src/routes/_authenticated/lesson.$id.finishscreen.test.tsx' src/lib/ios-learning-flow-guards.test.ts src/lib/ios-subscription-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): lesson-complete moment with reward chips and Hector`.

### Task 11: Listen, Profile, achievements and big numbers (web and iPhone)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ListenView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/ProfileHubView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/AchievementsView.swift`
- Modify: `src/routes/_authenticated/listen.tsx`
- Modify: `src/routes/_authenticated/profile.tsx`
- Modify: `src/components/AchievementBadge.tsx`
- Modify: `src/components/PodcastPlayer.tsx` (mini-player size only)
- Test: extend `listen.test.tsx`, `profile.test.tsx` and `AchievementBadge.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `"profile rows are tiles with 3D icons"`.
  - `"achievement badge shows the 3D icon for its glyph and greys when locked"`.
  - `"listen episode rows use a tone tile when there is no cover art"`.
  - `"empty listen state shows Alphonso"`.
- [ ] **Step 2: Run** `bunx vitest run src/routes/_authenticated/listen.test.tsx src/routes/_authenticated/profile.test.tsx src/components/AchievementBadge.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Big numbers: list the totals these screens already show or already have in their stores, such as words saved, lessons done and minutes listened. Show each one that exists as a big number with a 3D icon. Record any that don't exist as a Ruling ("not shown, not tracked").
  - Keep `subtitle(for: player.resumed(episode))` in `ListenView.swift` (`ios-screen-behaviour-guards`), and the podcast guard regexes.
- [ ] **Step 4: Run** the step 2 command, plus `bunx vitest run src/lib/ios-screen-behaviour-guards.test.ts src/lib/ios-podcast-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(design): Listen, Profile and achievements in the new look`.

**End of Step 2:** run the full `bunx vitest run`, `bunx tsc --noEmit` and the e2e `accessibility` and `fonts` specs. Open PR B and wait for green CI. Run the screenshot capture and read every PNG.

### Task 12: Web Hector page, and the web "Practise with Hector" button (on top of PR #339)

**Files:**
- Modify: `src/routes/_authenticated/hector.tsx`
- Modify: `src/components/HectorInvite.tsx`
- Modify: `src/routes/_authenticated/lesson.$id.tsx` (`FinishScreen`)
- Modify: `src/lib/paywall-copy.ts`, or wherever `isPaywallSource` lives in #339 (add `"lesson_complete"`)
- Create: `src/lib/hector-status.ts`
- Test: extend `hector.test.tsx` and the finish-screen test
- Test: `src/lib/hector-status.test.ts`

**Interfaces:**
- Produces: `hectorStatus({ recording, sending, speaking }): "listening"|"thinking"|"speaking"|null`. Use only the flags the web page already has, and record a Ruling for any that are missing.

- [ ] **Step 1: Branch from `feat/web-hector-pro`,** or from main if #339 has merged. Run `git fetch` first.
- [ ] **Step 2: Write the failing tests:**
  - `"hector page shows the mascot art and status pill"`.
  - `"lesson complete shows Practise with Hector, which opens /hector for Pro and the paywall with source lesson_complete otherwise"`.
  - `"isPaywallSource accepts lesson_complete"`.
- [ ] **Step 3: Run** `bunx vitest run src/routes/_authenticated/hector.test.tsx src/lib/hector-status.test.ts 'src/routes/_authenticated/lesson.$id.finishscreen.test.tsx'`. Expected: FAIL.
- [ ] **Step 4: Implement,** mirroring Task 6 and the Task 10 button.
- [ ] **Step 5: Run** the same command. Expected: PASS. Commit `feat(web): Hector page and lesson-complete Hector button in the new look`, and open PR C against #339's branch (or main).

### Task 13: Visual check of the whole branch

**Files:**
- Create: `e2e/visual-refresh.spec.ts` (screenshots only, no assertions on pixels)

- [ ] **Step 1: Write a Playwright spec.** Sign in with the existing signed-in e2e setup. For each theme in `["canopy","meadow","manuscript","studio-ink"]` (set through `localStorage.theme`), and at widths 390 and 1280, capture learn, converse, lesson overview, lesson finish (reach it with the existing lesson e2e path or a test route if the existing tests do this), listen and profile into `test-results/visual-refresh/`.
- [ ] **Step 2: Run** `bunx playwright test e2e/visual-refresh.spec.ts`. Expected: it passes and writes the PNGs.
- [ ] **Step 3: Read every PNG.** Look for overflow, unreadable text in each theme, and missing icons. Fix what's broken in one pass, with a test for anything that was logic.
- [ ] **Step 4: Publish a private review page** with the web and iPhone screenshots next to the mockups, for the owner.
- [ ] **Step 5: Commit:** `test(e2e): visual refresh screenshot sweep`.
