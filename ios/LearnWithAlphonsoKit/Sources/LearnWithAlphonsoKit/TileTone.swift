import Foundation

/// Which of the five tile colours an item gets from its position in a list.
/// Mirrors `tileTone` in src/lib/tile-tones.ts; the app maps the name onto
/// `AlphonsoTileTone` for the colours.
public enum TileTone {
    public static let all = ["coral", "sky", "sun", "lilac", "mint"]

    public static func forIndex(_ index: Int) -> String {
        all[max(index, 0) % all.count]
    }
}
