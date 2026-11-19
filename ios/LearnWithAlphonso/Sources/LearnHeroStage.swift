import LearnWithAlphonsoKit
import SwiftUI

/// The hero's sizes. A generic type cannot hold stored statics, so they live here.
enum LearnHeroMetrics {
    static let figureHeight: CGFloat = 190
    static let figureColumnWidth: CGFloat = 120
}

/// Learn's one hero, a single rounded card like the web's and Android's: the unit's painted room, Alphonso at full
/// strength on the right, his greeting bubble at the top left, and the current-unit info with the single gold
/// "Continue lesson" button in the left column. A gradient sits only behind the text column, never over Alphonso.
/// VoiceOver reads the greeting first, then the lesson line, then the button. At accessibility text sizes Alphonso
/// (decorative) steps aside and the text takes the full width.
struct LearnHeroStage<Content: View>: View {
    static var figureHeight: CGFloat { LearnHeroMetrics.figureHeight }
    private static var figureColumnWidth: CGFloat { LearnHeroMetrics.figureColumnWidth }

    let greeting: String
    let roomID: String
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var showsAlphonso: Bool { !dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        // The text column sets the card's height (about content, like Android's); the scene and Alphonso are a
        // backdrop sized to it, so the card grows only with Dynamic Type.
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            PathSpeechBubble(message: greeting)
                .frame(maxWidth: showsAlphonso ? 220 : .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Alphonso: \(greeting)")
            content
                .padding(.trailing, showsAlphonso ? Self.figureColumnWidth - AlphonsoDS.Space.s4 : 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, AlphonsoDS.Space.s3)
        .background {
            ZStack(alignment: .bottomTrailing) {
                ds.hero
                if let art = LessonArt.room(roomID) {
                    Image(uiImage: art).resizable().scaledToFill()
                        .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                        .clipped()
                }
                // A solid brand panel under the text column, fading out before it reaches Alphonso.
                LinearGradient(stops: [.init(color: ds.hero.opacity(0.94), location: 0), .init(color: ds.hero.opacity(0.9), location: 0.45), .init(color: ds.hero.opacity(0), location: showsAlphonso ? 0.75 : 1)], startPoint: .leading, endPoint: .trailing)
                if showsAlphonso, let face = LessonArt.expression(.happy) {
                    Image(uiImage: face)
                        .resizable().scaledToFit()
                        .frame(height: Self.figureHeight * 0.75)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        .padding(.horizontal, AlphonsoDS.Space.gutter)
        .padding(.vertical, AlphonsoDS.Space.s2)
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
