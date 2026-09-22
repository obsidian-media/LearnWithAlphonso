import SwiftUI
import CoreText

/// Each theme's display/sans font pair (mirrors `src/styles.css`'s
/// `--font-display`/`--font-sans` per `[data-theme=...]` block), bundled
/// here as the upstream variable-font files (`Sources/Fonts/*.ttf`, from
/// google/fonts, OFL-licensed) -- none of the four theme-specific
/// families ship pre-built static weight files (Instrument Serif is the
/// one exception: it's static-only, a single Regular face, since the web
/// app only ever loads its italic axis, never a bold one). This app
/// registers every variable font via `UIAppFonts` in Info.plist and
/// resolves a specific weight/optical-size instance at request time via
/// CoreText's `kCTFontVariationAttribute`, rather than depending on iOS
/// resolving named instances by PostScript name (inconsistent across OS
/// versions for third-party variable fonts) -- see
/// `AlphonsoTheme.swift`'s `AlphonsoPalette` for which base PostScript
/// name and optical-size axis range each theme's display font uses.
public enum AlphonsoFont {
    public enum Weight: CGFloat {
        case regular = 400
        case medium = 500
        case semiBold = 600
        case bold = 700
    }

    /// The active theme's display font. Mirrors the web's default
    /// `font-optical-sizing: auto` behavior by setting the `opsz` axis to
    /// the rendered point size (clamped to that font's own axis range)
    /// where the active theme's font has one (Fraunces, Newsreader) --
    /// skipped entirely for Instrument Serif (Studio Ink), which has no
    /// `opsz` axis at all.
    public static func display(_ size: CGFloat, weight: Weight = .regular) -> Font {
        let palette = AlphonsoThemeManager.shared.palette
        var axes: [String: CGFloat] = ["wght": weight.rawValue]
        if let opszRange = palette.displayFontOpszRange {
            axes["opsz"] = min(max(size, opszRange.lowerBound), opszRange.upperBound)
        }
        return Font(resolvedVariant(baseName: palette.displayFontBaseName, axes: axes, size: size))
    }

    /// The active theme's sans/body font.
    public static func sans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        let palette = AlphonsoThemeManager.shared.palette
        return Font(resolvedVariant(baseName: palette.sansFontBaseName, axes: ["wght": weight.rawValue], size: size))
    }

    // MARK: - CoreText variation-axis resolution

    private static func resolvedVariant(baseName: String, axes: [String: CGFloat], size: CGFloat) -> UIFont {
        guard let base = UIFont(name: baseName, size: size) else {
            // Font not registered (e.g. a preview/test target without the
            // bundle resource) -- fall back to the system font rather than
            // crashing or rendering nothing.
            return .systemFont(ofSize: size, weight: systemWeight(for: axes["wght"]))
        }

        var variationDict: [NSNumber: NSNumber] = [:]
        for (tag, value) in axes {
            variationDict[NSNumber(value: fourCharCode(tag))] = NSNumber(value: Double(value))
        }
        let variationAttribute = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let descriptor = base.fontDescriptor.addingAttributes([variationAttribute: variationDict])
        return UIFont(descriptor: descriptor, size: size)
    }

    private static func fourCharCode(_ tag: String) -> UInt32 {
        tag.utf8.reduce(UInt32(0)) { ($0 << 8) + UInt32($1) }
    }

    private static func systemWeight(for wght: CGFloat?) -> UIFont.Weight {
        switch wght {
        case .some(500): return .medium
        case .some(600): return .semibold
        case .some(700): return .bold
        default: return .regular
        }
    }
}
