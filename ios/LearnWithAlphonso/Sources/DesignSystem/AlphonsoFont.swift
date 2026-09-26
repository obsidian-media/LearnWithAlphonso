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
    ///
    /// `opsz` is deliberately set from `size`, the DESIGN point size the
    /// call site asked for -- never from the Dynamic-Type-scaled size
    /// `resolvedVariant` actually renders at. `opsz` controls optical
    /// design (stroke contrast, x-height) for the size the type was drawn
    /// at; it is an authorial choice, not a proxy for the reader's text-size
    /// preference. Letting it track the scaled size would make the glyph
    /// *shapes* shift as someone turns Larger Text up or down, which is not
    /// what the axis is for -- and it would also disagree with the web's own
    /// `font-optical-sizing: auto`, which tracks CSS `font-size` (an author
    /// value), not a reader accessibility setting.
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

    /// Both `display` and `sans` already produce a concrete `UIFont` before
    /// wrapping it in `Font(...)` for SwiftUI -- that's what makes
    /// `UIFontMetrics` the fit here: scale the resolved `UIFont` itself, in
    /// this one place, and every one of the ~219 call sites across the app
    /// inherits Dynamic Type support with no signature change. (A
    /// `Font(uiFont)` bakes in a fixed point size the way `Font.system(size:)`
    /// does not -- it needs `UIFontMetrics` scaling to respond to Larger
    /// Text at all; this is the standard, documented pattern for giving a
    /// UIFont-backed custom font Dynamic Type support, and it responds live
    /// to a content-size-category change because SwiftUI re-renders the
    /// whole hierarchy from the root when that trait changes, which
    /// re-invokes `display`/`sans` and re-resolves a freshly-scaled `Font`.)
    ///
    /// `nearestTextStyle(for:)` below picks which style's *scaling curve* to
    /// apply -- every call site here passes a raw design point size, not a
    /// semantic style, so there is no other way to choose the curve. Each
    /// `UIFont.TextStyle` scales by a different percentage and caps at a
    /// different absolute size at the largest accessibility settings; using
    /// the wrong one either under- or over-scales relative to how the OS's
    /// own UI scales at that size. `UIFontMetrics.default` (the "generic,
    /// no particular style" option) was deliberately not used instead: it
    /// applies `.body`'s curve to everything, which noticeably over-grows a
    /// 12pt caption relative to how the rest of iOS treats caption-sized
    /// text at accessibility sizes.
    private static func resolvedVariant(baseName: String, axes: [String: CGFloat], size: CGFloat) -> UIFont {
        let metrics = UIFontMetrics(forTextStyle: nearestTextStyle(for: size))

        guard let base = UIFont(name: baseName, size: size) else {
            // Font not registered (e.g. a preview/test target without the
            // bundle resource) -- fall back to the system font rather than
            // crashing or rendering nothing. Still scaled, so a missing
            // font bundle doesn't also silently regress Dynamic Type.
            return metrics.scaledFont(for: .systemFont(ofSize: size, weight: systemWeight(for: axes["wght"])))
        }

        var variationDict: [NSNumber: NSNumber] = [:]
        for (tag, value) in axes {
            variationDict[NSNumber(value: fourCharCode(tag))] = NSNumber(value: Double(value))
        }
        let variationAttribute = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let descriptor = base.fontDescriptor.addingAttributes([variationAttribute: variationDict])
        let resolved = UIFont(descriptor: descriptor, size: size)
        return metrics.scaledFont(for: resolved)
    }

    /// Apple's own base ("Large"/default content size) point sizes for each
    /// text style, used only to find which style's scaling curve most
    /// closely matches a given design size -- the mapping is deliberately
    /// "round up to the next style" (`size <= base`), never down: applying a
    /// slightly larger style's curve over-scales a little, applying a
    /// smaller one under-scales, and under-scaling is the actual legibility
    /// failure this feature exists to prevent.
    private static func nearestTextStyle(for size: CGFloat) -> UIFont.TextStyle {
        let ladder: [(base: CGFloat, style: UIFont.TextStyle)] = [
            (11, .caption2), (12, .caption1), (13, .footnote), (15, .subheadline),
            (16, .callout), (17, .body), (20, .title3), (22, .title2),
            (28, .title1), (34, .largeTitle),
        ]
        return ladder.first(where: { size <= $0.base })?.style ?? .largeTitle
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
