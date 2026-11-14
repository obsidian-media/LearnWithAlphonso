import SwiftUI
import UIKit
import LearnWithAlphonsoKit

// The lesson's parts in the round-6 design system (the approved A+B mix, Royal by default): the unit's room with
// Alphonso and the HUD, his speech bubble, the numbered answer buttons, the pressable buttons, the verdict sheet,
// lesson start and lesson complete. The same parts as the web's src/components/lesson/LessonParts.tsx and
// LessonCelebration.tsx. Every colour and type size is a design-system token (`ds.*`, `.dsText`), so Meadow is a
// palette switch and nothing else, and lessons stay light in night mode (`lessonLightScope`).

// MARK: - Art

/// The rooms and Alphonso's lesson expressions, decoded once from their bundle folders.
@MainActor
enum LessonArt {
    private static var cache: [String: UIImage] = [:]

    private static func image(folder: String, name: String) -> UIImage? {
        let key = folder + "/" + name
        if let hit = cache[key] { return hit }
        guard let loaded = UIImage(contentsOfFile: Bundle.main.bundlePath + "/" + key + ".webp") else { return nil }
        let image = loaded.preparingForDisplay() ?? loaded
        cache[key] = image
        return image
    }

    static func room(_ id: String) -> UIImage? {
        image(folder: "AlphonsoScenes", name: id) ?? image(folder: "AlphonsoScenes", name: LessonStage.fallbackRoom)
    }

    static func expression(_ expression: LessonExpression) -> UIImage? {
        image(folder: "AlphonsoLesson", name: expression.rawValue)
    }

}

/// The bundled tables the lesson reads: the unit -> room map and the timing rules. Read once.
enum LessonData {
    static let roomMap: UnitRoomMap? = try? UnitRoomMap.bundled()
    static let timing: LessonTiming? = try? LessonTiming.bundled()
}

// MARK: - Light scope and helpers

private struct LessonLightScope: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.alphonsoDS, AlphonsoDS.colors(AlphonsoThemeManager.shared.paletteID, night: false))
            .environment(\.colorScheme, .light)
    }
}

extension View {
    /// Lessons stay light in night mode: the chosen palette's light values, and a light colour scheme for system
    /// controls. Meadow still comes through the palette setting.
    func lessonLightScope() -> some View { modifier(LessonLightScope()) }

    /// A design-system elevation: its layers as shadows, tinted navy (or the palette's line colour), never black.
    func dsElevation(_ layers: [AlphonsoDS.ShadowLayer], line: Color) -> some View {
        layers.reduce(AnyView(self)) { view, layer in
            AnyView(view.shadow(
                color: (layer.usesLine ? line : AlphonsoDS.Elevation.shadowTint).opacity(layer.opacity),
                radius: layer.blur / 2, x: 0, y: layer.y))
        }
    }
}

/// One of the drawn design-system icons (template images), decorative.
struct DSIconView: View {
    let icon: AlphonsoDS.Icon
    var size: CGFloat = 20

