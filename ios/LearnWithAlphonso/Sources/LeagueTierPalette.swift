import SwiftUI
import LearnWithAlphonsoKit

/// Ports src/data/achievements.ts's LEAGUE_TIER_META hex values exactly --
/// a different, 5-tier palette (bronze/silver/sapphire/ruby/diamond) from
/// AchievementBadgeView's 4-tier achievement-tier palette, so kept separate
/// rather than merged.
enum LeagueTierPalette {
    static func color(for tier: String) -> Color {
        switch tier {
        case "bronze": return Color(hex: 0xB07242)
        case "silver": return Color(hex: 0x8A9099)
        case "sapphire": return Color(hex: 0x4A6B8A)
        case "ruby": return Color(hex: 0x9A4A4A)
        case "diamond": return Color(hex: 0x4A7F7A)
        default: return Color(white: 0.53)
        }
    }

    static func label(for tier: String) -> String {
        LeagueTierCopy.label(for: tier)
    }
}
