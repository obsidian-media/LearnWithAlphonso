import LearnWithAlphonsoKit
import SwiftUI

/// A question's prompt as Alphonso asking it: his portrait beside a speech bubble (web: `AskingAlphonso`).
/// The portrait is decorative (the bubble says it all) and is dropped at accessibility text sizes and on a short
/// phone, with a long prompt on a media card, where the answer tiles must stay on screen; the bubble then takes the full width. No animation of
/// its own: the portrait's breathing already stops under Reduce Motion.
struct AskingAlphonso: View {
    let prompt: String
    /// The card also shows an image, plays audio, or has a listening or speak control above the answers.
    var hasMedia = false

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Three steps (`AskingAlphonsoLayout`, tested in the Kit): none on an iPhone SE (667 pt) or smaller or at
    /// accessibility text sizes, a 56 pt avatar on a mid-size phone, and a real 128 pt figure above 800 pt (an
    /// iPhone mini's 812 pt and every 844 pt phone), where the middle of the question screen would otherwise sit
    /// empty. A long prompt or a media card caps him at the avatar; both remove him.
    private var mascotSize: CGFloat? {
        AskingAlphonsoLayout.portraitSize(
            screenHeight: UIScreen.main.bounds.height,
            accessibilitySize: dynamicTypeSize.isAccessibilitySize,
            promptLength: prompt.count,
            hasMedia: hasMedia
        ).map { CGFloat($0) }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: AlphonsoSpacing.sm) {
            if let mascotSize {
                MascotTile(moment: .questionAsk, size: mascotSize, tone: .sun, radius: mascotSize > 100 ? 28 : 18)
                    .accessibilityHidden(true)
            }
            speechBubble
        }
    }

    private var speechBubble: some View {
        Text(prompt)
            .font(AlphonsoFont.display(21, weight: .semiBold))
            .foregroundStyle(AlphonsoColor.ink)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm + 2)
            .background(AlphonsoColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(AlphonsoColor.hairline, lineWidth: 2)
            )
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(AlphonsoColor.hairline)
                    .offset(y: 3)
            )
            .padding(.bottom, 3)
            // Reads as the question heading, as the plain Text did.
            .accessibilityAddTraits(.isHeader)
    }
}
