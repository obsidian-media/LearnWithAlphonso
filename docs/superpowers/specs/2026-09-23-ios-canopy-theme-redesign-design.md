# iOS "Canopy" theme redesign — design

**Status:** Approved by account owner via brainstorming (2026-09-23), ready for
implementation planning.

## Background

The account owner's brief was, verbatim: "im not very happy with how it does
look right now." Brainstorming (using the visual companion) resolved this
into a concrete scope:

- **Genuine redesign**, not a rough-edges polish pass.
- **iOS only**, for now — web is untouched.
- Concrete complaint, in the account owner's own words: the app is "too
  basic and too much like a book and wordish." This echoes an existing
  real-user quote already in `StatusHeaderView.swift`'s doc comment: the
  app "feels like an empty piece of background with some written knowledge
  on it."
- Desired direction: "playful and gamelike... duolingo-ish energy
  mascot-forward but not cartoonish... should feel alive and exciting to
  open."
- **The mascot art already exists and already matches this direction** —
  `Assets.xcassets`' `Alphonso.imageset`/`Hector.imageset` are real,
  semi-photorealistic character portraits (an alpaca in a cape, a llama in
  AR goggles in a library) that the account owner generated and provided
  directly. The problem is that almost nothing on screen uses them —
  `PaywallView.swift`, the screen used as the concrete before/after example
  during brainstorming, is an SF Symbol sparkles icon and plain text on a
  flat background, with zero imagery.
- Three visual directions were mocked in the browser-based brainstorming
  companion (real Hector art, three palettes) against the paywall screen:
  "Expedition" (sky blue/orange), "Arcade" (violet/gold, dark), "Canopy"
  (emerald/coral, light). **Canopy was selected**, then validated against
  two more real screens (Learn tab home, sign-in) and confirmed as the
  right direction — with the explicit caveat that the quick mockups
  themselves need real polish, not that the direction is wrong.
- Screen scope: **every already-styled screen** (~17 SwiftUI views), not a
  phased high-impact-only subset — the account owner explicitly chose "every
  screen, one pass" over starting with a smaller high-impact subset.
