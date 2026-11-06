import Foundation

/// The design system's two palettes (visual round 6, design/tokens.json): Royal navy and gold, the default, and
/// Meadow green. A palette changes token values only; every screen built on the system reads the same names.
/// Mirrors the web's `src/lib/palette.ts` and Android's `AlphonsoPaletteId`.
public enum DSPaletteID: String, CaseIterable, Sendable {
    case royal
    case meadow

    public static let defaultPalette: DSPaletteID = .royal

    /// The four retired themes map onto the palettes: Meadow stays Meadow, Canopy, Studio Ink and Manuscript
    /// become Royal. `rawTheme` is the stored theme's raw value ("meadow", "canopy", ...).
    public static func forTheme(_ rawTheme: String?) -> DSPaletteID {
        rawTheme == "meadow" ? .meadow : .royal
    }

    /// A valid stored palette wins; otherwise the palette follows the stored theme.
    public static func resolve(stored: String?, theme: String?) -> DSPaletteID {
        stored.flatMap(DSPaletteID.init(rawValue:)) ?? forTheme(theme)
    }
}
