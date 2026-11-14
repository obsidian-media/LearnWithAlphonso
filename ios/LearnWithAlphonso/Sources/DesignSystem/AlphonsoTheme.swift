import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// The two themes: Royal (navy and gold, the default) and Meadow (green). Raw values match the web's
/// `THEME_NAMES` (`src/lib/theme.ts`), Android's `AlphonsoThemeId`, the Kit's `DSPaletteID` and the
/// `profiles.theme` CHECK constraint exactly, so a value round-trips to/from the server with no mapping. Each has
/// a light and a night appearance (the night one follows the system's Dark Mode).
///
/// Studio Ink, Manuscript and Canopy are gone. A stored value that is one of them, or unknown, means Royal:
/// see `resolve(_:)` and `DSPaletteID.resolve(stored:)`.
public enum AlphonsoThemeID: String, CaseIterable, Identifiable, Sendable {
    case royal
    case meadow

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .royal: return "Royal"
        case .meadow: return "Meadow"
        }
    }

    /// Any stored raw value to a theme: Meadow stays Meadow, everything else (retired, unknown, missing) is Royal.
    public static func resolve(_ raw: String?) -> AlphonsoThemeID {
        AlphonsoThemeID(rawValue: DSPaletteID.resolve(stored: raw).rawValue) ?? .royal
    }
}

/// One theme's resolved tokens -- colors, the two font PostScript names
/// to resolve variable-font instances from (see `AlphonsoFont.swift`),
/// and which `ColorScheme` this theme counts as (drives
/// `.preferredColorScheme` so SwiftUI's own dynamic/system colors --
/// navigation-bar titles, `ContentUnavailableView`, segmented-Picker
/// tint -- resolve consistently with this theme's own palette instead
/// of the *device's* system Dark Mode setting, which is what caused a
/// real bug: system chrome flipped to light-on-dark text while this
/// app's then-Meadow-only fixed palette stayed light, making titles and
/// empty-state text unreadable whenever the device was in Dark Mode).
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
    /// the same contrast direction -- Royal's bright coral `ember`
    /// needs dark text while its navy `moss` needs light text.
    public let onAccent: Color
    /// Text color for `AlphonsoMascotBanner`'s `moss`->`mossDeep`
    /// gradient background specifically -- distinct from `onPrimary`
    /// because a solid single-color button fill and a two-stop gradient
    /// don't share a contrast-safe answer for every theme. Equals
    /// `onPrimary` for both themes today.
    public let onMossGradient: Color
    public let colorScheme: ColorScheme

    /// PostScript name of the bundled font file to resolve a weight/
    /// optical-size instance from (see `AlphonsoFont.resolvedVariant`).
    public let displayFontBaseName: String
    /// nil for a font with no `opsz` axis (Baloo 2) -- skip
    /// setting that axis entirely rather than passing a meaningless range.
    public let displayFontOpszRange: ClosedRange<CGFloat>?
    public let sansFontBaseName: String
}

