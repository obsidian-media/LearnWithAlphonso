import LearnWithAlphonsoKit
import SwiftUI

/// The scene half of Learn's one hero. The garden clip (with Alphonso waving and his greeting bubble pinned on him,
/// see LessonBrowserView) plays behind the list; this is the clear window it shows through, sitting directly above the
/// current-unit card whose single "Continue lesson" button is the one way in. It draws nothing itself: it reserves the
/// room Alphonso stands in and is the one place VoiceOver hears his greeting.
struct LearnHeroStage: View {
    static let figureHeight: CGFloat = 190
    /// Room above the figure's head for the speech bubble.
    private static let bubbleReserve: CGFloat = 96
    private static let figureColumnWidth: CGFloat = 150

    let greeting: String

    var body: some View {
        Color.clear
            .frame(height: Self.figureHeight + Self.bubbleReserve)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .bottomTrailing) {
                Color.clear
                    .frame(width: Self.figureColumnWidth, height: Self.figureHeight)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Alphonso: \(greeting)")
            }
    }
}

/// Alphonso's greeting: text on a frosted card, with a small tail pointing down at him.
struct PathSpeechBubble: View {
    let message: String
    /// How far to the right of the bubble's centre the tail sits (the bubble is clamped inside the screen).
    var tailOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Text(message)
                .font(AlphonsoFont.sans(14, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                        .strokeBorder(.white.opacity(0.4), lineWidth: 1)
                )
            BubbleTail()
                .fill(.regularMaterial)
                .frame(width: 18, height: 10)
                .offset(x: tailOffset, y: -1)
        }
        .alphonsoLift()
    }
}

private struct BubbleTail: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
