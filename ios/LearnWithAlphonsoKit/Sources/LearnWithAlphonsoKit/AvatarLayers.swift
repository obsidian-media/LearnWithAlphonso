import Foundation

/// A layer's place on the square canvas, as fractions of its side.
public struct AvatarRect: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let w: Double
    public let h: Double
}

/// The file names and positions of the avatar's art layers. The numbers are copied from the kit's `manifest.json`
/// (bundled beside the images), and a source guard compares the two.
public enum AvatarLayers {
    public static let baseFile = "base.webp"
    public static let glintMaskFile = "glint-mask.webp"

    public static let mouthRect = AvatarRect(
        x: 0.3508771929824561, y: 0.3684210526315789, w: 0.27910685805422647, h: 0.18341307814992025)
    public static let browsRect = AvatarRect(
        x: 0.31100478468899523, y: 0.15550239234449761, w: 0.34290271132376393, h: 0.09968102073365231)
    public static let earLeftRect = AvatarRect(
        x: 0.23125996810207336, y: 0.011961722488038277, w: 0.2631578947368421, h: 0.21929824561403508)
    public static let earRightRect = AvatarRect(
        x: 0.5055821371610846, y: 0.011961722488038277, w: 0.2631578947368421, h: 0.21929824561403508)
    public static let glintRect = AvatarRect(
        x: 0.32854864433811803, y: 0.24242424242424243, w: 0.2934609250398724, h: 0.13237639553429026)

    /// nil for a closed mouth: the base art already shows it.
    public static func mouthFile(_ viseme: AvatarViseme) -> String? {
        viseme == .closed ? nil : "mouth-\(viseme.rawValue).webp"
    }

    public static func browsFile(_ brows: AvatarBrows) -> String {
        "brows-\(brows.rawValue).webp"
    }

    /// The base has the ear areas removed, so exactly one ear layer per side is always drawn.
    public static func earFile(_ side: AvatarEarSide, twitching: Bool) -> String {
        "ear-\(side == .left ? "left" : "right")-\(twitching ? "twitch" : "neutral").webp"
    }

    public static let allFileNames: [String] =
        [baseFile, glintMaskFile]
        + AvatarViseme.allCases.compactMap { mouthFile($0) }
        + AvatarBrows.allCases.map { browsFile($0) }
        + [AvatarEarSide.left, .right].flatMap { side in [false, true].map { earFile(side, twitching: $0) } }
}

/// The "Show Alphonso while practising" setting. The @AppStorage key and its default live here so the settings
/// toggle and the Practice screen cannot drift apart.
public enum AvatarPreference {
    public static let key = "showAlphonsoWhilePractising"
    public static let defaultValue = true
}
