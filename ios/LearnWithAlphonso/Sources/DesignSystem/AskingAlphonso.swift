import LearnWithAlphonsoKit
import SwiftUI

/// A question's prompt as Alphonso asking it: his portrait beside a speech bubble (web: `AskingAlphonso`).
/// The portrait is decorative (the bubble says it all) and is dropped at accessibility text sizes and on a short
/// phone, where the answer tiles must stay on screen; the bubble then takes the full width. No animation of
/// its own: the portrait's breathing already stops under Reduce Motion.
struct AskingAlphonso: View {
    let prompt: String

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// iPhone SE (667 pt) and smaller. Larger phones have room for a 56 pt portrait beside the prompt.
    private var showsMascot: Bool {
        !dynamicTypeSize.isAccessibilitySize && UIScreen.main.bounds.height > 667
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: AlphonsoSpacing.sm) {
            if showsMascot {
                MascotTile(moment: .questionAsk, size: 56, tone: .sun, radius: 18)
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