    var body: some View {
        Image(icon.rawValue)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// Rows of views that wrap, for word banks and sentence building.
struct LessonFlowLayout: Layout {
    var spacing: CGFloat = AlphonsoDS.Space.s2

    private func rows(_ subviews: Subviews, width: CGFloat) -> [(index: Int, origin: CGPoint, size: CGSize)] {
        var out: [(Int, CGPoint, CGSize)] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            out.append((index, CGPoint(x: x, y: y), size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return out
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let placed = rows(subviews, width: width)
        let height = placed.map { $0.origin.y + $0.size.height }.max() ?? 0
        let widest = placed.map { $0.origin.x + $0.size.width }.max() ?? 0
        return CGSize(width: proposal.width ?? widest, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for item in rows(subviews, width: bounds.width) {
            subviews[item.index].place(
                at: CGPoint(x: bounds.minX + item.origin.x, y: bounds.minY + item.origin.y),
                proposal: ProposedViewSize(item.size))
        }
    }
}

// MARK: - Buttons

/// The pressable button: a face over a darker bottom edge that it sinks into when pressed. Disabled primary sinks
/// flat ("off").
struct LessonEdgeButtonStyle: ButtonStyle {
    enum Variant { case primary, secondary, right, wrong }
    let variant: Variant

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        let edgeHeight = variant == .secondary ? AlphonsoDS.Edge.secondary : AlphonsoDS.Edge.primary
        let off = !isEnabled && variant == .primary
        let sink = off ? edgeHeight : (configuration.isPressed ? edgeHeight - AlphonsoDS.Edge.pressedSliver : 0)
        return configuration.label
            .dsText(.headline)
            .foregroundStyle(off ? ds.inkFaint : text)
            .multilineTextAlignment(.center)
            .padding(.horizontal, AlphonsoDS.Space.s6)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background { shape.fill(off ? AnyShapeStyle(ds.sunk) : face) }
            .overlay { if variant == .secondary { shape.strokeBorder(ds.line, lineWidth: 2) } }
            .offset(y: sink)
            .background(alignment: .top) {
                shape.fill(off ? Color.clear : edge).offset(y: edgeHeight)
            }
            .padding(.bottom, edgeHeight)
            .opacity(!isEnabled && variant != .primary ? 0.6 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.press), value: configuration.isPressed)
            .contentShape(Rectangle())
    }

    private var face: AnyShapeStyle {
        switch variant {
        case .primary:
            return AnyShapeStyle(LinearGradient(
                stops: [.init(color: ds.actionHi, location: 0), .init(color: ds.action, location: 0.55)],
                startPoint: .top, endPoint: .bottom))
        case .secondary: return AnyShapeStyle(ds.card)
        case .right: return AnyShapeStyle(ds.right)
        case .wrong: return AnyShapeStyle(ds.wrong)
        }
    }

    private var edge: Color {
        switch variant {
        case .primary: return ds.actionEdge
        case .secondary: return ds.line
        case .right: return ds.rightEdge
        case .wrong: return ds.wrongEdge
        }
    }

    private var text: Color {
        switch variant {
        case .primary: return ds.onAction
        case .secondary: return ds.brand
        case .right: return ds.onRight
        case .wrong: return ds.onWrong
        }
    }
}

/// The pressable look shared by the answer buttons and word tiles: a bordered face over a coloured edge.
private struct LessonPressableStyle: ButtonStyle {
    let face: Color
    let border: Color
    let edge: Color
    let radius: CGFloat
    var edgeHeight: CGFloat = AlphonsoDS.Edge.answer
    var dimmed = false
    var pressable = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let sink = pressable && configuration.isPressed ? edgeHeight - AlphonsoDS.Edge.pressedSliver : 0
        return configuration.label
            .background { shape.fill(face) }
            .overlay { shape.strokeBorder(border, lineWidth: 2) }
            .offset(y: sink)
            .background(alignment: .top) { shape.fill(edge).offset(y: edgeHeight) }
            .padding(.bottom, edgeHeight)
            .opacity(dimmed ? 0.48 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// A full-width numbered answer with a pressable bottom edge. The number becomes a tick or a cross with the verdict.
struct LessonAnswerButton: View {
    let index: Int
    let label: String
    let state: LessonAnswerState
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                key
                Text(label)
                    .dsText(.answer)
                    .foregroundStyle(textColor)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        }
        .buttonStyle(LessonPressableStyle(
            face: face, border: border, edge: edge, radius: AlphonsoDS.Radius.control,
            dimmed: state == .dimmed, pressable: state == .idle))
        .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select), value: state)
        .accessibilityLabel(label)
        .accessibilityValue(accessibilityValue)
        .accessibilityAddTraits(state == .selected ? .isSelected : [])
    }

    private var key: some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous)
        return Group {
            switch state {
            case .correct: DSIconView(icon: .check, size: 16)
            case .incorrect: DSIconView(icon: .close, size: 16)
            default: Text("\(index + 1)").dsText(.caption)
            }
        }
        .foregroundStyle(keyText)
        .frame(width: 30, height: 30)
        .background { shape.fill(keyFace) }
        .overlay { shape.strokeBorder(keyBorder, lineWidth: 2) }
        .accessibilityHidden(true)
    }

    private var accessibilityValue: String {
        switch state {
        case .idle, .dimmed: return ""
        case .selected: return "Selected"
        case .correct: return "Correct answer"
        case .incorrect: return "Your answer, not right"
        }
    }

    private var face: Color {
        switch state {
        case .idle, .dimmed: return ds.card
        case .selected: return ds.choiceTint
        case .correct: return ds.rightTint
        case .incorrect: return ds.wrongTint
        }
    }

    private var border: Color {
        switch state {
        case .idle, .dimmed: return ds.line
        case .selected: return ds.choice
        case .correct: return ds.right
        case .incorrect: return ds.wrong
        }
    }

    private var edge: Color {
        switch state {
        case .idle, .dimmed: return ds.line
        case .selected: return ds.choiceEdge
        case .correct: return ds.rightEdge
        case .incorrect: return ds.wrongEdge
        }
    }

    private var textColor: Color {
        switch state {
        case .correct: return ds.rightInk
        case .incorrect: return ds.wrongInk
        default: return ds.brand
        }
    }

    private var keyFace: Color {
        switch state {
        case .idle, .dimmed: return ds.card
        case .selected: return ds.choice
        case .correct: return ds.right
        case .incorrect: return ds.wrong
        }
    }

    private var keyBorder: Color { state == .idle || state == .dimmed ? ds.line : keyFace }

    private var keyText: Color {
        switch state {
        case .idle, .dimmed: return ds.inkSoft
        case .selected: return ds.card
        case .correct: return ds.onRight
        case .incorrect: return ds.onWrong
        }
    }
}

