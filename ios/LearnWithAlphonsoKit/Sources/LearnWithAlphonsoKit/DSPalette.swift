import Foundation

/// The design system's two palettes (visual round 6, design/tokens.json): Royal navy and gold, the default, and
/// Meadow green. A palette changes token values only; every screen built on the system reads the same names.
/// This is also the app's theme: the stored theme value is one of these two raw values. Mirrors the web's
/// `src/lib/theme.ts` and Android's `AlphonsoThemeId`.
public enum DSPaletteID: String, CaseIterable, Sendable {
    case royal
    case meadow

    public static let defaultPalette: DSPaletteID = .royal

    /// Any stored raw value to a palette: "royal" and "meadow" are themselves; everything else (the retired
    /// Studio Ink, Manuscript and Canopy, an unknown value, nothing stored) is Royal. Never fails.
    public static func resolve(stored: String?) -> DSPaletteID {
        stored.flatMap(DSPaletteID.init(rawValue:)) ?? defaultPalette
    }
}
