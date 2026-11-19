import LearnWithAlphonsoKit
import SwiftUI

/// Learn's one hero. The garden clip (Alphonso waving, his greeting bubble pinned on him, see LessonBrowserView) plays
/// behind the list; this row is the clear window it shows through, and the current-unit info and the single gold
/// "Continue lesson" button sit ON that scene, in the left column beside Alphonso, as one unit. VoiceOver reads the
/// greeting first, then the lesson line, then the button.
struct LearnHeroStage<Content: View>: View {
    static let figureHeight: CGFloat = 190
    /// Room above the figure's head for the speech bubble.
    private static let bubbleReserve: CGFloat = 96
    private static let figureColumnWidth: CGFloat = 150

    let greeting: String
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Color.clear
            .frame(minHeight: Self.figureHeight + Self.bubbleReserve + 48)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .bottomTrailing) {
                Color.clear
                    .frame(width: Self.figureColumnWidth, height: Self.figureHeight)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Alphonso: \(greeting)")
            }
            .overlay(alignment: .bottom) {
                content
                    // At accessibility sizes the text takes the full width (Alphonso is decorative there) so nothing overlaps him.
                    .padding(.trailing, dynamicTypeSize.isAccessibilitySize ? 0 : Self.figureColumnWidth - AlphonsoDS.Space.s4)
                    .background(alignment: .bottom) {
                        LinearGradient(colors: [ds.hero.opacity(0), ds.hero.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
            }
    }
}

/// Alphonso's greeting: text on a frosted card, with a small tail pointing down at him.
struct PathSpeechBubble: View {
    let message: String
    @Environment(\.alphonsoDS) private var ds
    /// How far to the right of the bubble's centre the tail sits (the bubble is clamped inside the screen).
    var tailOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Text(message)
                .dsText(.footnote)
                .foregroundStyle(ds.ink)
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