/// A word tile for word banks and sentence building: the answer button's look, without the number. A placed word
/// is solid robe blue; tap it to take it back.
struct LessonWordTile: View {
    let word: String
    var picked = false
    var placed = false
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            Text(word)
                .dsText(.answer)
                .foregroundStyle(placed ? ds.card : ds.brand)
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.vertical, 10)
                .frame(minHeight: 48)
        }
        .buttonStyle(LessonPressableStyle(
            face: placed ? ds.choice : (picked ? ds.choiceTint : ds.card),
            border: placed || picked ? ds.choice : ds.line,
            edge: placed || picked ? ds.choiceEdge : ds.line,
            radius: 14, edgeHeight: placed ? 3 : AlphonsoDS.Edge.answer,
            dimmed: !isEnabled && !placed, pressable: !placed))
        .accessibilityLabel(word)
        .accessibilityHint(placed ? "Removes the word from your sentence" : "")
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}

// MARK: - HUD

/// Close, the thick progress bar and the hearts pill, floating over the room.
struct LessonHUD: View {
    /// 0 to 1.
    let progress: Double
    /// A number, or nil for Alphonso Pro (unlimited, shown as ∞).
    let hearts: Int?
    /// On a plain screen (no room behind it): solid pills and a sunk track.
    var onLight = false
    /// What VoiceOver says for the bar, e.g. "Question 3 of 8".
    var valueText: String?
    let onClose: () -> Void

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var pill: Color { onLight ? ds.card : ds.card.opacity(0.9) }
    private var clamped: Double { min(1, max(0, progress)) }

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Button(action: onClose) {
                DSIconView(icon: .close, size: 20)
                    .foregroundStyle(ds.brand)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(pill))
                    .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(onLight ? ds.sunk : ds.card.opacity(0.6))
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(ds.action)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(ds.actionEdge.opacity(0.6)).frame(height: 3)
                        }
                        .overlay(alignment: .top) {
                            Rectangle().fill(ds.card.opacity(0.42)).frame(height: 3).padding(.horizontal, 4)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .frame(width: geo.size.width * clamped)
                }
            }
            .frame(height: 16)
            .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.progress), value: clamped)
            .accessibilityElement()
            .accessibilityLabel("Lesson progress")
            .accessibilityValue(valueText ?? "\(Int((clamped * 100).rounded())) percent")

            HStack(spacing: 6) {
                DSIconView(icon: .heartSolid, size: 22).foregroundStyle(ds.heart)
                Text(hearts.map { "\($0)" } ?? "\u{221E}")
                    .dsText(.headline)
                    .monospacedDigit()
                    .foregroundStyle(ds.ink)
            }
            .padding(.leading, 10)
            .padding(.trailing, 14)
            .frame(height: 40)
            .background(Capsule().fill(pill))
            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(hearts.map { "\($0) hearts" } ?? "Unlimited hearts")
        }
    }
}

// MARK: - Room

/// The unit's room with Alphonso standing in it, bottom-centred and slightly cut by the bubble. His expression swaps
/// with a short crossfade (none under Reduce Motion). The room runs up under the status bar (`topInset`); the
/// overlay (the HUD, a title, confetti) sits above everything.
struct LessonRoomView<Overlay: View>: View {
    let roomID: String
    let expression: LessonExpression
    let height: CGFloat
    let alphonsoWidth: CGFloat
    var topInset: CGFloat = 0
    var glow = false
    /// Darken the foot of the room for a title over it (lesson start).
    var titleScrim = false
    @ViewBuilder var overlay: () -> Overlay

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let total = geo.size.height
            ZStack(alignment: .top) {
                ds.sunk
                if let art = LessonArt.room(roomID) {
                    let scaledHeight = max(total, width * art.size.height / max(1, art.size.width))
                    let scaledWidth = scaledHeight * art.size.width / max(1, art.size.height)
                    Image(uiImage: art)
                        .resizable()
                        .frame(width: scaledWidth, height: scaledHeight)
                        // "center 38%": the room's focus sits a little above the middle.
                        .offset(y: -(scaledHeight - total) * 0.38)
                        .frame(width: width, height: total, alignment: .top)
                }
                LinearGradient(
                    stops: titleScrim
                        ? [.init(color: ds.heroB.opacity(0.46), location: 0), .init(color: .clear, location: 0.3),
                           .init(color: .clear, location: 0.48), .init(color: ds.heroB.opacity(0.72), location: 1)]
                        : [.init(color: ds.heroB.opacity(0.46), location: 0), .init(color: .clear, location: 0.3),
                           .init(color: .clear, location: 0.62), .init(color: ds.surface, location: 1)],
                    startPoint: .top, endPoint: .bottom)
                if glow {
                    RadialGradient(
                        colors: [ds.onHeroKick.opacity(0.55), .clear], center: UnitPoint(x: 0.5, y: 0.64),
                        startRadius: 0, endRadius: width * 0.6)
                }
                ZStack {
                    ForEach([expression], id: \.self) { current in
                        Group {
                            if let art = LessonArt.expression(current) {
                                Image(uiImage: art).resizable().scaledToFit()
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .frame(width: alphonsoWidth, height: alphonsoWidth)
                .position(x: width / 2, y: total - alphonsoWidth / 2 + LessonStage.alphonsoSink)
                .animation(reduceMotion ? nil : .easeInOut(duration: AlphonsoDS.Motion.swap), value: expression)
                .accessibilityElement()
                .accessibilityLabel(expression.accessibilityLabel)
                .accessibilityAddTraits(.isImage)
                overlay()
            }
            .frame(width: width, height: total)
            .clipped()
        }
        .frame(height: height + topInset)
    }
}

// MARK: - Speech bubble

/// Alphonso's line: a play button that reads it aloud, a small label ("Alphonso asks") and the text. The tail
/// points up at him.
struct AlphonsoBubbleView: View {
    let label: String
    let text: String
    var onPlay: (() -> Void)?
    var playLabel = "Play the question"
    var compact = false
    var isHeading = true

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
            Group {
                if let onPlay {
                    Button(action: onPlay) {
                        DSIconView(icon: .play, size: 20)
                            .foregroundStyle(ds.choice)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(ds.choiceTint))
                            .overlay(Circle().strokeBorder(ds.choice.opacity(0.18), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(playLabel)
                } else {
                    DSIconView(icon: .speaker, size: 20)
                        .foregroundStyle(ds.choice)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(ds.choiceTint))
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .dsText(.overline)
                    .foregroundStyle(ds.actionText)
                    .padding(.top, 2)
                Text(text)
                    .dsText(compact ? .questionSmall : .question)
                    .foregroundStyle(ds.brand)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(isHeading ? .isHeader : [])
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .padding(.leading, 14)
        .padding(.trailing, AlphonsoDS.Space.s4)
        .background {
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card)
        }
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(ds.card)
                .frame(width: 18, height: 18)
                .rotationEffect(.degrees(45))
                .offset(y: -7)
                .accessibilityHidden(true)
        }
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
    }
}

// MARK: - Inputs

/// The written-answer field in the lesson's answer style.
struct LessonTextField: View {
    let placeholder: String
    @Binding var text: String
    var axis: Axis = .horizontal

    @Environment(\.alphonsoDS) private var ds
    @FocusState private var focused: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(ds.inkFaint), axis: axis)
            .dsText(.answer)
            .foregroundStyle(ds.ink)
            .lineLimit(axis == .vertical ? 2...6 : 1...1)
            .textFieldStyle(.plain)
            .focused($focused)
            .padding(AlphonsoDS.Space.s4)
            .background { shape.fill(ds.card) }
            .overlay { shape.strokeBorder(focused ? ds.choice : ds.line, lineWidth: 2) }
            .background(alignment: .top) { shape.fill(ds.line).offset(y: AlphonsoDS.Edge.answer) }
            .padding(.bottom, AlphonsoDS.Edge.answer)
            .accessibilityLabel("Your answer")
    }
}

