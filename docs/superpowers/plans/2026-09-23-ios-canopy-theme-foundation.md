# iOS Canopy Theme — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth iOS theme, "Canopy" (emerald/coral, mascot-forward), as the new default, with the color/font tokens and shared components every screen in the follow-up screen-rollout plan will build on.

**Architecture:** Extend the existing per-theme catalog pattern in `DesignSystem/AlphonsoTheme.swift` (one more `AlphonsoThemeID` case, one more `AlphonsoPaletteCatalog.all` entry) rather than inventing new machinery — `AlphonsoColor`/`AlphonsoFont`/every screen already read the *active* theme generically, so adding a catalog entry is what makes Canopy exist app-wide with zero screen-level color changes. The one real architectural addition is two new per-theme tokens, `onPrimary`/`onAccent`, because `AlphonsoPrimaryButtonStyle` currently hardcodes its label color in a way that only happens to work for the existing three themes (see spec's "Color tokens" section for the contrast math).

**Tech Stack:** SwiftUI, UIKit (CoreText font-variation resolution), XcodeGen (project.yml → generated `.xcodeproj`, not committed), Postgres/Supabase migrations, TypeScript/Zod (web).

**Spec:** `docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md`

## Global Constraints

- Meadow, Studio Ink, and Manuscript's own rendered output must not change at all — every task that touches a shared file (`AlphonsoTheme.swift`, `AlphonsoComponents.swift`) must leave their existing catalog entries and call sites byte-for-byte equivalent in behavior.
- Canopy's locked token values (see spec's "Color tokens" table) are final — do not re-derive or eyeball substitute values.
- **No local Xcode/macOS is available in this environment.** Every file under `ios/LearnWithAlphonso/Sources/` (the app target) imports `SwiftUI`/`UIKit`, which cannot be compiled or tested outside Apple tooling — `ios-app-build` in `.github/workflows/ci.yml` (a macOS GitHub Actions runner) is the *only* compile verification available for any task in this plan that touches those files. Tasks touching `src/` (web/TypeScript) or `supabase/migrations/` *can* be verified locally (`bun run test`, `bun run lint`) — use that where it applies, and say plainly "CI is the verification gate" where it doesn't. Do not fabricate a local test-run step for UIKit-dependent code.
- Per the spec's explicit, recorded decision: no interim real-device checkpoint. Every task should still commit independently and leave the branch in a state CI can verify.
- `AlphonsoPaletteCatalog` and its properties are `internal` (no explicit `public`), matching the existing file — don't widen access unnecessarily.

## Review Focus

- **A user who has never opened Settings** (no `UserDefaults` key, no synced `profiles.theme`) must see Canopy, not Meadow, on both a fresh install and an existing install that upgrades to this build — this is the actual default-change behavior, not just "Canopy exists as an option." Task 4's steps must exercise this exact path.
- **A user who explicitly picked Meadow/Studio Ink/Manuscript before this ships** must keep seeing their own pick after upgrading — the default change must never override an already-persisted `UserDefaults` value. Also exercised in Task 4.
- **An unrecognized theme string reaching the Zod schema** (e.g. a future bad value, or a stale client) must still be rejected the same way it is today — Task 5's schema change must add `"canopy"` without loosening the validation to accept arbitrary strings.
- **The Postgres migration must be reversible/re-runnable the same way the existing theme migrations are** (drop-and-re-add the unnamed check constraint) — a naive `ADD CONSTRAINT` without dropping the old one first will fail outright against the existing `profiles_theme_check`, not silently do the wrong thing, but Task 5 must still follow the established pattern exactly rather than improvising a different one.
- **A button using the new `foreground:` parameter's default** (i.e. every *existing* call site that doesn't pass one) must render pixel-identical to today — Task 2 changes a widely-used shared style, and the failure mode of getting this wrong is silent: nothing crashes, Meadow/Studio Ink/Manuscript buttons just render with the wrong text color. Task 2's steps must explicitly re-check every existing call site's resolved color, not just the new Canopy math.

---

