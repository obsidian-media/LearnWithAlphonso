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
            destructive: Color(hex: 0xE7_00_0B),
            hairline: Color(hex: 0xFF_FF_FF, opacity: 0.1),
            onPrimary: Color(hex: 0x0B_0D_12),
            onAccent: Color(hex: 0x0B_0D_12),
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
            colorScheme: .light,
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

    public var palette: AlphonsoPalette {
        AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.meadow]!
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
