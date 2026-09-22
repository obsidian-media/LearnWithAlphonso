import SwiftUI

/// Design tokens ported from the web app's "Meadow" theme
/// (`src/styles.css`'s `:root` block). Colors were computed from that
/// file's oklch values via a standard OKLab->sRGB conversion (not
/// eyeballed) so iOS and web read as the same brand. Only Meadow ships
/// here -- Studio Ink/Manuscript and an in-app theme switcher are
/// deliberately out of scope for this pass (see the design-system plan).
enum AlphonsoColor {
    /// Page background. CSS `--background` / `--color-surface`.
    static let surface = Color(hex: 0xF5_F0_E8)
    /// Card / secondary-surface background. CSS `--secondary` / `--color-parchment`.
    static let parchment = Color(hex: 0xED_E4_D8)
    /// Primary text. CSS `--foreground` / `--color-ink`.
    static let ink = Color(hex: 0x11_24_18)
    /// Secondary/muted text. CSS `--muted-foreground` / `--color-ink-soft`.
    static let inkSoft = Color(hex: 0x43_51_47)
    /// Brand primary (buttons, active states). CSS `--primary` / `--color-moss`.
    static let moss = Color(hex: 0x2F_62_43)
    /// Pressed-state shadow for `moss`-colored controls. CSS `--color-moss-deep`.
    static let mossDeep = Color(hex: 0x15_3C_25)
    /// Accent (streaks, highlights). CSS `--accent` / `--color-ember`.
    static let ember = Color(hex: 0xD7_59_28)
    /// Soft accent background (badges, subtle highlight fills). CSS `--color-ember-soft`.
    static let emberSoft = Color(hex: 0xF6_CF_B0)
    /// Errors/destructive actions. CSS `--destructive`.
    static let destructive = Color(hex: 0xE7_00_0B)
    /// Hairline borders/dividers. CSS `--border` (`--color-ink` at 10% alpha).
    static let hairline = ink.opacity(0.1)
}

/// Spacing scale, 4pt base (mirrors the web app's Tailwind spacing scale,
/// where 1 unit = 0.25rem = 4px).
enum AlphonsoSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
}

/// Corner-radius scale, mirroring CSS's `--radius: 0.625rem` (10px) base
/// and its `sm`/`md`/`lg`/`xl` steps in `styles.css`'s `@theme inline` block.
enum AlphonsoRadius {
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 10
    static let xl: CGFloat = 14
}

extension Color {
    /// Convenience initializer for the hex literals above -- keeps
    /// `AlphonsoColor` readable as a direct transcription of the oklch
    /// table in the design-system plan, rather than raw `red:green:blue:`
    /// triples.
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
