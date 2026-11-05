import Foundation

/// How big Alphonso is beside a question's prompt: a large figure, a small avatar, or absent (`nil`).
/// Mirrors src/lib/asking-alphonso.ts (web) and `AskingAlphonsoLayout` in the Android core; only the screen-height
/// thresholds differ by platform. Screen height picks the step; what is already on the screen can only shrink it.
public enum AskingAlphonsoLayout {
    /// Taller than this (points) gets the large figure, so an 812 pt iPhone mini does too; 844 pt phones always.
    public static let largeAboveHeight: Double = 800
    /// At or below this (an iPhone SE, 667 pt) he is dropped.
    public static let noneAtOrBelowHeight: Double = 667
    public static let largeSize = 128
    public static let smallSize = 56
    /// A prompt longer than this many characters wraps to three or more lines beside a large portrait.
    public static let longPromptCharacters = 60

    /// - Parameters:
    ///   - hasMedia: the card also shows an image, plays audio, or has a listening or speak control.
    /// - Returns: the portrait's side in points, or `nil` for no portrait.
    public static func portraitSize(
        screenHeight: Double,
        accessibilitySize: Bool,
        promptLength: Int,
        hasMedia: Bool
    ) -> Int? {
        if accessibilitySize { return nil }
        let crowd = (promptLength > longPromptCharacters ? 1 : 0) + (hasMedia ? 1 : 0)
        if crowd >= 2 || screenHeight <= noneAtOrBelowHeight { return nil }
        if screenHeight > largeAboveHeight && crowd == 0 { return largeSize }
        return smallSize
    }
}