### Task 1: Add the Canopy theme ID and palette

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift`

**Interfaces:**
- Consumes: nothing new — extends the existing `AlphonsoThemeID` enum and `AlphonsoPaletteCatalog.all` dictionary.
- Produces: `AlphonsoThemeID.canopy` (raw value `"canopy"`, matching the Postgres/Zod value added in Task 5), and a full `AlphonsoPalette` entry for it. Task 2 consumes `AlphonsoPalette.onPrimary`/`.onAccent` added here. Task 4 consumes `AlphonsoThemeID.canopy` as the new default case.

- [ ] **Step 1: Add the `canopy` case and display name**

In `AlphonsoThemeID`, add the case and switch arm:

```swift
public enum AlphonsoThemeID: String, CaseIterable, Identifiable, Sendable {
    case meadow
    case studioInk = "studio-ink"
    case manuscript
    case canopy

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .meadow: return "Meadow"
        case .studioInk: return "Studio Ink"
        case .manuscript: return "Manuscript"
        case .canopy: return "Canopy"
        }
    }
}
```

`CaseIterable` means `SettingsView.swift`'s `ForEach(AlphonsoThemeID.allCases)` picks this up automatically — no change needed there.

- [ ] **Step 2: Add `onPrimary`/`onAccent` to `AlphonsoPalette` and backfill the existing three catalog entries**

Add the two new fields to the struct (after `hairline`, before `colorScheme` — cosmetic ordering, keep it readable):

```swift
public struct AlphonsoPalette: Sendable {
    public let surface: Color
    public let parchment: Color
    public let ink: Color
    public let inkSoft: Color
    public let moss: Color
    public let mossDeep: Color
    public let ember: Color
    public let emberSoft: Color
    public let destructive: Color
    public let hairline: Color
    /// Text/label color to render on top of a `moss`-filled surface
    /// (e.g. `AlphonsoPrimaryButtonStyle`'s default tint). Equals
    /// `surface` for every theme where moss/ember are dark/saturated
    /// enough for light text to read clearly -- which is every theme
    /// except where a specific theme's accent is deliberately bright
    /// (see `onAccent`, and the design spec's contrast math for why
    /// these two tokens exist instead of one shared one).
    public let onPrimary: Color
    /// Text/label color to render on top of an `ember`-filled surface
    /// (`.alphonsoEmber` button usage). Distinct from `onPrimary`
    /// because a theme's `moss` and `ember` are not guaranteed to need
    /// the same contrast direction -- Canopy's bright coral `ember`
    /// needs dark text while its dark emerald `moss` needs light text.
    public let onAccent: Color
    public let colorScheme: ColorScheme

    public let displayFontBaseName: String
    public let displayFontOpszRange: ClosedRange<CGFloat>?
    public let sansFontBaseName: String
}
```

Then add `onPrimary: surface` and `onAccent: surface` to each of the three existing entries (`.meadow`, `.studioInk`, `.manuscript`) in `AlphonsoPaletteCatalog.all` — this exactly reproduces their current hardcoded-`.surface` button-text behavior, so their rendered output does not change. For example, Meadow's entry becomes:

```swift
        .meadow: AlphonsoPalette(
            surface: Color(hex: 0xF5_F0_E8),
            parchment: Color(hex: 0xED_E4_D8),
            ink: Color(hex: 0x11_24_18),
            inkSoft: Color(hex: 0x43_51_47),
            moss: Color(hex: 0x2F_62_43),
            mossDeep: Color(hex: 0x15_3C_25),
            ember: Color(hex: 0xD7_59_28),
            emberSoft: Color(hex: 0xF6_CF_B0),
            destructive: Color(hex: 0xE7_00_0B),
            hairline: Color(hex: 0x11_24_18, opacity: 0.1),
            onPrimary: Color(hex: 0xF5_F0_E8),
            onAccent: Color(hex: 0xF5_F0_E8),
            colorScheme: .light,
            displayFontBaseName: "Fraunces-Regular",
            displayFontOpszRange: 9...144,
            sansFontBaseName: "Geist-Regular"
        ),