/// A small card on the lesson's surface: the speaking phrase, a transcript, a note.
struct LessonCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2, content: content)
            .padding(AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(ds.card))
            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
    }
}

// MARK: - Verdict sheet

/// The verdict, pinned to the bottom of the lesson: Alphonso's face, Exactly! or Not quite, the XP for a right
/// answer (only XP the server will pay), the correct answer first when you missed (with a speaker), the one-line
/// why, and the button on. It slides up (a fade under Reduce Motion, set by the caller's transition). Long reasons
/// scroll inside it while the button stays put.
struct LessonVerdictSheet<Explanation: View>: View {
    private static var explanationMaxHeight: CGFloat { 116 }
    private static var extraMaxHeight: CGFloat { 260 }
    @State private var explanationHeight: CGFloat = 0
    @State private var extraHeight: CGFloat = 0
    let correct: Bool
    let title: String
    /// "+N XP" when this right answer pays, else nil.
    let xp: Int?
    let correctAnswer: String?
    var onHearAnswer: (() -> Void)?
    let continueTitle: String
    let onContinue: () -> Void
    /// Optional content between the explanation and the button (the "Explain in <language>" chip and card). Nil draws
    /// nothing, so every other caller is unchanged.
    var extra: AnyView? = nil
    @ViewBuilder var explanation: () -> Explanation

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                face
                Text(title)
                    .dsText(.title)
                    .foregroundStyle(correct ? ds.rightInk : ds.wrongInk)
                Spacer(minLength: 0)
                if let xp {
                    HStack(spacing: 4) {
                        DSIconView(icon: .boltSolid, size: 16).foregroundStyle(ds.xp)
                        Text("+\(xp) XP").dsText(.footnote).foregroundStyle(ds.rightInk)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(ds.card))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Plus \(xp) XP")
                }
            }
            if !correct, let correctAnswer, !correctAnswer.isEmpty {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Correct answer").dsText(.overline).foregroundStyle(ds.wrongInk)
                        Text(correctAnswer).dsText(.headline).foregroundStyle(ds.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    Spacer(minLength: 0)
                    if let onHearAnswer {
                        Button(action: onHearAnswer) {
                            DSIconView(icon: .speaker, size: 18)
                                .foregroundStyle(ds.choice)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(ds.card))
                                .overlay(Circle().strokeBorder(ds.line, lineWidth: 1.5))
                                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Hear the correct answer")
                    }
                }
                .padding(.horizontal, AlphonsoDS.Space.s3)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(ds.card.opacity(0.75)))
            }
            // As tall as the explanation, up to 116 pt; a longer one scrolls inside the sheet.
            ScrollView {
                explanation()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { explanationHeight = $0 }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: min(explanationHeight, Self.explanationMaxHeight))
            if let extra {
                // As tall as its content, up to a cap; a long explanation scrolls inside the sheet.
                ScrollView {
                    extra
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { extraHeight = $0 }
                }
                .scrollBounceBehavior(.basedOnSize)
                .frame(height: min(extraHeight, Self.extraMaxHeight))
            }
            Button(continueTitle, action: onContinue)
                .buttonStyle(LessonEdgeButtonStyle(variant: correct ? .right : .wrong))
                .padding(.top, 2)
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.top, AlphonsoDS.Space.s5)
        .padding(.bottom, AlphonsoDS.Space.s2)
        .background {
            UnevenRoundedRectangle(
                topLeadingRadius: AlphonsoDS.Radius.sheet, topTrailingRadius: AlphonsoDS.Radius.sheet,
                style: .continuous)
                .fill(correct ? ds.rightTint : ds.wrongTint)
                .ignoresSafeArea(edges: .bottom)
                .dsElevation(AlphonsoDS.Elevation.sheet, line: ds.line)
        }
        .accessibilityElement(children: .contain)
        .onAppear {
            let spoken = correct ? (xp.map { "\(title) Plus \($0) XP." } ?? title) : "\(title). The correct answer is \(correctAnswer ?? "")."
            AccessibilityNotification.Announcement(spoken).post()
        }
    }

    private var face: some View {
        Group {
            if let art = LessonArt.expression(correct ? .happy : .hmm) {
                Image(uiImage: art)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(1.9, anchor: UnitPoint(x: 0.5, y: 0.24))
            }
        }
        .frame(width: 56, height: 56)
        .background(ds.card)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(ds.card, lineWidth: 3))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .accessibilityHidden(true)
    }
}

