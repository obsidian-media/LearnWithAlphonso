import Foundation

/// The emoji-to-3D-icon mapping (Microsoft Fluent Emoji 3D), shared with the
/// web through src/data/icon3d.json. Asset names are namespaced in the app's
/// asset catalog: "Icon3D/<slug>".
public enum Icon3DCatalog {
    /// Keys carry no U+FE0F variation selector.
    public static let mapping: [String: String] = load("icon3d")
    static let achievementGlyphs: [String: String] = load("icon3d-achievements")

    /// The asset for an emoji, or nil if the set has none. "⭐️" and "⭐" are the same icon.
    public static func assetName(for emoji: String) -> String? {
        let bare = emoji.unicodeScalars.filter { $0.value != 0xFE0F }
        return mapping[String(String.UnicodeScalarView(bare))].map { "Icon3D/\($0)" }
    }

    /// The emoji for an achievement's glyph key ("flame" is 🔥), or nil for an unknown key.
    public static func emoji(forAchievementGlyph glyph: String) -> String? {
        achievementGlyphs[glyph]
    }

    private static func load(_ name: String) -> [String: String] {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: String].self, from: data)
        else { return [:] }
        return decoded
    }
}
