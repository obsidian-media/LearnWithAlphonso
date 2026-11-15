import Foundation

/// The two widget sizes the streak widget ships in: iOS .systemSmall and .systemMedium, Android 2x2 and 4x2.
public enum StreakWidgetFamily: Sendable, Equatable {
    case small
    case medium
}

/// What each size draws. Pure, so the same rule is tested once and read by the view.
public struct StreakWidgetLayout: Equatable, Sendable {
    public let showsAlphonso: Bool
    public let showsBest: Bool
    /// The empty state: just the flame and the prompt, centred, at every size.
    public let isEmpty: Bool

    /// Alphonso and the "Best" line belong to the wide widget with a streak to show; the small widget, and the
    /// empty state at any size, draw neither.
    public static func resolve(family: StreakWidgetFamily, hasSnapshot: Bool) -> StreakWidgetLayout {
        let wide = hasSnapshot && family == .medium
        return StreakWidgetLayout(showsAlphonso: wide, showsBest: wide, isEmpty: !hasSnapshot)
    }
}

/// The widget has exactly three looks: Royal light, Royal night (the device is in dark mode) and Meadow (always
/// light). Built on `DSPaletteID.usesNight`, the one rule the app itself uses.
public enum StreakWidgetLook: Sendable, Equatable {
    case royalLight
    case royalNight
    case meadowLight

    /// The look for the snapshot's stored theme on a device in light or dark mode. A missing or unknown theme is
    /// Royal; Meadow ignores dark mode.
    public static func resolve(theme: String?, deviceDark: Bool) -> StreakWidgetLook {
        let palette = DSPaletteID.resolve(stored: theme)
        switch palette {
        case .meadow: return .meadowLight
        case .royal: return palette.usesNight(deviceDark: deviceDark) ? .royalNight : .royalLight
        }
    }

    public var palette: DSPaletteID {
        self == .meadowLight ? .meadow : .royal
    }

    public var night: Bool {
        self == .royalNight
    }
}