enum AlphonsoPaletteCatalog {
    /// Colors are computed from `src/styles.css`'s oklch values via a
    /// standard OKLab->sRGB conversion (verified with a script, not
    /// eyeballed) -- see the design-system PR's commit messages for the
    /// exact conversion used. Font base names come from inspecting each
    /// bundled `.ttf`'s `name` table (`fontTools`) since UIFont(name:)
    /// needs an exact PostScript name, not a family name.
    ///
    /// This is the LIGHT variant of each theme (the night one is `dark` below).
    static let all: [AlphonsoThemeID: AlphonsoPalette] = [
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
            onMossGradient: Color(hex: 0xF5_F0_E8),
            colorScheme: .light,
            displayFontBaseName: "Fraunces-Regular",
            displayFontOpszRange: 9...144,
            sansFontBaseName: "Geist-Regular"
        ),
        .royal: AlphonsoPalette(
            surface: Color(hex: 0xFB_F6_EC),
            parchment: Color(hex: 0xFF_FF_FF),
            ink: Color(hex: 0x14_1B_3D),
            inkSoft: Color(hex: 0x5A_58_73),
            moss: Color(hex: 0x1D_2B_64),
            mossDeep: Color(hex: 0x14_1B_3D),
            ember: Color(hex: 0xE4_57_3F),
            emberSoft: Color(hex: 0xFD_D3_CA),
            destructive: Color(hex: 0xE7_00_0B),
            hairline: Color(hex: 0x14_1B_3D, opacity: 0.1),
            onPrimary: Color(hex: 0xFB_F6_EC),
            onAccent: Color(hex: 0x14_1B_3D),
            onMossGradient: Color(hex: 0xFB_F6_EC),
            colorScheme: .light,
            displayFontBaseName: "Baloo2-Regular",
            displayFontOpszRange: nil,
            sansFontBaseName: "Geist-Regular"
        ),
    ]

    /// Night variant of each theme, used whenever the system is in Dark Mode.
    ///
    /// Every accent (moss/mossDeep/ember) below is UNCHANGED from its light
    /// variant except where noted: each was already dark/saturated enough
    /// to host its light-mode `onPrimary`/`onAccent`/`onMossGradient` text,
    /// which is a property of the accent's own lightness relative to
    /// near-black-or-near-white, not of the page background around it --
    /// so most needed no adjustment to keep working here too. Only the
    /// neutrals (surface/parchment/ink/inkSoft) and the few accents noted
    /// inline were computed fresh, via a script (HSL lightness inversion
    /// for neutrals derived from each theme's own `ink`/`surface` hue, so
    /// the dark surface still reads as "this theme" rather than a generic
    /// gray; minimal-lightness-increase search against WCAG contrast math
    /// for the few accents that needed it), not eyeballed -- every ratio
    /// cited below is that script's actual output, re-verifiable the same
    /// way `onMossGradient`'s light-mode contrast numbers already are.
    static let dark: [AlphonsoThemeID: AlphonsoPalette] = [
        .meadow: AlphonsoPalette(
            surface: Color(hex: 0x0C_18_10),
            parchment: Color(hex: 0x15_26_1B),
            ink: Color(hex: 0xF4_F1_EC),
            inkSoft: Color(hex: 0xB9_B0_A2),
            moss: Color(hex: 0x2F_62_43),
            mossDeep: Color(hex: 0x15_3C_25),
            ember: Color(hex: 0xD7_59_28),
            emberSoft: Color(hex: 0x4F_30_17),
            // 0xE7000B (the light-mode destructive red) under-contrasts a dark surface. 0xFF0A15 (brightened
            // against THIS theme's own near-black/near-white pair, same
            // computed method): 4.60:1 against surface.
            destructive: Color(hex: 0xFF_0A_15),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            // ink/moss: 6.32:1. surface/ember: 4.64:1. ink/mossDeep: 10.93:1.
            onPrimary: Color(hex: 0xF4_F1_EC),
            onAccent: Color(hex: 0x0C_18_10),
            onMossGradient: Color(hex: 0xF4_F1_EC),
            colorScheme: .dark,
            displayFontBaseName: "Fraunces-Regular",
            displayFontOpszRange: 9...144,
            sansFontBaseName: "Geist-Regular"
        ),
        .royal: AlphonsoPalette(
            surface: Color(hex: 0x0E_13_30),
            parchment: Color(hex: 0x16_1C_40),
            ink: Color(hex: 0xEC_E7_F5),
            inkSoft: Color(hex: 0xA9_AE_C9),
            moss: Color(hex: 0xC9_D2_F7),
            mossDeep: Color(hex: 0x9A_A8_E8),
            ember: Color(hex: 0xE4_57_3F),
            emberSoft: Color(hex: 0x4F_21_17),
            destructive: Color(hex: 0xFF_0B_16),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            // Round-6 royal tokens: moss is the light brand tint here, so text on it is the dark surface.
            onPrimary: Color(hex: 0x0E_13_30),
            onAccent: Color(hex: 0x0E_13_30),
            onMossGradient: Color(hex: 0x0E_13_30),
            colorScheme: .dark,
            displayFontBaseName: "Baloo2-Regular",
            displayFontOpszRange: nil,
            sansFontBaseName: "Geist-Regular"
        ),
    ]
}

/// Shared theme state -- the iOS equivalent of the web's `theme.ts`
/// Zustand store. `@Observable` (iOS 17+, this app's deployment target)
/// means any SwiftUI view reading `AlphonsoThemeManager.shared.palette`
/// (directly, or indirectly via `AlphonsoColor`/`AlphonsoFont`'s
/// computed properties below) is automatically invalidated and
/// re-rendered when the theme changes, with no environment plumbing
/// needed at every call site.
@Observable
public final class AlphonsoThemeManager {
    public static let shared = AlphonsoThemeManager()

    public private(set) var themeID: AlphonsoThemeID

    /// The device's raw system appearance, pushed in by `RootView` -- see
    /// `RootView.updateRealSystemColorScheme()`, which reads
    /// `UIScreen.main.traitCollection` directly rather than
    /// `@Environment(\.colorScheme)` (found live 2026-09-28: that
    /// environment read, combined with this app's own
    /// `.preferredColorScheme` override, formed a feedback loop -- see
    /// that method's doc comment for the full story). Defaults to `.light`
    /// before that first push on a fresh launch, the same "best guess
    /// until real data arrives" posture as every other
    /// best-effort default in this manager.
    public private(set) var systemColorScheme: ColorScheme = .light

