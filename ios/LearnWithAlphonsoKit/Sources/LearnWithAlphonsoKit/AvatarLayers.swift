import Foundation

/// A layer's place on the square canvas, as fractions of its side.
public struct AvatarRect: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let w: Double
    public let h: Double
    public init(x: Double, y: Double, w: Double, h: Double) {
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    }
}

/// The file names and positions of Alphonso's art layers. The numbers are copied from the kit's `manifest.json`
/// (bundled beside the images), and a source guard compares the two.
public enum AvatarLayers {
    public static let baseFile = "base.webp"
    public static let glintMaskFile = "glint-mask.webp"

    public static let mouthRect = AvatarRect(x: 0.2119140625, y: 0.298828125, w: 0.4609375, h: 0.4853515625)
    public static let browsRect = AvatarRect(x: 0.2880859375, y: 0.1494140625, w: 0.4169921875, h: 0.134765625)
    public static let glintRect = AvatarRect(x: 0.3359375, y: 0.251953125, w: 0.326171875, h: 0.1201171875)

    /// nil for a closed mouth: the base art already shows it.
    public static func mouthFile(_ viseme: AvatarViseme) -> String? {
        viseme == .closed ? nil : "mouth-\(viseme.rawValue).webp"
    }

    public static func browsFile(_ brows: AvatarBrows) -> String {
        "brows-\(brows.rawValue).webp"
    }

    /// For a kit that has ear layers (the base has the ear areas removed, so exactly one ear layer per side is always
    /// drawn). Alphonso's current kit has none.
    public static func earFile(_ side: AvatarEarSide, twitching: Bool) -> String {
        "ear-\(side == .left ? "left" : "right")-\(twitching ? "twitch" : "neutral").webp"
    }

    public static let allFileNames: [String] =
        [baseFile, glintMaskFile]
        + AvatarViseme.allCases.compactMap { mouthFile($0) }
        + AvatarBrows.allCases.map { browsFile($0) }
}

/// A character the call can show: his name, the bundle folder his art lives in, where his layers go, and his default
/// room. The viseme, plan and state logic does not know which character it is driving. Alphonso and Hector
/// are the kits shipped.
public struct CharacterKit: Equatable, Sendable {
    public let id: String
    public let displayName: String
    /// The bundle folder holding the kit's WebP layers (a folder reference).
    public let folder: String
    public let mouthRect: AvatarRect
    /// The group that shows his mood (neutral / raised / lowered): Alphonso's eyebrows, Hector's eyes behind his
    /// goggles. Its files are `<expressionPrefix>-neutral|raised|lowered.webp`.
    public let expressionRect: AvatarRect
    public let expressionPrefix: String
    /// Ears and the glint are optional: a kit without them has no ear twitch or glint.
    public let earLeftRect: AvatarRect?
    public let earRightRect: AvatarRect?
    public let glintRect: AvatarRect?
    public let defaultRoom: CallRoom

    public func expressionFile(_ brows: AvatarBrows) -> String { "\(expressionPrefix)-\(brows.rawValue).webp" }

    public static let alphonso = CharacterKit(
        id: "alphonso", displayName: "Alphonso", folder: "AlphonsoAvatar",
        mouthRect: AvatarLayers.mouthRect, expressionRect: AvatarLayers.browsRect, expressionPrefix: "brows",
        earLeftRect: nil, earRightRect: nil,
        glintRect: AvatarLayers.glintRect, defaultRoom: CallScenes.defaultRoom)

    /// Hector's kit (HectorAvatar): no ears and no glint; his expression group is `eyes-*` behind his goggles.
    public static let hector = CharacterKit(
        id: "hector", displayName: "Hector", folder: "HectorAvatar",
        mouthRect: AvatarRect(x: 0.255859375, y: 0.310546875, w: 0.3740234375, h: 0.392578125),
        expressionRect: AvatarRect(x: 0.25, y: 0.169921875, w: 0.44921875, h: 0.248046875),
        expressionPrefix: "eyes", earLeftRect: nil, earRightRect: nil, glintRect: nil,
        defaultRoom: CallScenes.defaultRoom)
}

/// The "Show Alphonso while practicing" setting. The @AppStorage key and its default live here so the settings
/// toggle and the Practice screen cannot drift apart.
public enum AvatarPreference {
    public static let key = "showAlphonsoWhilePractising"
    public static let defaultValue = true
}