```

(`onPrimary`/`onAccent` both equal that theme's own `surface` hex literal — copy the same hex already used for that entry's `surface:` line, don't reference `Color(hex: 0xF5_F0_E8)` via a variable, to match this file's existing style of fully-literal per-entry tables.) Apply the same pattern to `.studioInk` (`0x0B_0D_12`) and `.manuscript` (`0xF3_F5_F8`).

- [ ] **Step 3: Add the Canopy catalog entry**

These are the final, locked, contrast-verified values from the spec — do not adjust:

```swift
        .canopy: AlphonsoPalette(
            surface: Color(hex: 0xEF_FA_F4),
            parchment: Color(hex: 0xDC_F3_E8),
            ink: Color(hex: 0x05_26_1A),
            inkSoft: Color(hex: 0x40_60_52),
            moss: Color(hex: 0x0C_69_44),
            mossDeep: Color(hex: 0x13_3F_2B),
            ember: Color(hex: 0xE4_57_3F),
            emberSoft: Color(hex: 0xFD_D3_CA),
            destructive: Color(hex: 0xE7_00_0B),
            hairline: Color(hex: 0x05_26_1A, opacity: 0.1),
            onPrimary: Color(hex: 0xEF_FA_F4),
            onAccent: Color(hex: 0x05_26_1A),
            colorScheme: .light,
            displayFontBaseName: "Baloo2-Regular",
            displayFontOpszRange: nil,
            sansFontBaseName: "Geist-Regular"
        ),
```

Note `sansFontBaseName: "Geist-Regular"` — Canopy deliberately reuses Meadow's already-bundled Geist rather than bundling a second sans font (see spec's Typography section).

- [ ] **Step 4: Self-review the diff**

No compiler is available locally. Read back the full modified `AlphonsoTheme.swift` and check by eye:
- `AlphonsoPaletteCatalog.all` has exactly 4 entries (`.meadow`, `.studioInk`, `.manuscript`, `.canopy`), each with all 15 `AlphonsoPalette` fields (the struct now has 15 stored properties after Step 2) — a missing field is a compile error CI will catch, but check now rather than waiting on a CI round trip.
- Meadow/Studio Ink/Manuscript's `onPrimary`/`onAccent` values are each that same entry's own `surface` hex, not Canopy's or each other's.
- `.canopy`'s raw value is exactly `"canopy"` (used verbatim in Task 4 and must match Task 5's Postgres/Zod value exactly).

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift
git commit -m "feat(ios): add Canopy theme ID and palette"
```

---

### Task 2: Parameterize button-label color (`onPrimary`/`onAccent`)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`

**Interfaces:**
- Consumes: `AlphonsoPalette.onPrimary`/`.onAccent` (Task 1) via new `AlphonsoColor.onPrimary`/`.onAccent` computed properties (added here, same pattern as every other `AlphonsoColor` member).
- Produces: `AlphonsoPrimaryButtonStyle(tint:shadow:foreground:fullWidth:)` — existing call sites (`.alphonsoPrimary`, `.alphonsoEmber`, `.alphonsoPrimary(fullWidth:)`) keep compiling unchanged since `foreground` defaults.

- [ ] **Step 1: Add `onPrimary`/`onAccent` to `AlphonsoColor`**

In `AlphonsoTheme.swift`'s `AlphonsoColor` enum (same file as Task 1 — this could be folded into Task 1, but it's kept separate here since it's conceptually part of "make the button style parameterizable," not "define the palette"):

```swift
public enum AlphonsoColor {
    public static var surface: Color { AlphonsoThemeManager.shared.palette.surface }
    public static var parchment: Color { AlphonsoThemeManager.shared.palette.parchment }
    public static var ink: Color { AlphonsoThemeManager.shared.palette.ink }
    public static var inkSoft: Color { AlphonsoThemeManager.shared.palette.inkSoft }
    public static var moss: Color { AlphonsoThemeManager.shared.palette.moss }
    public static var mossDeep: Color { AlphonsoThemeManager.shared.palette.mossDeep }
    public static var ember: Color { AlphonsoThemeManager.shared.palette.ember }
    public static var emberSoft: Color { AlphonsoThemeManager.shared.palette.emberSoft }
    public static var destructive: Color { AlphonsoThemeManager.shared.palette.destructive }
    public static var hairline: Color { AlphonsoThemeManager.shared.palette.hairline }
    public static var onPrimary: Color { AlphonsoThemeManager.shared.palette.onPrimary }
    public static var onAccent: Color { AlphonsoThemeManager.shared.palette.onAccent }
}
```

