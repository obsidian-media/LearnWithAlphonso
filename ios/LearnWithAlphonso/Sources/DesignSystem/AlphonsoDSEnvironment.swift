import SwiftUI
import LearnWithAlphonsoKit

/// How screens reach the round-6 design system (`AlphonsoDS.generated.swift`). `RootView` puts the active colours
/// in the environment; a screen reads `@Environment(\.alphonsoDS) private var ds` and then `ds.ink`, `ds.surface`.
/// Values live only in the generated file; nothing here holds a number of its own.
private struct AlphonsoDSColorsKey: EnvironmentKey {
    static let defaultValue: AlphonsoDS.Colors = AlphonsoDS.royalLight
}

public extension EnvironmentValues {
    /// The design system colours for the chosen palette and the device's light or dark setting.
    var alphonsoDS: AlphonsoDS.Colors {
        get { self[AlphonsoDSColorsKey.self] }
        set { self[AlphonsoDSColorsKey.self] = newValue }
    }
}

public extension AlphonsoDS {
    /// The colours for the current palette (`AlphonsoThemeManager.paletteID`) and system appearance. Reading it
    /// inside a view body tracks both, because the manager is `@Observable`.
    static var current: Colors {
        let manager = AlphonsoThemeManager.shared
        return colors(manager.paletteID, night: manager.systemColorScheme == .dark)
    }

    /// The bundled face for a type role, with its weight, width and optical size axes, scaled for Dynamic Type
    /// through the same CoreText resolver as `AlphonsoFont`.
    static func font(_ style: TextStyle) -> Font {
        var axes: [String: CGFloat] = ["wght": style.weight]
        if style.role == .display {
            axes["wdth"] = style.width
            if let opsz = style.opsz { axes["opsz"] = opsz }
        }
        let font = Font(AlphonsoFont.resolvedVariant(baseName: style.role.postScriptName, axes: axes, size: style.size))
        return style.tnum ? font.monospacedDigit() : font
    }
}

public extension View {
    /// Puts the current design system colours in the environment. Applied once, at the root.
    func alphonsoDesignSystem() -> some View {
        environment(\.alphonsoDS, AlphonsoDS.current)
    }

    /// Sets a design system type role: face, letter spacing, capitals and tabular figures where digits change.
    func dsText(_ style: AlphonsoDS.TextStyle) -> some View {
        font(AlphonsoDS.font(style))
            .tracking(style.tracking * style.size)
            .textCase(style.uppercase ? .uppercase : nil)
    }
}