    /// The active theme's palette: its light values, or its night values whenever `systemColorScheme` is `.dark`
    /// (Dark Interface support: the app follows the device's appearance, for both themes).
    public var palette: AlphonsoPalette {
        if systemColorScheme == .dark {
            return AlphonsoPaletteCatalog.dark[themeID] ?? AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.royal]!
        }
        return AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.royal]!
    }

    private static let storageKey = "alphonso.theme"

    /// The design system palette (`AlphonsoDS`): the theme's own, Royal or Meadow. Read by `AlphonsoDS.current`
    /// and the `\.alphonsoDS` environment value.
    public var paletteID: DSPaletteID {
        DSPaletteID.resolve(stored: themeID.rawValue)
    }

    private init() {
        let saved = UserDefaults.standard.string(forKey: Self.storageKey)
        let id = AlphonsoThemeID.resolve(saved)
        themeID = id
        // A retired value (Studio Ink, Manuscript, Canopy) is moved to Royal for good, silently.
        if saved != nil, saved != id.rawValue {
            UserDefaults.standard.set(id.rawValue, forKey: Self.storageKey)
        }
        UserDefaults.standard.removeObject(forKey: "alphonso.palette")
    }

    /// Sets the theme locally (instant, persisted for next launch via
    /// `UserDefaults`) -- syncing the choice to `profiles.theme` is the
    /// caller's job (see `ThemePickerView`), same local-first-then-sync
    /// split as the web store's `setTheme`.
    public func setTheme(_ id: AlphonsoThemeID) {
        guard id != themeID else { return }
        themeID = id
        UserDefaults.standard.set(id.rawValue, forKey: Self.storageKey)
    }

    /// The account's value wins when there is one (mirrors `theme.ts`'s `resolveInitialTheme`: account > device >
    /// default); a retired value on the account means Royal. Call once after sign-in, once `profiles.theme` is
    /// known. A null value leaves the device's choice alone.
    public func hydrate(fromServerValue serverValue: String?) {
        guard let serverValue else { return }
        setTheme(AlphonsoThemeID.resolve(serverValue))
    }

    /// Called by `RootView` whenever it wants to re-check the device's raw
    /// system appearance -- on launch and on returning to the foreground,
    /// via `RootView.updateRealSystemColorScheme()` (which reads
    /// `UIScreen.main.traitCollection` directly, NOT
    /// `@Environment(\.colorScheme)`; see that method's own doc comment
    /// for why, found live 2026-09-28 as build 38's launch hang). This is
    /// a plain `@Observable` class, not a `View`, so it can't read the
    /// SwiftUI environment itself either way.
    ///
    /// **The guard below is load-bearing, not a style nit.** Found live
    /// 2026-09-28 as the cause of a real-device launch hang (watchdog
    /// SIGKILL, "scene-create", ~20s): without it, this unconditionally
    /// reassigns `systemColorScheme` on every call, and `@Observable`'s
    /// generated setter fires a change notification on ANY assignment --
    /// unlike `@Published`, it does not skip a set-to-the-same-value (see
    /// `setTheme` above, which already guards for exactly this reason).
    /// `RootView.body` reads this same property (via `AlphonsoColor.surface`
    /// and `.preferredColorScheme`), so every redundant reassignment
    /// re-triggered a re-render, which re-fired
    /// `.onChange(of: systemColorScheme, initial: true)`, which reassigned
    /// again -- a tight synchronous loop with no fixed point, pinning the
    /// main thread and starving `session.restoreSession()`'s task of any
    /// chance to run, which is why `isRestoring` never flipped to `false`
    /// either. Confirmed via on-device logging (LaunchBreadcrumbs.swift):
    /// over 100,000 repeated "RootView.body evaluating" lines in the ~20s
    /// before the kill.
    public func updateSystemColorScheme(_ scheme: ColorScheme) {
        guard systemColorScheme != scheme else { return }
        systemColorScheme = scheme
    }
}

/// Design tokens, resolved from whichever theme is currently active.
/// Every existing call site (`AlphonsoColor.moss`, etc., across every
/// screen) is unchanged syntactically -- these became computed
/// properties reading `AlphonsoThemeManager.shared.palette` instead of
/// `static let` constants, so the full-app theme switch needed no
/// changes anywhere outside this file and `AlphonsoFont.swift`.
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
    /// A wrong answer uses the theme's coral (ember). Both themes draw ember and moss apart, so wrong never looks
    /// like right.
    public static var wrongAnswer: Color { ember }
    public static var hairline: Color { AlphonsoThemeManager.shared.palette.hairline }
    public static var onPrimary: Color { AlphonsoThemeManager.shared.palette.onPrimary }
    public static var onAccent: Color { AlphonsoThemeManager.shared.palette.onAccent }
    public static var onMossGradient: Color { AlphonsoThemeManager.shared.palette.onMossGradient }
}

/// Spacing scale, 4pt base (mirrors the web app's Tailwind spacing scale,
/// where 1 unit = 0.25rem = 4px). Same across every theme -- only color/
/// font/optical-size tokens differ theme to theme.
public enum AlphonsoSpacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
    public static let xxl: CGFloat = 48
    /// Apple's minimum touch target (HIG). Every button style pads up to it.
    public static let minTouchTarget: CGFloat = 44
}

/// Corner-radius scale, mirroring CSS's `--radius: 0.625rem` (10px) base
/// and its `sm`/`md`/`lg`/`xl` steps in `styles.css`'s `@theme inline` block.
public enum AlphonsoRadius {
    public static let sm: CGFloat = 6
    public static let md: CGFloat = 8
    public static let lg: CGFloat = 10
    public static let xl: CGFloat = 14
}

extension Color {
    /// Convenience initializer for the hex literals above -- keeps
    /// `AlphonsoPaletteCatalog` readable as a direct transcription of
    /// each theme's oklch table, rather than raw `red:green:blue:` triples.
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