- [ ] **Step 2: Add a `foreground` parameter to `AlphonsoPrimaryButtonStyle`**

In `AlphonsoComponents.swift`:

```swift
struct AlphonsoPrimaryButtonStyle: ButtonStyle {
    var tint: Color = AlphonsoColor.moss
    var shadow: Color = AlphonsoColor.mossDeep
    var foreground: Color = AlphonsoColor.surface
    /// false for inline/chip usage (e.g. a word-bank token) where the
    /// button should size to its label instead of filling its container.
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AlphonsoFont.sans(17, weight: .semiBold))
            .foregroundStyle(foreground)
            .padding(.vertical, AlphonsoSpacing.sm + 2)
            .padding(.horizontal, AlphonsoSpacing.lg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(
                LinearGradient(colors: [tint, shadow], startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
            )
            .offset(y: configuration.isPressed ? 4 : 0)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                    .fill(shadow)
                    .offset(y: configuration.isPressed ? 0 : 4)
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
```

(Only the `foreground` field and the `.foregroundStyle(foreground)` line changed — everything else in this struct is unchanged from today.)

- [ ] **Step 3: Wire the two static extensions to the theme-resolved tokens**

```swift
extension ButtonStyle where Self == AlphonsoPrimaryButtonStyle {
    static var alphonsoPrimary: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary)
    }
    static var alphonsoEmber: AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(tint: AlphonsoColor.ember, shadow: AlphonsoColor.ember.opacity(0.65), foreground: AlphonsoColor.onAccent)
    }
    static func alphonsoPrimary(fullWidth: Bool) -> AlphonsoPrimaryButtonStyle {
        AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary, fullWidth: fullWidth)
    }
}
```

- [ ] **Step 4: Self-review — confirm zero behavior change for the existing three themes**

