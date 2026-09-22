import SwiftUI
import CoreText

/// Fraunces (display) and Geist (sans) -- the web app's Meadow-theme
/// fonts (`src/styles.css`'s `--font-display`/`--font-sans`), bundled here
/// as their upstream variable-font files (`Sources/Fonts/*.ttf`, from
/// google/fonts' `ofl/fraunces` and `ofl/geist`, OFL-licensed -- neither
/// ships pre-built static weight files, so this app registers the two
/// variable fonts via `UIAppFonts` in Info.plist and resolves a specific
/// weight/optical-size instance at request time via CoreText's
/// `kCTFontVariationAttribute`, rather than depending on iOS resolving
/// named instances by PostScript name (inconsistent across OS versions
/// for third-party variable fonts).
enum AlphonsoFont {
    enum Weight: CGFloat {
        case regular = 400
        case medium = 500
        case semiBold = 600
        case bold = 700
    }

    /// Fraunces. Mirrors the web app's default `font-optical-sizing: auto`
    /// behavior by setting the `opsz` axis to the rendered point size
    /// (clamped to Fraunces' own 9...144 axis range) -- Fraunces is
    /// deliberately more decorative at display sizes than at text sizes,
    /// and this keeps iOS matching that instead of always rendering the
    /// small-size cut at every point size.
    static func display(_ size: CGFloat, weight: Weight = .regular) -> Font {
        Font(resolvedVariant(
            baseFamily: "Fraunces",
            axes: ["wght": weight.rawValue, "opsz": min(max(size, 9), 144)],
            size: size
        ))
    }

    /// Geist.
    static func sans(_ size: CGFloat, weight: Weight = .regular) -> Font {
        Font(resolvedVariant(
            baseFamily: "Geist",
            axes: ["wght": weight.rawValue],
            size: size
        ))
    }

    // MARK: - CoreText variation-axis resolution

    private static func resolvedVariant(baseFamily: String, axes: [String: CGFloat], size: CGFloat) -> UIFont {
        guard let base = UIFont(name: baseFamily, size: size) ?? UIFont(name: "\(baseFamily)-Regular", size: size) else {
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