// MARK: - Lesson start

struct LessonStartStep: Identifiable {
    let id: String
    let icon: AlphonsoDS.Icon
    let label: String
    let detail: String
}

/// Lesson start, set in the unit's room: the unit and title over it, the honest estimate ("About 4 min · 8
/// questions · Up to 100 XP"), the steps, and the gold Start button pinned at the foot.
struct LessonStartView: View {
    let roomID: String
    let unitLine: String
    let title: String
    let meta: String
    let steps: [LessonStartStep]
    let hearts: Int?
    let topInset: CGFloat
    let onClose: () -> Void
    let onStart: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                LessonRoomView(
                    roomID: roomID, expression: .talk, height: 380, alphonsoWidth: 335, topInset: topInset,
                    titleScrim: true
                ) {
                    VStack(spacing: 0) {
                        LessonHUD(progress: 0, hearts: hearts, onClose: onClose)
                            .padding(.horizontal, AlphonsoDS.Space.s4)
                            .padding(.top, topInset + AlphonsoDS.Space.s4)
                        Spacer(minLength: 0)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(unitLine)
                                .dsText(.overline)
                                .foregroundStyle(ds.onHeroKick)
                                .shadow(color: ds.heroB, radius: 4, y: 1)
                            Text(title)
                                .dsText(.displayXL)
                                .foregroundStyle(ds.onHero)
                                .shadow(color: ds.heroB.opacity(0.6), radius: 6, y: 2)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityAddTraits(.isHeader)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)
                        .padding(.bottom, AlphonsoDS.Space.s4)
                    }
                }
                Text(meta)
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
                    .padding(.horizontal, 18)
                    .padding(.top, AlphonsoDS.Space.s3)
                VStack(spacing: AlphonsoDS.Space.s2) {
                    ForEach(steps) { step in
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            DSIconView(icon: step.icon, size: 20)
                                .foregroundStyle(ds.actionText)
                                .frame(width: 36, height: 36)
                                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(ds.choiceTint))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(step.label).dsText(.headline).foregroundStyle(ds.brand)
                                Text(step.detail).dsText(.caption).foregroundStyle(ds.inkSoft).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, AlphonsoDS.Space.s3)
                        .padding(.vertical, 10)
                        .background {
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card)
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                                .strokeBorder(ds.line, lineWidth: 2)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.top, AlphonsoDS.Space.s3)
            }
        }
        .ignoresSafeArea(edges: .top)
        .scrollBounceBehavior(.basedOnSize)
        .background(ds.surface)
        .safeAreaInset(edge: .bottom) {
            Button("Start lesson", action: onStart)
                .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.top, AlphonsoDS.Space.s3)
                .padding(.bottom, AlphonsoDS.Space.s2)
                .background(ds.surface)
        }
    }
}

// MARK: - Lesson complete

/// The lesson-complete confetti over the room: falls once, then rests as a still scatter; under Reduce Motion only
/// the scatter. The robe's colours only (Confetti in the Kit holds the numbers, the same as the web).
struct LessonConfettiView: View {
    let reduce: Bool
    var seed = 7

    @Environment(\.alphonsoDS) private var ds
    @State private var start = Date()
    @State private var settled = false