Read back the diff. For Meadow/Studio Ink/Manuscript, `onPrimary` and `onAccent` were both set to that theme's own `surface` hex in Task 1 Step 2 — so `AlphonsoColor.onPrimary`/`.onAccent` resolve to exactly what `AlphonsoColor.surface` already resolved to for those three themes today. Every existing call site of `.alphonsoPrimary`/`.alphonsoEmber`/`.alphonsoPrimary(fullWidth:)` therefore renders identically to before this change for Meadow/Studio Ink/Manuscript. For Canopy, `alphonsoPrimary` (tint defaults to `AlphonsoColor.moss`, i.e. Canopy's dark emerald) now correctly pairs with light `onPrimary` text, and `alphonsoEmber` (Canopy's bright coral) correctly pairs with dark `onAccent` text — this is the fix from the spec's contrast finding.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift
git commit -m "feat(ios): parameterize primary-button label color via onPrimary/onAccent"
```

---

### Task 3: Bundle and register the Baloo 2 font

**Files:**
- Create: `ios/LearnWithAlphonso/Sources/Fonts/Baloo2-Variable.ttf` (already downloaded during spec verification — real, OFL-1.1-licensed, from `google/fonts`' `ofl/baloo2/Baloo2[wght].ttf`; currently untracked in the worktree, not yet committed)
- Create: `ios/LearnWithAlphonso/Sources/Fonts/Baloo2-OFL.txt` (same source, its license file; also already present, untracked)
- Modify: `ios/LearnWithAlphonso/Info.plist`

**Interfaces:**
- Consumes: nothing.
- Produces: the `"Baloo2-Regular"` PostScript name that Task 1's Canopy catalog entry already references as `displayFontBaseName`. `AlphonsoFont.swift` needs zero changes — it already resolves any theme's display font generically via `kCTFontVariationAttribute`.

- [ ] **Step 1: Confirm the font files are present and correct**

```bash
ls -la ios/LearnWithAlphonso/Sources/Fonts/Baloo2-Variable.ttf ios/LearnWithAlphonso/Sources/Fonts/Baloo2-OFL.txt
```

Expected: both files exist (683,200 bytes for the `.ttf`, matching `google/fonts`' reported size exactly; the `.txt` starts with "Copyright 2019 The Baloo 2 Project Authors"). If either is missing (e.g. a fresh worktree that didn't inherit the spec-verification download), re-fetch:

```bash
curl -sL --max-time 30 -o ios/LearnWithAlphonso/Sources/Fonts/Baloo2-Variable.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf"
curl -sL --max-time 30 -o ios/LearnWithAlphonso/Sources/Fonts/Baloo2-OFL.txt "https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/OFL.txt"
```

No `project.yml` change is needed — `Sources/Fonts/` is already covered by the `Application` target's `sources: - path: Sources`, and XcodeGen treats non-Swift files under a `sources:` path as Copy Bundle Resources automatically (same mechanism the other five bundled fonts already use).

- [ ] **Step 2: Register the font in `Info.plist`**

Add one entry to the existing `UIAppFonts` array (alphabetical-ish position matching the file's existing order isn't required, but keep it adjacent to the other font entries for readability):

```xml
	<key>UIAppFonts</key>
	<array>
		<string>Fraunces-Variable.ttf</string>
		<string>Geist-Variable.ttf</string>
		<string>InstrumentSerif-Regular.ttf</string>
		<string>InstrumentSans-Variable.ttf</string>
		<string>Newsreader-Variable.ttf</string>
		<string>SourceSans3-Variable.ttf</string>
		<string>Baloo2-Variable.ttf</string>
	</array>
```

- [ ] **Step 3: Self-review**

Confirm the added filename (`Baloo2-Variable.ttf`) exactly matches the file created in Step 1 (case-sensitive — iOS font registration fails silently/falls back to system font on a mismatch, per `AlphonsoFont.swift`'s own `resolvedVariant` fallback path, which would make Canopy silently render in the system font with no compile error to catch it). Confirm Task 1's `displayFontBaseName: "Baloo2-Regular"` is the PostScript *name* (from the font's internal `name` table, verified via `fontTools` during spec work), not the *filename* (`Baloo2-Variable.ttf`) — these are deliberately different strings, matching how every other theme's entry already works (e.g. Meadow's `displayFontBaseName: "Fraunces-Regular"` vs. its file `Fraunces-Variable.ttf`).

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/Fonts/Baloo2-Variable.ttf ios/LearnWithAlphonso/Sources/Fonts/Baloo2-OFL.txt ios/LearnWithAlphonso/Info.plist
git commit -m "feat(ios): bundle and register Baloo 2 (Canopy's display font)"
```

---

### Task 4: Make Canopy the new default theme

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift` (`AlphonsoThemeManager`)

**Interfaces:**
- Consumes: `AlphonsoThemeID.canopy` (Task 1).
- Produces: no new public API — same `AlphonsoThemeManager.shared` singleton, same `setTheme`/`hydrate` methods, just a different fallback default.

- [ ] **Step 1: Change the default in `AlphonsoThemeManager.init`**

Current code:

```swift
    private init() {
        if let saved = UserDefaults.standard.string(forKey: Self.storageKey),
           let id = AlphonsoThemeID(rawValue: saved) {
            themeID = id
        } else {
            themeID = .meadow
        }
    }
```

Change the fallback branch only:

```swift
    private init() {
        if let saved = UserDefaults.standard.string(forKey: Self.storageKey),
           let id = AlphonsoThemeID(rawValue: saved) {
            themeID = id
        } else {
            themeID = .canopy
        }
    }
```

This is the entire behavior change: `UserDefaults` already wins whenever it holds a valid saved value (an explicit prior pick, from any theme including a previously-selected Canopy), so this only affects installs/accounts with no stored `alphonsoLocal` theme key at all — exactly the "no explicit preference" case the spec's Rollout section describes. No change to `setTheme`/`hydrate` — server-value-wins-when-present-and-valid is unaffected by this default.

- [ ] **Step 2: Self-review against the two Review Focus scenarios**

Trace both by hand against the diff (no local way to actually run this):
- Fresh install, or an existing install that has never called `setTheme` (no `"alphonso.theme"` key in `UserDefaults`): `init` hits the `else` branch → `themeID = .canopy`. Correct.
- An existing user who previously picked, say, Studio Ink (`UserDefaults` holds `"studio-ink"`): `AlphonsoThemeID(rawValue: "studio-ink")` succeeds → `themeID = .studioInk`, the `else` branch is never reached. Correct — their explicit pick is preserved.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift
git commit -m "feat(ios): make Canopy the default theme for installs with no saved preference"
```

---

### Task 5: Backend — allow `canopy` in `profiles.theme`

**Files:**
- Create: `supabase/migrations/20260923000000_add_canopy_theme.sql`
- Modify: `src/lib/leaderboard.functions.ts`
- Test: `src/lib/leaderboard.functions.test.ts` (existing file — already has a mocked `createServerFn` harness that runs `updateProfile`'s real inline Zod validator; extend it rather than adding a new file) and `src/lib/theme.test.ts` (existing file — extend for the web-fallback assertion).

**Interfaces:**
- Consumes: `"canopy"` as a literal string (must exactly match `AlphonsoThemeID.canopy`'s raw value from Task 1, and is never added to web's own `THEME_NAMES`/`isThemeName` — see the note in Step 2).
- Produces: `profiles.theme` accepts `'canopy'` at the database level (required for iOS's direct PostgREST `PATCH` to succeed, per `ProgressSyncClient+Profile.swift`'s existing `updateProfileTheme`).

- [ ] **Step 1: Write the migration**

Follow the exact drop-and-re-add pattern `20260918140000_add_manuscript_theme.sql` already established (the constraint is unnamed at the SQL level but Postgres auto-names it `profiles_theme_check`):

```sql
-- Adds 'canopy' (iOS-only theme, see docs/superpowers/specs/
-- 2026-09-23-ios-canopy-theme-redesign-design.md) to the set of values
-- profiles.theme accepts. Web has no CSS for this theme and never offers
-- it as a picker option -- src/lib/theme.ts's THEME_NAMES/isThemeName
-- deliberately do NOT include it, so a web session that reads a
-- canopy-valued profile still falls back safely to meadow rather than
-- rendering unstyled. This migration only has to satisfy iOS's direct
-- PostgREST PATCH write path.
alter table profiles drop constraint profiles_theme_check;

alter table profiles
  add constraint profiles_theme_check
  check (theme in ('meadow', 'studio-ink', 'manuscript', 'canopy'));
```

- [ ] **Step 2: Update the Zod enum in `leaderboard.functions.ts`**

```typescript
        theme: z.enum(["meadow", "studio-ink", "manuscript", "canopy"]).optional(),
```

This keeps `updateProfile`'s input validation consistent with what the database now accepts, per `ARCHITECTURE.md`'s documented "both need updating together" rule — even though iOS's own write path doesn't call this web server function directly (it writes via `ProgressSyncClient+Profile.swift`'s own PostgREST `PATCH`), so this specific line isn't required for iOS's write to succeed. It's precautionary consistency, not a fix for a currently-broken path. **Do not** add `"canopy"` to `src/lib/theme.ts`'s `THEME_NAMES` — that constant is what makes `resolveInitialTheme` safely fall back to `meadow` for a theme web has no CSS for; adding it there would make web try to actually apply a `data-theme="canopy"` attribute with nothing behind it.

- [ ] **Step 3: Add tests exercising the real `updateProfile` validator, not a proxy for it**

`src/lib/leaderboard.functions.test.ts` already mocks `createServerFn` so calling `updateProfile(...)` runs its actual inline Zod validator (see the file's `describe("updateProfile", ...)` block for the existing pattern this follows exactly). Add two cases to that same `describe` block:

```typescript
  it("accepts the canopy theme", async () => {
    const supabase = createSupabaseMock();
    const updateChain = chainable({});
    supabase.from.mockReturnValueOnce(updateChain);
    const result = await updateProfile({
      context: ctx(supabase),
      data: { theme: "canopy" },
    });
    expect(result).toEqual({ ok: true });
    expect(updateChain.calls.find((c) => c.method === "update")?.args[0]).toEqual({
      theme: "canopy",
    });
  });

  it("still rejects a theme value that isn't in the enum", async () => {
    const supabase = createSupabaseMock();
    await expect(
      updateProfile({ context: ctx(supabase), data: { theme: "solarized" as never } }),
    ).rejects.toThrow();
  });
```

The first case is a real regression test for this task's actual change (the enum literally didn't accept `"canopy"` before Step 2); the second is the Review Focus requirement — confirming the validator still rejects an arbitrary string, i.e. this change added exactly one literal rather than loosening the schema.

- [ ] **Step 4: Add the web-fallback regression test**

Add to `src/lib/theme.test.ts` (extends the existing `isThemeName`/`resolveInitialTheme` describe blocks, doesn't need a new file):

```typescript
describe("canopy (iOS-only theme)", () => {
  it("is not a valid web theme name", () => {
    expect(isThemeName("canopy")).toBe(false);
  });

  it("falls back to meadow if the server reports canopy", () => {
    expect(resolveInitialTheme(null, "canopy")).toBe("meadow");
  });
});
```

- [ ] **Step 5: Run both test files**

```bash
bun run test src/lib/leaderboard.functions.test.ts src/lib/theme.test.ts
```

Expected: all tests pass, including the four new ones above.

- [ ] **Step 6: Lint**

```bash
bun run lint
```

Expected: no new errors from the three modified files.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260923000000_add_canopy_theme.sql src/lib/leaderboard.functions.ts src/lib/leaderboard.functions.test.ts src/lib/theme.test.ts
git commit -m "feat: allow canopy in profiles.theme (iOS-only, web falls back to meadow)"
```

---

### Task 6: Shared component — `AlphonsoMascotBanner`

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`

**Interfaces:**
- Consumes: `AlphonsoColor`/`AlphonsoFont` (existing), `Image("Alphonso")`/`Image("Hector")` (existing bundled assets — no new art per spec's Non-goals).
- Produces: `AlphonsoMascotBanner(mascot:message:)` — a new `View` the screen-rollout plan's flagship-screen tasks (auth, paywall, Learn tab) will use directly, replacing today's plain-text/no-imagery hero spots.

- [ ] **Step 1: Add the component**

Add a new `// MARK: - Mascot banner` section to `AlphonsoComponents.swift` (near the existing `// MARK: - Mascot` section, but as its own block since it's a distinct component from `AlphonsoTipCard`/`SpeechBubbleShape`):

```swift
// MARK: - Mascot banner

/// Which named mascot a banner shows -- keeps call sites from passing a
/// raw asset-name string (a typo there fails silently at runtime, not at
/// compile time, since `Image(_:)` has no compile-time asset checking).
enum AlphonsoMascot {
    case alphonso
    case hector

    var assetName: String {
        switch self {
        case .alphonso: return "Alphonso"
        case .hector: return "Hector"
        }
    }

    /// VoiceOver needs a real description, not just a decorative image --
    /// the portrait is communicating something (who's "speaking"), not
    /// just decoration. Combined with `message` at the call site for the
    /// full accessibility label (see `AlphonsoMascotBanner.body`).
    var accessibilityName: String {
        switch self {
        case .alphonso: return "Alphonso"
        case .hector: return "Hector"
        }
    }
}

/// A mascot portrait + a short line of copy on a colored/gradient card --
/// the shared replacement for the "plain text, no imagery" pattern found
/// on the paywall, auth, and Learn-tab-home hero spots (see the design
/// spec's Background section: the concrete before/after example was
/// PaywallView showing an SF Symbol instead of Hector's actual bundled
/// portrait). Not Canopy-specific -- any theme can use this, it just
/// reads `AlphonsoColor.moss`/`.parchment` like everything else here.
struct AlphonsoMascotBanner: View {
    let mascot: AlphonsoMascot
    let message: String

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 4) {
            Image(mascot.assetName)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous)
                        .strokeBorder(.white.opacity(0.6), lineWidth: 2)
                )

            Text(message)
                .font(AlphonsoFont.sans(14, weight: .bold))
                .foregroundStyle(AlphonsoColor.onPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(AlphonsoSpacing.md)
        .background(
            LinearGradient(colors: [AlphonsoColor.moss, AlphonsoColor.mossDeep], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(mascot.accessibilityName): \(message)")
    }
}
```

Note `.foregroundStyle(AlphonsoColor.onPrimary)` (not `.surface`) for the message text — the banner's background is the `moss`/`mossDeep` gradient, the same fill `onPrimary` was specifically defined against in Task 1/2, so this reuses that same correctness rather than re-deriving it.

- [ ] **Step 2: Self-review**

Check the two Non-goal/accessibility requirements from the spec directly against this diff: (a) no new mascot art — `Image("Alphonso")`/`Image("Hector")` reference the existing bundled assets, nothing new added to `Assets.xcassets`; (b) `accessibilityLabel` is a real sentence combining who's speaking and what they're saying, not a decorative/empty label — satisfies the spec's explicit accessibility requirement for mascot banners.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift
git commit -m "feat(ios): add AlphonsoMascotBanner shared component"
```

---

### Task 7: Shared component — `AlphonsoRowCard`

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift`

**Interfaces:**
- Consumes: `AlphonsoColor`/`AlphonsoFont`/`AlphonsoSpacing`/`AlphonsoRadius` (existing).
- Produces: `AlphonsoRowCard(title:subtitle:accent:)` — a new `View`, designed to sit as `List` row *content* (inside an existing `NavigationLink` or plain row), for the screen-rollout plan's lesson-list/review-queue/leaderboard-style tasks to adopt in place of today's plain `Text`-only rows.

- [ ] **Step 1: Add the component**

Add a `// MARK: - Row card` section:

```swift
// MARK: - Row card

/// A rounded card row (status dot + title + subtitle) for use as `List`
/// row *content* -- deliberately not a replacement for `List`/`Section`
/// itself (keeps lazy loading, `.searchable`, toolbar/navigation
/// integration all working exactly as they do today; see the design
/// spec's "New shared components" section for why this stays row content
/// rather than migrating to a `LazyVStack`). Replaces the current
/// plain-`Text`-only row pattern (e.g. `LessonBrowserView`'s lesson
/// rows) that's part of what read as "an empty piece of background with
/// some written knowledge on it" (the real user quote already in
/// `StatusHeaderView.swift`'s doc comment).
struct AlphonsoRowCard: View {
    let title: String
    let subtitle: String
    /// Status-dot color -- e.g. `.moss` for available, `.ember` for
    /// today's/next recommended item, `AlphonsoColor.hairline` for
    /// locked/dimmed. Callers pass an explicit color rather than this
    /// component inferring state, since "what counts as next/locked"
    /// is different per screen (lesson unlock order vs. review-queue
    /// due date vs. leaderboard rank).
    var accent: Color = AlphonsoColor.moss

    var body: some View {
        HStack(spacing: AlphonsoSpacing.sm + 2) {
            Circle()
                .fill(accent)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AlphonsoFont.sans(16, weight: .medium))
                    .foregroundStyle(AlphonsoColor.ink)
                Text(subtitle)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, AlphonsoSpacing.sm)
        .padding(.horizontal, AlphonsoSpacing.sm + 4)
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
    }
}
```

This intentionally does **not** set an explicit `.accessibilityElement`/label override — left as plain `Text` children so VoiceOver reads title + subtitle in order automatically, and so it inherits whatever tap-target/trait behavior the enclosing `NavigationLink`/`Button` already provides at each call site (per the spec's explicit accessibility requirement: preserve existing traits rather than reinventing them here).

- [ ] **Step 2: Self-review**

Confirm this component has no `List`/`Section`/`ForEach` of its own — it's pure row *content*, so adopting it at a call site (screen-rollout plan, not this plan) is a `Text`-for-`AlphonsoRowCard` swap inside an existing `ForEach`, not a structural rewrite. This matters because it's exactly what keeps that future adoption from re-triggering the documented `Section`/`ForEach` brace-misparse bug — the bug requires restructuring a `Section`'s content closure, which this component's usage pattern doesn't touch.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift
git commit -m "feat(ios): add AlphonsoRowCard shared component"
```

---

## After this plan

CI (`ios-app-build`) must be green on every commit above before the screen-rollout plan (a separate plan document, `docs/superpowers/plans/2026-09-23-ios-canopy-screen-rollout.md`) begins — that plan's tasks assume `AlphonsoThemeID.canopy`, `AlphonsoColor.onPrimary`/`.onAccent`, `AlphonsoMascotBanner`, and `AlphonsoRowCard` all already exist and compile.
