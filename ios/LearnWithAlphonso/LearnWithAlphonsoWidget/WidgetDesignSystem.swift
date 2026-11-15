import SwiftUI
import UIKit

/// The widget extension's share of the design system. It compiles the generated `AlphonsoDS.generated.swift` (the
/// same tokens the app draws with) and needs two things the app keeps elsewhere: the hex `Color` initialiser the
/// generated file uses, and a way to set a type role in the bundled variable fonts. The extension bundles
/// Bricolage Grotesque and Figtree itself and registers them in its own Info.plist (an extension cannot read the
/// app's fonts).

extension Color {
    /// The generated colour tables write `Color(hex: 0xRRGGBB)`.
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

enum WidgetFont {
    /// The design system type role as a SwiftUI font: the bundled face at the role's weight, width and optical
    /// size, scaled for Dynamic Type. Falls back to the system font (still scaled) if the face is not registered.
    static func font(_ style: AlphonsoDS.TextStyle) -> Font {
        let metrics = UIFontMetrics(forTextStyle: nearestTextStyle(for: style.size))
        guard let base = UIFont(name: style.role.postScriptName, size: style.size) else {
            return Font(metrics.scaledFont(for: .systemFont(ofSize: style.size, weight: systemWeight(style.weight))))
        }
        var axes: [String: CGFloat] = ["wght": style.weight]
        if style.role == .display {
            axes["wdth"] = style.width
            if let opsz = style.opsz { axes["opsz"] = opsz }
        }
        var variations: [NSNumber: NSNumber] = [:]
        for (tag, value) in axes {
            variations[NSNumber(value: fourCharCode(tag))] = NSNumber(value: Double(value))
        }
        let attribute = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let descriptor = base.fontDescriptor.addingAttributes([attribute: variations])
        let resolved = metrics.scaledFont(for: UIFont(descriptor: descriptor, size: style.size))
        let font = Font(resolved)
        return style.tnum ? font.monospacedDigit() : font
    }

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

    private static func systemWeight(_ wght: CGFloat) -> UIFont.Weight {
        switch wght {
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        default: return .heavy
        }
    }
}
