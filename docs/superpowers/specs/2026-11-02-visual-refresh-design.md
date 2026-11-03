# Visual refresh: closing the gap with Learna and Duolingo

Status: draft for owner approval, 2 November 2026.

## Why

Learn with Alphonso teaches more than Learna and has a better tutor offer than Duolingo. But it looks pale, flat and empty next to both, and that costs downloads and trust. The owner's words: "their app has much better visual than ours :) thats the gap im trying to see if we can close".

The analysis behind this document is in three published pages:
- the Learna store-page comparison;
- the in-app visual gap, with mockups of Hector, Practice and Learn;
- the Duolingo comparison, with lesson-complete and Hector-invite mockups.

The mockups on those pages show the direction. They are not pixel specifications.

- Learna, store page and business: https://claude.ai/artifact/UahK8QheBDpU6utYFyj7RW
- The in-app visual gap, with the Hector, Practice and Learn mockups: https://claude.ai/artifact/9dL7zCNmjY5yeUkqNfCLkN
- Duolingo, with the lesson-complete and Hector-invite mockups: https://claude.ai/artifact/4JeygUtRcs57XB5QvUo9ra

They are private to the owner, and the agent building this can read them.

Success means a stranger who sees the new App Store screenshots, or opens the app for the first time, finds it as alive and polished as Learna or Duolingo. It should not look like a settings app with lessons in it.

## Goals

1. **Characters on screen.** Alphonso and Hector appear large, at the moments that matter, in a consistent 3D-render style.
2. **One 3D icon language.** Glossy 3D icons replace the system emoji everywhere they act as icons.
3. **Colour that tells things apart.** Topics, skills and achievements each get their own colour, so nothing is mint-on-mint any more.
4. **Screens that feel full.** No screen is mostly empty space.
5. **A physical feel.** Bigger titles, soft shadows on tappable cards, and chunky buttons with a darker bottom edge that press down.
6. **The same look on iPhone and the website**, from the same tokens and assets.

## Non-goals

- No behaviour changes. Lessons, billing, Hector's logic, sync, leagues and everything else work exactly as today. This is a look-and-layout change only.
- No new data. Use only data the app already has: XP, streak, answers in the lesson, podcast episodes, scenarios, campaigns.
- No Android work this round. Android follows later from the same assets.
- No new App Store screenshots in this project. They are the next project and are made from this build.
- No app icon change this round. A 3D-render icon comes after the pose set exists.

## Anti-goals

These would make the work a failure even if every screen looks better:
- Copying Duolingo's or Learna's growth tactics: energy limits, gems, guilt-trip notifications, weekly plans.
- Breaking accessibility: Dynamic Type, VoiceOver labels, contrast in any of the four themes, Reduced Motion.
- Breaking the tests and identifiers the release tooling relies on: UI test identifiers, App Store screenshot capture, and the Swift source guards.
- Mixing art styles: flat drawings next to 3D renders. The owner chose 3D renders on 2 November 2026.

## Decided by the owner (2 November 2026)

