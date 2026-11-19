import LearnWithAlphonsoKit
import SwiftUI

/// The hero's sizes. A generic type cannot hold stored statics, so they live here.
enum LearnHeroMetrics {
    static let figureHeight: CGFloat = 190
    /// Room above the text column for the greeting bubble.
    static let bubbleReserve: CGFloat = 96
    static let figureColumnWidth: CGFloat = 150
}

/// Learn's one hero, a single rounded card like the web's and Android's: the unit's painted room, Alphonso at full
/// strength on the right, his greeting bubble at the top left, and the current-unit info with the single gold
/// "Continue lesson" button in the left column. A gradient sits only behind the text column, never over Alphonso.
/// VoiceOver reads the greeting first, then the lesson line, then the button. At accessibility text sizes Alphonso
/// (decorative) steps aside and the text takes the full width.
struct LearnHeroStage<Content: View>: View {
    static var figureHeight: CGFloat { LearnHeroMetrics.figureHeight }
    private static var bubbleReserve: CGFloat { LearnHeroMetrics.bubbleReserve }
    private static var figureColumnWidth: CGFloat { LearnHeroMetrics.figureColumnWidth }

    let greeting: String
    let roomID: String
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var showsAlphonso: Bool { !dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            ds.hero
            if let art = LessonArt.room(roomID) {
                Image(uiImage: art).resizable().scaledToFill()
            }
            // Behind the text column only: dark on the left, clear by the time it reaches Alphonso.
            // A solid brand panel under the text column, fading out before it reaches Alphonso.
            LinearGradient(stops: [.init(color: ds.hero.opacity(0.94), location: 0), .init(color: ds.hero.opacity(0.9), location: 0.45), .init(color: ds.hero.opacity(0), location: showsAlphonso ? 0.75 : 1)], startPoint: .leading, endPoint: .trailing)
            LinearGradient(colors: [ds.hero.opacity(0), ds.hero.opacity(0.6)], startPoint: .top, endPoint: .bottom)
            if showsAlphonso, let face = LessonArt.expression(.happy) {
                Image(uiImage: face)
                    .resizable().scaledToFit()
                    .frame(height: Self.figureHeight)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                PathSpeechBubble(message: greeting)
                    .frame(maxWidth: showsAlphonso ? 220 : .infinity, alignment: .leading)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Alphonso: \(greeting)")
                content
                    .padding(.trailing, showsAlphonso ? Self.figureColumnWidth - AlphonsoDS.Space.s4 : 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, AlphonsoDS.Space.s3)
        }
        .frame(maxWidth: .infinity, minHeight: Self.figureHeight + Self.bubbleReserve + 48)
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
