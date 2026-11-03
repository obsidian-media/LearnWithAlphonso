import LearnWithAlphonsoKit
import SwiftUI

/// A glossy 3D icon for an emoji (Microsoft Fluent Emoji 3D). Decorative: the
/// text beside it carries the meaning. An emoji the set doesn't cover falls
/// back to the plain emoji, so nothing is ever blank.
struct Icon3DView: View {
    let emoji: String
    let size: CGFloat

    var body: some View {
        Group {
            if let name = Icon3DCatalog.assetName(for: emoji), UIImage(named: name) != nil {
                Image(name)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
            } else {
                Text(emoji)
                    .font(.system(size: size * 0.85))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