- **Art style:** 3D renders, like today's Alphonso and Hector images. "It will bring them to life."
- **Platforms:** iPhone and website together. Android later.
- **Poses:** the agent generates the pose set with the Higgsfield image tool, starting from today's two character images so the style matches. The owner sees and approves every pose before it goes into the app.
- **Scope:** Step 1 and Step 2 of the visual plan, plus the lesson-complete moment, as listed under Screens below.
- **Shipping:** build 53, together with web Pro (PR #339). The first App Store submission waits for it, and new screenshots are captured from it.
- **Build 53 waits for the poses.** If the poses aren't approved in time, the build and the new App Store screenshots wait. The screens are laid out for the waist-up poses, and today's two images are used only while the work is in progress.
- **Canopy is the default theme.** It already is: `resolveInitialTheme` on the web and `AlphonsoThemeManager` on iPhone both fall back to Canopy, and the pre-paint script does the same. No change is needed. The redesign is tuned first for Canopy, and the other themes get matching values.

## Constraints

- **Four themes.** Learners pick Meadow (the default: cream, Fraunces and Geist), Canopy (mint, Baloo 2 and Geist), Manuscript and Studio Ink (dark). Every theme has light and dark variants except Studio Ink, which is dark only.
  - Every new token (tile colours, button edge, shadow) needs a value for each theme and variant.
  - Every pairing must pass WCAG AA contrast (4.5:1 for text). The existing palette code shows the pattern: the contrast is computed, not eyeballed.
- **Web:**
  - Tokens are CSS-first in `src/styles.css`, on Tailwind v4.
  - There is no shared Button or Card component; the same classes are repeated in each route.
  - The `hard-shadow` and `hard-shadow-ember` utilities already give a pressed-button shadow.
- **iPhone:**
  - Tokens and components live in `ios/LearnWithAlphonso/Sources/DesignSystem/`: `AlphonsoTheme.swift`, `AlphonsoFont.swift` and `AlphonsoComponents.swift`.
  - The components are AlphonsoPrimary/SecondaryButtonStyle, AlphonsoCard, AlphonsoRowCard, AlphonsoPillBadge, AlphonsoMascotBanner and others.
  - The app target only builds in CI (`ios-app-build`). Kit code is tested in CI (`ios-swift-tests`).
- **Emoji come from content data.**
  - The data lives in `src/data/scenarios.ts` (12) and `src/data/campaigns.ts`.
  - It is exported to the iOS bundles (`scripts/export-ios-content.ts`) and to Android, and stored in `public.scenarios.emoji`.
  - Other emoji and glyphs are hard-coded in views: the Profile rows, Listen, Hector's 🎙, HectorInvite's ✨, the confidence labels, 🔊, ★ and ✓.
- **Things that must not break:**
  - UI test identifiers and labels: `firstLessonRow`, `practiceScenarioRow`, the tab labels, "Ordering Coffee", "English", "A1" and "Done".
  - The App Store screenshot capture workflow.
  - The Swift source-text guards in `src/lib/ios-*.test.ts`. They slice Swift files by type and function name, so renaming or splitting those views breaks them.
  - Colocated web route tests. Update a guard deliberately when the code it guards changes on purpose; never delete one to get green.
- **The public repo** gets no local paths and no plan ids.
- **Licences.** Microsoft Fluent Emoji is MIT licensed, so its 3D PNGs can be bundled. Generated character images belong to the owner under Higgsfield's terms.
- **Process.** TDD where there is logic (token contrast, emoji-to-asset mapping, reward-chip values). Squash-merge on green CI. No build is cut without the owner's OK.

## The design

### Tokens

Add these to both platforms, with values for each theme and variant:
- **Tile palette:** five soft tints (coral, sky, sun, lilac, mint) plus a strong ink for each, used for category tiles, skill colours and path nodes. The Meadow, Canopy and Manuscript light values start from the mockups (`#ffe1d9`, `#dcecff`, `#fff1c7`, `#ece3ff`, `#d4f5e4`). Dark variants are deeper tints that still pass contrast against `ink`.
- **Chunky button:** a darker bottom edge for each button colour (for example ember over a deeper ember). Pressed state: the button moves down by the edge height and the edge disappears. Add a light haptic on iPhone.
- **Card elevation:** a soft shadow for tappable cards, so they no longer look flat. Non-tappable surfaces stay flat.
- **Type scale:** card titles move up a step (today's 13–15 pt titles become about 17 pt). Screen titles use the display face at a larger size. Every size still scales with Dynamic Type on iPhone.

### Icons: one 3D set

- **Bundle a curated subset of Microsoft Fluent Emoji 3D:** only the icons used, as PNG at the sizes needed. Use @2x and @3x on iPhone, and the 256 px source scaled down on the web.
- **Map from emoji character to asset.**
  - The content keeps its emoji, so there is no data or database change.
  - A small renderer (`Icon3D` on web, an equivalent view on iPhone) shows the 3D asset for a known emoji and falls back to the plain emoji text otherwise.
  - The mapping is one shared JSON file, used by both platforms the way the content exports already work.
- **Use it for:**
  - scenario and campaign icons;
  - Profile rows;
  - Listen;
  - the streak, hearts and XP pills;
  - achievement badges (where the glyph key maps cleanly);
  - Hector's mic and sparkle;
  - the lesson-complete chips.
- **Keep plain glyphs for:** the close ✕, the check ✓ and the speaker 🔊. These are controls and stay as SF Symbols or SVG.
- **Accessibility:** icons stay decorative, so VoiceOver reads the text label as it does today.

### Characters: the pose set

- **Eight poses for each character:** happy, proud or celebrating, thinking, surprised, sad or encouraging, waving, listening, talking.
  - The poses keep today's look: Alphonso in his blue-and-gold robe and sunglasses, Hector in his goggles and jacket.
  - Each pose is a waist-up 3D render on a transparent or plain background, so it sits on any theme.
- **Process:**
  1. The agent generates two or three candidates per pose with Higgsfield, using today's image as the reference.
  2. The owner approves one per pose on a review page.
  3. The approved poses are cut out, sized and bundled.
- **Cost:** about 2–3 Higgsfield credits per image. Sixteen poses with retries comes to roughly 100–150 credits. The account has 0 credits today, so the owner needs to top up first.
- **Until the poses are approved,** every screen uses today's two images, so the code work is never blocked on art.
- **A single pose lookup chooses which pose a moment uses:** for example, lesson complete is Alphonso proud, a lost streak is Alphonso encouraging, and Hector while he speaks is talking.

### Screens

Each screen keeps its current behaviour, data and test identifiers.

**Step 1**
1. **Hector (iPhone `HectorView.swift`, web `hector.tsx`)**
   - Hector's art fills the top of the screen across its full width and fades into the background.
   - A status pill shows "Listening", "Thinking" or "Speaking" from the existing voice state.
   - A language pill.
   - The conversation appears as captions under the art, both sides.
   - A larger mic button with a soft glow ring.
   - Keep the paywall and HectorInvite flows as they are, restyled.
2. **Practice (iPhone `ConversationView.swift` and `CampaignView.swift`, web `converse.tsx`)**
   - The campaign becomes a hero card: a dark gradient, its 3D icon and a progress bar from the existing campaign progress.
   - Scenarios become a two-column tile grid, each tile in a tile colour with its 3D icon, title and one-line description.
   - Tile colours are assigned by a fixed rule (scenario index or a per-scenario mapping), so a scenario keeps its colour.
3. **Shared components on both platforms**
   - Chunky primary and secondary buttons.
   - Elevated cards.
   - 3D pill badges for streak, hearts and XP.
   - The bigger type scale.
   - On the web this means introducing shared `Button` and `Card` components in `src/components/` and moving the routes on these screens onto them.

**Step 2**

4. **Learn home (iPhone `LessonBrowserView.swift` and `StatusHeaderView.swift`, web `learn.tsx`)**
   - 3D stat pills.
   - An Alphonso greeting card using a pose, with the existing streak message.
   - One loud "Continue" card for the next lesson.
   - The lesson's steps (vocabulary, practice, review) shown as a short path of coloured nodes. Done steps are filled, the next is highlighted, and the rest are locked.
   - The goal card and the weekly challenges are restyled with tile colours.
5. **Lesson overview (the "Begin lesson" screen: iPhone `LessonBrowserView.swift`, web `lesson.$id.tsx`)**
   - Fill the screen: the lesson title large, a pose or a large 3D icon, the three steps as coloured cards, and a chunky "Begin lesson" button.
6. **Lesson complete (iPhone `FinishView` and `OfflineFinishView` in `LessonPlayerView.swift`, web `FinishScreen` in `lesson.$id.tsx`)**
   - Alphonso proud, large.
   - The existing finish copy.
   - Three reward chips: XP earned, streak, and accuracy (from the answers in this lesson).
   - A chunky Continue button.
   - A secondary "Practise with Hector" button. It opens Hector for Pro learners and the existing paywall otherwise, using the same entry and attribution as today's Hector invites.
   - The offline variant keeps its "saved, will sync" message.
7. **Listen (iPhone `ListenView.swift`, web `listen.tsx`)**
   - Larger episode rows with cover art (a 3D icon on a tile colour where no art exists), a bigger mini-player, and an Alphonso empty state.
8. **Profile and achievements (iPhone `ProfileHubView.swift` and `AchievementsView.swift`, web `profile.tsx`)**
   - Rows become large cards with 3D icons and tile colours.
   - Achievements use 3D icons on coloured badges. Locked ones are grey.
9. **Big-number progress**
   - Where a screen shows totals that exist today (words saved, lessons done, minutes listened), show them as big numbers with a 3D icon.
   - Only data the app already has. If a number isn't tracked, it isn't shown.

### Motion

- Keep it small: the button press, a gentle entrance for the lesson-complete chips, and a slow pulse on Hector's status dot while he listens.
- Everything respects Reduced Motion, using the existing `SpringEntrance` and `PulsingGlow` modifiers.

## Calls made by the agent (owner can overrule)

- **Base branch: main.**
  - The iPhone Hector screen exists on main and is restyled there.
  - The web Hector page (`hector.tsx`) and the web side of the lesson-complete "Practise with Hector" button only exist in PR #339. They are restyled in a follow-up PR on top of #339, or after #339 merges, so no other visual PR waits on #339.
- **Learn home path.** The nodes are the lessons of the learner's current unit, not the steps inside one lesson. Lessons already completed are filled (from the existing completion data), the next lesson is highlighted, and later lessons are locked. No new stored data.
- **Web goes live step by step.** The web deploys from main when a PR merges, and this work changes no behaviour, so each step reaches web learners when it merges. There is no feature flag. The iPhone gets everything in build 53.
- **Hector status pill.** It shows only the states both platforms already know (for example "Listening" while recording, "Speaking" while his reply plays). If a "Thinking" state doesn't already exist, the pill leaves it out rather than adding new state.
- **Dark themes and Studio Ink.** Tiles use deep tints with light text. Light themes use pale tints with dark text. Both directions are checked by the contrast tests.

## What is left to the builder

- **Exact spacing, radii and shadow values**, within the direction of the mockups.
- **The colour and tint values for each theme**, as long as they pass the contrast checks.
- **How the Fluent subset is stored and named,** and how the shared emoji-to-asset mapping is generated.
- **Whether a screen's layout change** is a restyle of the existing SwiftUI or React view or a split into smaller views. Prefer restyling over renaming, because the source guards slice by name; where a split is cleaner, update the guards in the same change.
- **The order of work within a step and how it is split into PRs.** One PR per step is the default.
- **How the pose review page is presented** to the owner.

## Verification

- **Unit tests** cover:
  - contrast for every new token pairing in every theme;
  - the emoji-to-asset mapping and its fallback;
  - the reward-chip values;
  - the pose lookup.
- **Existing tests stay green.** Web route tests, e2e accessibility and fonts tests, Kit tests, the iOS UI tests (identifiers unchanged) and the Swift source guards, updated only where the guarded code changed on purpose.
- **Visual check.**
  - Web: Playwright screenshots of each changed screen in all four themes, at phone and desktop widths.
  - iPhone: the CI screenshot capture of each changed screen, reviewed against the mockups before handing over.
- **Owner check on build 53 in TestFlight** before new App Store screenshots are captured.

## Open questions for the owner

See the handover message. This document is updated with the answers.
