import SwiftUI
import UIKit

/// The three themes the web app defines in `src/styles.css` (`meadow`
/// default, `studio-ink`, `manuscript`) -- iOS now mirrors all three, not
/// just Meadow. Raw values match the web's `THEME_NAMES`/`ThemeName`
/// (`src/lib/theme.ts`) and the `profiles.theme` CHECK constraint
/// exactly, so a value round-trips to/from the server with no mapping.
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
    /// the same contrast direction -- Canopy's bright coral `ember`
    /// needs dark text while its dark emerald `moss` needs light text.
    public let onAccent: Color
    /// Text color for `AlphonsoMascotBanner`'s `moss`->`mossDeep`
    /// gradient background specifically -- distinct from `onPrimary`
    /// because a solid single-color button fill and a two-stop gradient
    /// don't share a contrast-safe answer for every theme. Found in code
    /// review: Studio Ink's `moss`/`mossDeep` are a medium-bright blue,
    /// not dark, so `onPrimary` (= Studio Ink's own near-black `surface`,
    /// correct for its *button* fill) drops to 2.16:1 against
    /// `mossDeep` -- its light `ink` token measures 7.98:1 there
    /// instead. Equals `onPrimary` for every theme except Studio Ink;
    /// adding this token changes no existing screen's rendered output
    /// (nothing else reads it), only the new banner component.
    public let onMossGradient: Color
    public let colorScheme: ColorScheme

    /// PostScript name of the bundled font file to resolve a weight/
    /// optical-size instance from (see `AlphonsoFont.resolvedVariant`).
    public let displayFontBaseName: String
    /// nil for a font with no `opsz` axis (Instrument Serif) -- skip
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
    /// This is the LIGHT variant of each theme, except `.studioInk`, which
    /// has no light variant at all (see `dark` below and
    /// `AlphonsoThemeManager.palette`'s own doc comment for why).
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
        .studioInk: AlphonsoPalette(
            surface: Color(hex: 0x0B_0D_12),
            parchment: Color(hex: 0x13_16_1C),
            ink: Color(hex: 0xF5_F1_EA),
            inkSoft: Color(hex: 0xAA_A4_9A),
            moss: Color(hex: 0x00_72_D5),
            mossDeep: Color(hex: 0x00_46_99),
            ember: Color(hex: 0x00_72_D5),
            emberSoft: Color(hex: 0x00_2E_5D),
            // 0xE7000B (every other theme's shared destructive red, tuned
            // for reading as dark saturated text/icon on a LIGHT surface)
            // only measures 4.07:1 against this theme's own dark surface
            // and 3.80:1 against parchment -- both under the 4.5:1 AA text
            // threshold. Found while deriving dark-mode destructive values
            // for the newly-added dark variants below (same computed,
            // minimal-brightening method, same target); Studio Ink already
            // being dark meant it had this same latent gap today, so it's
            // fixed here rather than left as a second inconsistent red.
            // 0xF8000C: 4.62:1 against surface, 4.31:1 against parchment
            // (parchment falls just short -- destructive text/icons render
            // there rarely enough, e.g. a nested card's own delete action,
            // that this is accepted rather than brightening further and
            // drifting the red away from recognizability).
            destructive: Color(hex: 0xF8_00_0C),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            onPrimary: Color(hex: 0x0B_0D_12),
            onAccent: Color(hex: 0x0B_0D_12),
            // Deliberately `ink` (light), not `surface` like every other
            // theme's onMossGradient -- Studio Ink's moss/mossDeep are a
            // medium-bright blue, not dark, so near-black `surface` text
            // (correct for its button fill) drops to 2.16:1 against
            // mossDeep; `ink` measures 7.98:1 there instead.
            onMossGradient: Color(hex: 0xF5_F1_EA),
            colorScheme: .dark,
            displayFontBaseName: "InstrumentSerif-Regular",
            displayFontOpszRange: nil,
            sansFontBaseName: "InstrumentSans-Regular"
        ),
        .manuscript: AlphonsoPalette(
            surface: Color(hex: 0xF3_F5_F8),
            parchment: Color(hex: 0xE9_EB_EE),
            ink: Color(hex: 0x0F_12_16),
            inkSoft: Color(hex: 0x4A_4D_53),
            moss: Color(hex: 0x8D_18_28),
            mossDeep: Color(hex: 0x65_00_14),
            ember: Color(hex: 0x8D_18_28),
            emberSoft: Color(hex: 0xED_C1_C0),
            destructive: Color(hex: 0xE7_00_0B),
            hairline: Color(hex: 0x0F_12_16, opacity: 0.12),
            onPrimary: Color(hex: 0xF3_F5_F8),
            onAccent: Color(hex: 0xF3_F5_F8),
            onMossGradient: Color(hex: 0xF3_F5_F8),
            colorScheme: .light,
            displayFontBaseName: "Newsreader16pt-Regular",
            displayFontOpszRange: 6...72,
            sansFontBaseName: "SourceSans3-Roman"
        ),
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
            onMossGradient: Color(hex: 0xEF_FA_F4),
            colorScheme: .light,
            displayFontBaseName: "Baloo2-Regular",
            displayFontOpszRange: nil,
            sansFontBaseName: "Geist-Regular"
        ),
    ]

    /// Dark variant of each LIGHT theme -- `.studioInk` deliberately has no
    /// entry here (see `AlphonsoThemeManager.palette`'s doc comment): it's
    /// already dark and stays that way regardless of system appearance,
    /// the same "pick a dark-styled look on purpose" pattern several apps
    /// offer independent of following the system setting.
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
            // Same gap and same fix as Studio Ink's destructive above:
            // 0xE7000B under-contrasts a dark surface. 0xFF0A15 (brightened
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
        .manuscript: AlphonsoPalette(
            surface: Color(hex: 0x0E_11_15),
            parchment: Color(hex: 0x18_1D_23),
            ink: Color(hex: 0xEC_EF_F4),
            inkSoft: Color(hex: 0xA2_AB_B9),
            moss: Color(hex: 0x8D_18_28),
            mossDeep: Color(hex: 0x65_00_14),
            ember: Color(hex: 0x8D_18_28),
            emberSoft: Color(hex: 0x4F_18_17),
            destructive: Color(hex: 0xFB_00_0C),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            // ink/moss: 7.94:1 (moss and ember are the same color in this
            // theme, light or dark -- see the light palette's own values).
            // ink/mossDeep: 11.65:1.
            onPrimary: Color(hex: 0xEC_EF_F4),
            onAccent: Color(hex: 0xEC_EF_F4),
            onMossGradient: Color(hex: 0xEC_EF_F4),
            colorScheme: .dark,
            displayFontBaseName: "Newsreader16pt-Regular",
            displayFontOpszRange: 6...72,
            sansFontBaseName: "SourceSans3-Roman"
        ),
        .canopy: AlphonsoPalette(
            surface: Color(hex: 0x0C_18_13),
            parchment: Color(hex: 0x15_26_1F),
            ink: Color(hex: 0xEC_F4_EF),
            inkSoft: Color(hex: 0xA2_B9_AC),
            moss: Color(hex: 0x0C_69_44),
            mossDeep: Color(hex: 0x13_3F_2B),
            ember: Color(hex: 0xE4_57_3F),
            emberSoft: Color(hex: 0x4F_21_17),
            destructive: Color(hex: 0xFF_0B_16),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            // ink/moss: 6.01:1. surface/ember: 4.96:1. ink/mossDeep: 10.57:1.
            onPrimary: Color(hex: 0xEC_F4_EF),
            onAccent: Color(hex: 0x0C_18_13),
            onMossGradient: Color(hex: 0xEC_F4_EF),
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

    /// The device's raw system appearance, pushed in by `RootView` (the one
    /// place in the app with `@Environment(\.colorScheme)` access before
    /// this app's own `.preferredColorScheme` override applies -- see
    /// `RootView.body`'s `.onChange(of: systemColorScheme, initial: true)`).
    /// Defaults to `.light` before that first push on a fresh launch, the
    /// same "best guess until real data arrives" posture as every other
    /// best-effort default in this manager.
    public private(set) var systemColorScheme: ColorScheme = .light

    /// Dark Interface support (App Store accessibility label, BACKLOG item):
    /// `.studioInk` has no light variant and is unaffected by system
    /// appearance -- it's a dark-styled theme a user can pick on purpose,
    /// the same as several apps offer an "always dark" option independent
    /// of following the system setting; there is no light Studio Ink to
    /// fall back to, and inventing one is a different, much larger design
    /// exercise than "the app respects Dark Mode." Every other theme now
    /// has a real dark variant (`AlphonsoPaletteCatalog.dark`) and switches
    /// to it automatically whenever `systemColorScheme` is `.dark` --
    /// that's the actual fix: previously `.preferredColorScheme` forced
    /// every screen to whichever single appearance the selected theme
    /// happened to be, so a user with system Dark Mode on saw a light app
    /// unless they specifically chose Studio Ink.
    public var palette: AlphonsoPalette {
        if themeID == .studioInk {
            return AlphonsoPaletteCatalog.all[.studioInk] ?? AlphonsoPaletteCatalog.all[.meadow]!
        }
        if systemColorScheme == .dark {
            return AlphonsoPaletteCatalog.dark[themeID] ?? AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.meadow]!
        }
        return AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.meadow]!
    }

    private static let storageKey = "alphonso.theme"

    private init() {
        if let saved = UserDefaults.standard.string(forKey: Self.storageKey),
           let id = AlphonsoThemeID(rawValue: saved) {
            themeID = id
        } else {
            themeID = .canopy
        }
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

    /// Server value wins when present and valid (mirrors `theme.ts`'s
    /// `resolveInitialTheme`: server > local > default) -- call once
    /// after sign-in, once `profiles.theme` is known.
    public func hydrate(fromServerValue serverValue: String?) {
        guard let serverValue, let id = AlphonsoThemeID(rawValue: serverValue) else { return }
        setTheme(id)
    }

    /// Called by `RootView` whenever the device's raw system appearance
    /// changes (including the very first render, via `initial: true`) --
    /// see `systemColorScheme`'s own doc comment for why this can't just
    /// read `@Environment(\.colorScheme)` itself (this is a plain
    /// `@Observable` class, not a `View`).
    public func updateSystemColorScheme(_ scheme: ColorScheme) {
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
