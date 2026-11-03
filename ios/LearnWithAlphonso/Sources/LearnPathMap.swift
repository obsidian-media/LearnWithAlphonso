import LearnWithAlphonsoKit
import SwiftUI

/// One lesson on the Learn map: where it is in the unit, and what to call it for VoiceOver.
struct PathMapNode: Identifiable, Equatable {
    let id: String
    let title: String
    let state: UnitPathState
}

/// The current unit's lessons as a winding path of big round 3D nodes over the garden clip. Alphonso waves in the
/// clip beside the current one (room kept clear for him here) and his greeting is read out from this view. Look and layout only: tapping the
/// current node calls `onOpen` with its lesson id, which the host answers exactly like the Up next card's Continue.
struct LearnPathMap: View {
    static let nodeSize: CGFloat = 72
    static let currentNodeSize: CGFloat = 92
    static let figureHeight: CGFloat = 190

    private static let rowHeight: CGFloat = 104
    private static let currentRowHeight: CGFloat = 134
    /// Room above the figure's head for the speech bubble.
    private static let bubbleReserve: CGFloat = 96
    private static let figureColumnWidth: CGFloat = 150

    let nodes: [PathMapNode]
    let greeting: String
    let onOpen: (String) -> Void

    private var currentIndex: Int? { nodes.firstIndex { $0.state == .next } }

    private func rowHeight(_ node: PathMapNode) -> CGFloat {
        node.state == .next ? Self.currentRowHeight : Self.rowHeight
    }

    /// The path wanders on the left of the screen and Alphonso stands on the right, so he never overlaps a node.
    /// The nodes either side of the current one stay on its line; further out the path swings to and fro.
    private func xFraction(index: Int) -> CGFloat {
        let current = currentIndex ?? 0
        let distance = abs(index - current)
        if distance <= 1 { return 0.27 }
        return distance % 2 == 0 ? 0.55 : 0.27
    }

    /// Layout in one pass: each node's centre, the room needed above the first row, and the total height.
    private func layout() -> (centres: [CGFloat], top: CGFloat, total: CGFloat) {
        var y: CGFloat = 0
        var centres: [CGFloat] = []
        for node in nodes {
            centres.append(y + rowHeight(node) / 2)
            y += rowHeight(node)
        }
        let currentCentre = currentIndex.map { centres[$0] } ?? 0
        let figureTopFromRows = currentCentre + Self.currentNodeSize / 2 - Self.figureHeight - Self.bubbleReserve
        let top = max(12, -figureTopFromRows)
        return (centres, top, top + y + 12)
    }

    var body: some View {
        let l = layout()
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .topLeading) {
                trail(width: width, centres: l.centres, top: l.top)

                ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                    nodeView(node)
                        .position(x: width * xFraction(index: index), y: l.top + l.centres[index])
                }

                if let current = currentIndex {
                    // Alphonso waves in the garden clip behind the screen, and his speech bubble is pinned above him on the
                    // clip (LessonBrowserView), so both are decorative there. This is the room he stands in, kept clear of
                    // nodes, and the one place VoiceOver hears the greeting.
                    let figureCentreX = width * 0.76
                    let figureBottom = l.top + l.centres[current] + Self.currentNodeSize / 2
                    Color.clear
                        .frame(width: Self.figureColumnWidth, height: Self.figureHeight + 8)
                        .offset(x: figureCentreX - Self.figureColumnWidth / 2, y: figureBottom - Self.figureHeight)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Alphonso: \(greeting)")
                }
            }
            .frame(width: width, height: l.total, alignment: .topLeading)
        }
        .frame(height: l.total)
    }

    /// The dotted trail the nodes sit on. Decorative.
    private func trail(width: CGFloat, centres: [CGFloat], top: CGFloat) -> some View {
        Path { path in
            for (index, centre) in centres.enumerated() {
                let point = CGPoint(x: width * xFraction(index: index), y: top + centre)
                if index == 0 {
                    path.move(to: point)
                } else {
                    let previous = CGPoint(x: width * xFraction(index: index - 1), y: top + centres[index - 1])
                    let midY = (previous.y + point.y) / 2
                    path.addCurve(
                        to: point,
                        control1: CGPoint(x: previous.x, y: midY),
                        control2: CGPoint(x: point.x, y: midY)
                    )
                }
            }
        }
        .stroke(.white.opacity(0.8), style: StrokeStyle(lineWidth: 8, lineCap: .round, dash: [1, 16]))
        .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func nodeView(_ node: PathMapNode) -> some View {
        if node.state == .next {
            Button {
                onOpen(node.id)
            } label: {
                PathNodeView(state: node.state)
                    .frame(minWidth: AlphonsoSpacing.minTouchTarget, minHeight: AlphonsoSpacing.minTouchTarget)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(node.title), current lesson")
            .accessibilityAddTraits(.isButton)
        } else {
            PathNodeView(state: node.state)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(node.title), \(node.state == .done ? "completed" : "locked")")
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

/// A chunky round lesson node: a 3D icon on a coloured disc with a darker bottom edge, like the chunky buttons.
/// Done is a mint stack of books, locked is a grey padlock, and the current one is bigger, glows and bounces.
struct PathNodeView: View {
    let state: UnitPathState

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bouncing = false

    private var size: CGFloat { state == .next ? LearnPathMap.currentNodeSize : LearnPathMap.nodeSize }
    private var edge: CGFloat { state == .next ? 8 : 6 }

    private var emoji: String {
        switch state {
        case .done: return "\u{1F4DA}"
        case .next: return "\u{1F3AF}"
        case .locked: return "\u{1F512}"
        }
    }

    private var face: Color {
        switch state {
        case .done: return AlphonsoTileTone.mint.background
        case .next: return AlphonsoTileTone.sun.background
        case .locked: return AlphonsoColor.hairline
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            if state == .next {
                Circle()
                    .fill(RadialGradient(colors: [.white.opacity(0.85), .white.opacity(0)], center: .center, startRadius: 0, endRadius: size * 0.85))
                    .frame(width: size * 1.7, height: size * 1.7)
                    .offset(y: -size * 0.35)
            }
            // The darker bottom edge: the same disc, shaded, pushed down behind the face.
            Circle()
                .fill(face)
                .overlay(Circle().fill(Color.black.opacity(0.3)))
                .frame(width: size, height: size)
                .offset(y: edge)
            Circle()
                .fill(face)
                .overlay(Circle().strokeBorder(.white.opacity(state == .locked ? 0.4 : 0.9), lineWidth: state == .next ? 4 : 2))
                .frame(width: size, height: size)
                .shadow(color: state == .next ? AlphonsoColor.ember.opacity(0.55) : .clear, radius: 24)
            Icon3DView(emoji: emoji, size: size * 0.55)
                .frame(width: size, height: size)
                .saturation(state == .locked ? 0 : 1)
                .opacity(state == .locked ? 0.75 : 1)
        }
        .frame(width: size * 1.7, height: size + edge, alignment: .top)
        .offset(y: bouncing ? -8 : 0)
        .onAppear { updateBounce() }
        // Reduce Motion switched on mid-session stops the bounce; switched off starts it again.
        .onChange(of: reduceMotion) { _, _ in updateBounce() }
    }

    private func updateBounce() {
        guard state == .next, !reduceMotion else {
            withAnimation(nil) { bouncing = false }
            return
        }
        withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
            bouncing = true
        }
    }
}
