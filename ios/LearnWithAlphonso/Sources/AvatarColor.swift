import SwiftUI

/// Ports the web app's `hsl(seed.charCodeAt(0)*37 % 360, 40%, 45%)` avatar
/// color derivation exactly (src/routes/_authenticated/league.tsx and
/// profile_.friends.tsx both use it), so a given avatar_seed produces the
/// same color on iOS as on the web. `Color(hue:saturation:brightness:)` is
/// HSB, not HSL -- a different color model that would render visibly
/// different colors here -- so this converts HSL to RGB directly instead.
///
/// NOTE: `LeaderboardView.swift` (a separate, concurrently-developed PR)
/// currently carries its own private copy of this same conversion, per the
/// v2 friends kickoff doc's own note that factoring this out is "worth
/// doing if both land close together." Once both PRs are merged, that
/// private copy should be replaced with a call to this type -- tracked
/// here rather than silently left duplicated.
enum AvatarColor {
    static func forSeed(_ seed: String) -> Color {
        let firstCharCode = seed.unicodeScalars.first.map { Int($0.value) } ?? 0
        let hue = Double((firstCharCode * 37) % 360) / 360.0
        let (r, g, b) = hslToRGB(hue: hue, saturation: 0.40, lightness: 0.45)
        return Color(red: r, green: g, blue: b)
    }

    private static func hslToRGB(hue: Double, saturation: Double, lightness: Double) -> (Double, Double, Double) {
        guard saturation > 0 else { return (lightness, lightness, lightness) }
        let q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
        let p = 2 * lightness - q
        func component(_ t: Double) -> Double {
            var t = t
            if t < 0 { t += 1 }
            if t > 1 { t -= 1 }
            if t < 1.0 / 6 { return p + (q - p) * 6 * t }
            if t < 1.0 / 2 { return q }
            if t < 2.0 / 3 { return p + (q - p) * (2.0 / 3 - t) * 6 }
            return p
        }
        return (component(hue + 1.0 / 3), component(hue), component(hue - 1.0 / 3))
    }
}
