import LearnWithAlphonsoKit
import UIKit

/// The image to show for a mascot moment. The Kit picks the pose from its JSON list; this also checks
/// the image is really in the app, so a pose listed before its art ships shows the base mascot, never
/// a blank space.
enum MascotArt {
    static func assetName(for moment: MascotMoment) -> String {
        let art = MascotPoseCatalog.art(for: moment)
        let posed = art.assetName
        if UIImage(named: posed) != nil { return posed }
        return art.mascot.prefix(1).uppercased() + art.mascot.dropFirst()
    }
}