- Execution: the account owner asked for this to proceed **autonomously**
  from here — no further per-section check-ins during design, and
  (pending this spec's approval and the resulting plan's approval, per this
  project's own brainstorming process) autonomous implementation.

## Goals

1. Ship a fourth iOS theme, **Canopy**, that reads as playful/game-like and
   mascot-forward rather than literary — without touching web or the
   existing three themes' tokens.
2. Make Canopy the new default theme on iOS (see "Rollout" below for exactly
   who this affects).
3. Redesign every already-styled screen under Canopy so the whole app —
   not just the paywall — stops reading as "an empty piece of background
   with some written knowledge on it."
4. Do this without regressing Meadow, Studio Ink, or Manuscript, and without
   breaking web's handling of the `profiles.theme` column.

## Non-goals

- No changes to web (`src/styles.css`, `src/design-tokens/`, web's own UI)
  beyond the minimal shared-schema touch described under "Rollout."
- No changes to Meadow/Studio Ink/Manuscript's own tokens, screens, or
  behavior — they must remain exactly as they are today, selectable in
  Settings.
- No new mascot artwork — Alphonso and Hector's existing portraits are the
  asset, this is about using them, not commissioning new ones. (New
  *supporting* illustration/decoration, if any turns out to be needed for a
  specific screen during implementation, is a small in-scope detail, not a
  new art-commissioning effort.)
- No change to the liveliness/animation *system* itself (`SpringEntrance`,
  `PulsingGlow`) — Canopy reuses it, retinted, rather than replacing it.

## Design

### Color tokens

Following the same pattern as Meadow/Studio Ink/Manuscript: colors are
**computed** (a standard OKLab conversion from a chosen sRGB/hex target),
not eyeballed, and expressed as `oklch(...)` in both `AlphonsoPalette`
(iOS) and — since this is iOS-only — nowhere in `styles.css`. The specific
oklch triples should be computed at implementation time the same way the
existing themes were; the target colors validated during brainstorming are:

| Token | Role | Target (validated in mockups) |
|---|---|---|
| `surface` | screen background | near-white, faint green cast (`#F7FBF9`-ish) |
| `parchment` (card/row fill) | section/card backgrounds | pale mint (`#EAF5EF`-ish, matches the validated mockups exactly) |
| `ink` | primary text | deep forest green-black (`#173328`-ish) |
| `inkSoft` | secondary text | muted sage (`#4B6B5E`-ish) |
| `moss` (primary accent) | buttons, links, tint, active states | emerald (`#1F9D70`-ish) |
| `mossDeep` | `.hard-shadow` underlay for primary buttons | darker emerald (`#157A57`-ish) |
| `ember` (secondary accent) | CTA highlight, streak flame, league badges | coral (`#FF6F59`-ish) |
| `emberSoft` | soft coral backgrounds/badges | pale coral tint |
| `hairline` | borders | `ink` at existing ~10% opacity, same pattern as other themes |
| `destructive` | errors | unchanged — shared across all themes already |

**Contrast is a hard requirement, not a nice-to-have**: every text/background
pairing above must meet at least the same contrast bar the existing three
themes already meet (verify via computed lightness, same rigor as the
existing oklch-based system — this is not optional polish).

### Typography

The existing three themes all pair a **serif display font** with a sans
body font (Fraunces/Geist, Instrument Serif/Instrument Sans,
Newsreader/Source Sans 3) — this serif-display pattern is itself a real
contributor to the "too much like a book" complaint. **Canopy drops the
serif entirely**: a rounded, friendly sans for display (headlines, large
numerals like the streak count), and reuses **Geist** (already bundled for
Meadow, avoids a redundant font dependency) for body text.

Recommended display font: **Baloo 2** (Google Fonts, OFL-licensed, rounded
and warm without being a novelty/childish typeface) — bundled and resolved
the same way as every other theme's fonts (`Sources/Fonts/*.ttf`, CoreText
`kCTFontVariationAttribute` resolution via `AlphonsoFont.swift`, `Info.plist`
`UIAppFonts` registration). Confirm the OFL license and variable-font
availability at implementation time before bundling, same diligence as the
existing three font pairs; if Baloo 2 turns out not to ship a usable
variable instance, fall back to a comparable rounded OFL sans (e.g. Fredoka)
rather than blocking on this specific choice.

### New shared components

Built once in `AlphonsoComponents.swift`/`DesignSystem/`, reused across
screens rather than redesigned per-screen:

- **Illustrated mascot banner** — Alphonso or Hector portrait + a short
  line of copy on a gradient/color card. Replaces the current pattern of
  "plain text, no imagery" on the paywall, auth, and Learn-tab-home hero
  spots, and is available for empty states elsewhere.
- **Row card** — replaces plain `List` text rows (lesson units, review
  queue items, etc.) with a rounded card row (colored status dot/icon +
  title + subtitle), addressing the "empty piece of background" complaint
  app-wide, not just the three screens mocked during brainstorming.
- **Canopy button styles** — coral primary CTA, emerald secondary, same
  `.hard-shadow` pressed-effect mechanics as existing button styles, just
  retinted.
- `SpringEntrance`/`PulsingGlow` are reused as-is; `PulsingGlow`'s accent
  may retint to Canopy's coral where it's used against Canopy screens, no
  change to the modifier itself.

### Screen inventory (all in scope)

Design-system foundation (not a "screen," but required first):
`AlphonsoTheme.swift` (new `AlphonsoThemeID.canopy` case), `AlphonsoPalette`
(new computed values), `AlphonsoFont.swift` (Baloo 2 registration/
resolution), `AlphonsoThemeManager` (new default, see Rollout), new font
files under `Sources/Fonts/`, `Info.plist` `UIAppFonts` entry, new shared
components above.

All ~17 already-styled views get restyled under Canopy: `AuthView`,
`PaywallView`, `LessonBrowserView` (+ `StatusHeaderView`, `CoursePicker`),
`LessonPlayerView`, `ReviewQueueView`, `LeaderboardView`, `SettingsView`,
`AchievementsView`, `SeasonView`, `TeamsView`, `DuelsView`, `FriendsView`,
`CampaignView`, `ConversationView`, `HectorView`, `RootView` (nav chrome).
Because `AlphonsoColor`'s members are already computed properties reading
the active theme's palette (not fixed constants), most of these need no
call-site changes for *color* — the real per-screen work is (a) adopting
the new row-card/banner components where the current layout is
plain-text-on-background, and (b) verifying Canopy's new fonts/contrast
look right on that specific screen, not re-deriving colors.

**Sequencing is an implementation-planning concern, not a scope one** —
scope is "every screen," but `writing-plans` should still phase the actual
build (foundation → shared components → highest-visibility screens → the
rest), mirroring how this project's own prior big passes (the original
iOS design system, item 7's gamification systems) shipped as multiple
ordered, separately-verified PRs rather than one giant unreviewable commit.

### Rollout & persistence

Canopy becomes the new default via `AlphonsoThemeManager`'s
`UserDefaults`-backed default. Concretely: **any user with no explicit
locally-stored theme preference** — every fresh install, and any existing
user who has never opened the theme picker in `SettingsView` — sees Canopy.
Any user who has explicitly picked a theme (Meadow, Studio Ink, Manuscript,
or Canopy itself once it exists) keeps their own pick; this redesign must
not silently override an explicit user choice.

Backend touch (required even though this is visually iOS-only, since
`profiles.theme` is a shared column): add `canopy` to the Postgres `CHECK`
constraint via a new migration (same drop-and-re-add pattern as
`supabase/migrations/20260918140000_add_manuscript_theme.sql`), and add it
to the Zod enum in `leaderboard.functions.ts`'s `updateProfile`, following
`ARCHITECTURE.md`'s own documented rule that both must be updated together.
Web's `THEME_NAMES`/`theme.ts` do **not** need a matching CSS block — an
unrecognized-by-web theme value already falls back safely to Meadow
(`resolveInitialTheme` only trusts values in `THEME_NAMES`), so this is a
data-validation-only change, not a web UI change.

### Real-device verification

This project has a documented, repeated history of CI passing while a real
device looks broken (dark-mode illegibility, a stretched `Divider()`, a
clipped `.segmented` picker — see `docs/BACKLOG.md` §1.5 items 11/12/13).
This redesign touches **every screen** and **adds a new font**, which is
strictly more surface area for exactly that class of bug. Required, not
optional: `.preferredColorScheme` must resolve correctly for Canopy (a
light theme) via the existing `RootView` mechanism — verify this isn't
accidentally broken, don't assume it "just works" because the mechanism is
generic. Every screen must be checked on a real device (TestFlight, same
pattern as prior passes) before being called done — a Simulator screenshot
is better than nothing but has already proven insufficient in this exact
project. Given the scope (every screen), plan for this verification to
happen in phases alongside the phased implementation, not as one giant
device-testing pass at the very end.

### Testing

- Any pure palette/token logic that can be unit-tested without UIKit
  (mirroring the Kit's existing Windows-testable pattern via
  `swift-test.ps1`) should be.
- `ios-app-build` CI must pass for every PR in this effort — it's the only
  real compile verification available (no local Xcode/macOS).
- Real-device TestFlight verification per screen, per the section above —
  this is the verification step CI cannot substitute for.

## Risks / open items for implementation to resolve, not re-litigate

- Confirm Baloo 2's exact OFL variable-font availability before bundling;
  fall back to a comparable rounded OFL sans if it doesn't ship one, per
  the Typography section above.
- Exact oklch values are computed at implementation time (OKLab conversion
  from the validated target colors), not re-decided.
- No collision expected with the parallel `english-content-overhaul`
  worktree (that session touches `src/data/lesson-bank.ts`/`curriculum.ts`/
  `bank-engine.ts`; this touches `ios/` and, minimally, the shared theme
  migration + `leaderboard.functions.ts`) — if a shared file does come up
  unexpectedly, coordinate through the account owner rather than assuming
  no conflict, per the original kickoff doc's own instruction.