    var body: some View {
        GeometryReader { geo in
            let pieces = Confetti.pieces(seed: seed, width: geo.size.width)
            TimelineView(.animation(minimumInterval: nil, paused: reduce || settled)) { timeline in
                Canvas { context, _ in
                    // 150 ms after the room appears, per the spec's timeline.
                    let t = timeline.date.timeIntervalSince(start) - 0.15
                    for piece in pieces {
                        if reduce || settled || t >= Confetti.seconds {
                            draw(piece, x: piece.restX, y: piece.restY, angle: piece.rot, in: context)
                        } else if t >= 0 {
                            let at = Confetti.position(of: piece, at: t)
                            draw(piece, x: at.x, y: at.y, angle: at.angle, in: context)
                        }
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            guard !reduce else { return }
            try? await Task.sleep(for: .seconds(Confetti.seconds + 0.2))
            settled = true
        }
    }

    private func color(_ c: Confetti.Color) -> Color {
        switch c {
        case .xp: return ds.xp
        case .onHeroKick: return ds.onHeroKick
        case .brand: return ds.brand
        case .choice: return ds.choice
        case .card: return ds.card
        case .xpEdge: return ds.xpEdge
        }
    }

    private func draw(_ piece: Confetti.Piece, x: Double, y: Double, angle: Double, in context: GraphicsContext) {
        var c = context
        c.translateBy(x: x, y: y)
        c.rotate(by: .radians(angle))
        let path: Path
        if piece.star {
            path = Path { p in
                for k in 0..<10 {
                    let r: Double = k % 2 == 1 ? 3 : 7
                    let a = Double(k) * .pi / 5
                    let point = CGPoint(x: cos(a) * r, y: sin(a) * r)
                    if k == 0 { p.move(to: point) } else { p.addLine(to: point) }
                }
                p.closeSubpath()
            }
        } else {
            path = Path(CGRect(x: -piece.w / 2, y: -piece.h / 2, width: piece.w, height: piece.h))
        }
        c.fill(path, with: .color(color(piece.color)))
    }
}

/// One reward tile: a coloured top edge, an icon, a condensed number that counts up, and its name.
struct LessonRewardTile: View {
    enum Kind { case xp, streak, accuracy, time }
    let kind: Kind
    let value: String
    let index: Int
    let reduce: Bool

    @Environment(\.alphonsoDS) private var ds
    @State private var shown = false
    @State private var counted = false

    private var title: String {
        switch kind {
        case .xp: return "XP earned"
        case .streak: return "Day streak"
        case .accuracy: return "Accuracy"
        case .time: return "Time"
        }
    }

    private var spokenTitle: String {
        switch kind {
        case .xp: return "XP"
        case .streak: return "Streak"
        case .accuracy: return "Accuracy"
        case .time: return "Time"
        }
    }

    private var icon: AlphonsoDS.Icon {
        switch kind {
        case .xp: return .boltSolid
        case .streak: return .flameSolid
        case .accuracy: return .target
        case .time: return .clock
        }
    }

    private var tone: Color {
        switch kind {
        case .xp: return ds.xp
        case .streak: return ds.flame
        case .accuracy: return ds.choice
        case .time: return ds.brand
        }
    }

    private var tint: Color {
        switch kind {
        case .xp: return ds.xpTint
        case .streak: return ds.flameTint
        case .accuracy: return ds.choiceTint
        case .time: return ds.sunk
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            DSIconView(icon: icon, size: 20)
                .foregroundStyle(tone)
                .frame(width: 34, height: 34)
                .background(Circle().fill(tint))
                .padding(.bottom, 2)
            Group {
                if kind != .time, let split = RewardCountUp.split(value) {
                    CountingText(number: Double(reduce || counted ? split.number : 0), prefix: split.prefix, suffix: split.suffix)
                } else {
                    Text(value)
                }
            }
            .dsText(.numeralXL)
            .foregroundStyle(ds.ink)
            Text(title).dsText(.caption).foregroundStyle(ds.inkSoft)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .padding(.vertical, AlphonsoDS.Space.s3)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(ds.card))
        .overlay(alignment: .top) { Rectangle().fill(tone).frame(height: 4) }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .opacity(reduce || shown ? 1 : 0)
        .offset(y: reduce || shown ? 0 : 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(spokenTitle): \(value)")
        .onAppear {
            guard !reduce else { return }
            let delay = 0.6 + Double(index) * 0.12
            withAnimation(.easeOut(duration: AlphonsoDS.Motion.sheetWeb).delay(delay)) { shown = true }
            withAnimation(.easeOut(duration: RewardCountUp.duration).delay(delay + 0.1)) { counted = true }
        }
    }
}

/// A new achievement: a gold medal on navy. Toasts slide in 250 ms apart after the tiles (a fade under Reduce Motion).
struct LessonAchievementToast: View {
    /// The achievement's id: the medallion drawn is that badge's own art.
    let id: String
    let title: String
    let detail: String
    let index: Int
    let reduce: Bool
    /// A tap opens the unlock sheet.
    var onTap: (() -> Void)?

    @Environment(\.alphonsoDS) private var ds
    @State private var shown = false

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            BadgeMedallion(id: id, size: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2, state: .earned)
            VStack(alignment: .leading, spacing: 1) {
                Text("Achievement unlocked").dsText(.overline).foregroundStyle(ds.onHeroKick)
                Text(title).dsText(.headline).foregroundStyle(ds.onHero)
                Text(detail).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, AlphonsoDS.Space.s3)
        .padding(.leading, AlphonsoDS.Space.s3)
        .padding(.trailing, 14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(ds.hero))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        .opacity(shown ? 1 : 0)
        .offset(y: shown || reduce ? 0 : -16)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(onTap == nil ? [] : .isButton)
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
        .onAppear {
            withAnimation(.easeOut(duration: reduce ? AlphonsoDS.Motion.reducedMax : AlphonsoDS.Motion.sheetWeb)
                .delay(reduce ? 0 : 1.7 + Double(index) * 0.25)) { shown = true }
        }
    }
}

/// One missed question on the complete screen, to practice again.
struct LessonMissedItem: Identifiable {
    let id: String
    let prompt: String
    let yours: String
    let answer: String
}

/// Lesson complete, celebrated in the unit's room in code: confetti in the robe's colours, Alphonso going "wow"
/// then smiling, his line in the bubble, reward tiles that count up (XP, streak, accuracy, time), the XP lines that
/// add up to the award, the hearts bonus, achievement toasts and the review list. `extras` carries the rest of the
/// existing mechanics (Practice with Hector, the reminder card, generated practice). Reduce Motion: a still scatter,
/// final numbers, fades only.
struct LessonCompleteView<Extras: View>: View {
    let roomID: String
    let headline: String
    let chips: [LessonRewardChip]
    let time: String?
    let xpLines: [LessonXP.Line]
    let correct: Int
    let total: Int
    let heartsBonus: String?
    let achievements: [Achievement]
    let missed: [LessonMissedItem]
    let topInset: CGFloat
    var onHearHeadline: (() -> Void)?
    let continueTitle: String
    let onContinue: () -> Void
    @ViewBuilder var extras: () -> Extras

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var amazed = true
    @State private var appeared = false
    /// The achievement whose unlock sheet is open: the first new one shows after the celebration, the toast reopens it.
    @State private var unlockShown: Achievement?

    private var tiles: [(kind: LessonRewardTile.Kind, value: String)] {
        var out: [(kind: LessonRewardTile.Kind, value: String)] = chips.map { chip -> (kind: LessonRewardTile.Kind, value: String) in
            switch chip.kind {
            case .xp: return (kind: .xp, value: chip.value)
            case .streak: return (kind: .streak, value: chip.value)
            case .accuracy: return (kind: .accuracy, value: chip.value)
            }
        }
        if let time { out.append((kind: .time, value: time)) }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                LessonRoomView(
                    roomID: roomID, expression: amazed && !reduceMotion ? .wow : .happy, height: 430,
                    alphonsoWidth: 345, topInset: topInset, glow: true
                ) {
                    LessonConfettiView(reduce: reduceMotion)
                    Text("Lesson complete")
                        .dsText(.displayXL)
                        .foregroundStyle(ds.onHero)
                        .shadow(color: ds.heroB.opacity(0.45), radius: 8, y: 2)
                        .frame(maxWidth: .infinity)
                        .padding(.top, topInset + 48)
                        .accessibilityAddTraits(.isHeader)
                }
                .opacity(appeared || reduceMotion ? 1 : 0)

                VStack(spacing: 14) {
                    AlphonsoBubbleView(
                        label: "Alphonso says", text: headline, onPlay: onHearHeadline, playLabel: "Hear Alphonso",
                        compact: true, isHeading: false)
                        .padding(.top, -36)
                    let columns = Array(
                        repeating: GridItem(.flexible(), spacing: 10), count: tiles.count == 4 ? 2 : max(1, tiles.count))
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(Array(tiles.enumerated()), id: \.offset) { index, tile in
                            LessonRewardTile(kind: tile.kind, value: tile.value, index: index, reduce: reduceMotion)
                        }
                    }
                    if xpLines.count > 1 {
                        LessonFlowLayout(spacing: AlphonsoDS.Space.s4) {
                            ForEach(xpLines, id: \.kind) { line in
                                Text(line.text).dsText(.footnote).foregroundStyle(ds.inkSoft)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    Text("\(correct)/\(total) correct")
                        .dsText(.footnote)
                        .monospacedDigit()
                        .foregroundStyle(ds.inkSoft)
                    if let heartsBonus {
                        HStack(spacing: 6) {
                            DSIconView(icon: .heartSolid, size: 18).foregroundStyle(ds.heart)
                            Text(heartsBonus == "streak" ? "Streak milestone: hearts fully refilled" : "Perfect lesson: +1 heart")
                                .dsText(.footnote)
                                .foregroundStyle(ds.heartText)
                        }
                        .padding(.leading, 10)
                        .padding(.trailing, 14)
                        .frame(minHeight: 34)
                        .background(Capsule().fill(ds.heartTint))
                        .accessibilityElement(children: .combine)
                    }
                    if !achievements.isEmpty {
                        VStack(spacing: AlphonsoDS.Space.s2) {
                            ForEach(Array(achievements.enumerated()), id: \.element.id) { index, achievement in
                                LessonAchievementToast(
                                    id: achievement.id, title: achievement.title, detail: achievement.description, index: index,
                                    reduce: reduceMotion, onTap: { unlockShown = achievement })
                            }
                        }
                    }
                    extras()
                    if !missed.isEmpty {
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                            Text("Review \u{00B7} \(missed.count) to practice again")
                                .dsText(.overline)
                                .foregroundStyle(ds.inkSoft)
                            ForEach(missed) { item in
                                LessonCard {
                                    Text(item.prompt).dsText(.footnote).foregroundStyle(ds.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                    (Text("You said ") + Text(item.yours).strikethrough() + Text(" \u{00B7} ")
                                        + Text(item.answer).foregroundStyle(ds.rightInk))
                                        .dsText(.caption)
                                        .foregroundStyle(ds.inkSoft)
                                        .accessibilityLabel("You said \(item.yours). Answer: \(item.answer)")
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.bottom, AlphonsoDS.Space.s4)
            }
        }
        .ignoresSafeArea(edges: .top)
        .background(ds.surface)
        .safeAreaInset(edge: .bottom) {
            Button(continueTitle, action: onContinue)
                .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.top, AlphonsoDS.Space.s3)
                .padding(.bottom, AlphonsoDS.Space.s2)
                .background(ds.surface.opacity(0.95))
                .overlay(alignment: .top) { Rectangle().fill(ds.line).frame(height: 1) }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.3)) { appeared = true }
        }
        .task {
            // He says "wow", then smiles (1.4 s in). Under Reduce Motion he is already smiling.
            guard !reduceMotion else { return }
            try? await Task.sleep(for: .seconds(1.4))
            amazed = false
            // The first new achievement slides up once the celebration has played. Reduce Motion: only on a tap.
            try? await Task.sleep(for: .seconds(1.6))
            if unlockShown == nil, let first = achievements.first { unlockShown = first }
        }
        .sheet(item: $unlockShown) { achievement in
            AchievementUnlockSheet(achievement: achievement) { unlockShown = nil }
        }
    }
}

// MARK: - Speak and translate parts

/// A short note on the lesson's surface, such as the translation grader's reason.
struct LessonNoteCard: View {
    let text: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        LessonCard {
            Text(text).dsText(.footnote).foregroundStyle(ds.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The phrase to say, with "Hear it first".
struct LessonSpeakPhraseCard: View {
    let phrase: String
    let onHear: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        LessonCard {
            Text("Your phrase").dsText(.overline).foregroundStyle(ds.inkSoft)
            Text(phrase).dsText(.title).foregroundStyle(ds.brand).fixedSize(horizontal: false, vertical: true)
            Button(action: onHear) {
                HStack(spacing: 6) {
                    DSIconView(icon: .speaker, size: 18)
                    Text("Hear it first").dsText(.headline)
                }
                .foregroundStyle(ds.choice)
                .padding(.horizontal, 14)
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .background(Capsule().fill(ds.choiceTint))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Surfaces and cards

private struct LessonSurface: ViewModifier {
    @Environment(\.alphonsoDS) private var ds
    func body(content: Content) -> some View { content.background(ds.surface) }
}

extension View {
    /// The lesson's screen colour behind a view.
    func lessonSurface() -> some View { modifier(LessonSurface()) }
}

/// The sentence being built in a word-order question: a dashed well holding the placed words.
struct LessonSentenceSlot<Content: View>: View {
    let isEmpty: Bool
    @ViewBuilder var content: () -> Content
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        Group {
            if isEmpty {
                Text("Tap the words below in order")
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
            } else {
                LessonFlowLayout { content() }
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .topLeading)
        .background(shape.fill(ds.sunk))
        .overlay(shape.strokeBorder(ds.line, style: StrokeStyle(lineWidth: 2, dash: [6, 5])))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your sentence")
    }
}

/// The in-app reminder card on lesson complete (from the second lesson). The system dialog only follows "Remind me".
struct LessonReminderCard: View {
    let onRemindMe: () -> Void
    let onNotNow: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        LessonCard {
            Text(ReminderPromptCopy.title).dsText(.headline).foregroundStyle(ds.brand).accessibilityAddTraits(.isHeader)
            Text(ReminderPromptCopy.body).dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Button(ReminderPromptCopy.decline, action: onNotNow).buttonStyle(LessonEdgeButtonStyle(variant: .secondary))
                    Button(ReminderPromptCopy.accept, action: onRemindMe).buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                }
                VStack(spacing: AlphonsoDS.Space.s2) {
                    Button(ReminderPromptCopy.accept, action: onRemindMe).buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                    Button(ReminderPromptCopy.decline, action: onNotNow).buttonStyle(LessonEdgeButtonStyle(variant: .secondary))
                }
            }
        }
        .onAppear { AccessibilityNotification.Announcement(ReminderPromptCopy.title).post() }
    }
}
