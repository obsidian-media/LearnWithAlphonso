import SwiftUI
import LearnWithAlphonsoKit

// The shared building blocks of the round-6 screens that were still system lists and forms (Review, Build my
// path, Duels, Friends, League, Teams, Out of hearts): the overline, the card, the glass title, the chip, the
// segmented control, the pill, the hero, the pressable button, the input field and the list-row and scene helpers.
// Every colour, size and type role is a design-system token (`ds.*`, `AlphonsoDS.*`, `.dsText`), so a palette or a
// night setting changes them and nothing else. Nothing here holds a number of its own.

// MARK: - Overline and title

/// A section's small-capitals label. It sits on a glass pill so it stays legible over a scene, never straight on
/// the picture.
struct DSOverline: View {
    let text: String
    @Environment(\.alphonsoDS) private var ds

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .dsText(.overline)
            .foregroundStyle(ds.actionText)
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .padding(.vertical, AlphonsoDS.Space.s1 + 2)
            .alphonsoGlass(radius: AlphonsoDS.Radius.pill)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The screen's title on a glass card, with an optional line of facts under it.
struct DSGlassTitle: View {
    let title: String
    var subtitle: String?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            Text(title).dsText(.display).foregroundStyle(ds.brand)
                .accessibilityAddTraits(.isHeader)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s4)
        .alphonsoGlass(radius: AlphonsoDS.Radius.bubble)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Cards

/// A card on the screen's surface: the DS card colour, the bubble radius, the resting elevation.
struct DSCard<Content: View>: View {
    var padding: CGFloat = AlphonsoDS.Space.s4
    var spacing: CGFloat = AlphonsoDS.Space.s3
    /// A tint behind the card (the learner's own row), or nil for the plain card colour.
    var fill: Color?
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .fill((fill ?? ds.card).opacity(0.94)))
            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
    }
}

/// The hero: the navy gradient card the My path card uses, with white text.
struct DSHeroCard<Content: View>: View {
    var spacing: CGFloat = AlphonsoDS.Space.s2
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .foregroundStyle(ds.onHero)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AlphonsoDS.Space.s4)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .fill(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)))
            .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
    }
}

/// A thin progress bar on a card (a duel's head to head, a mission, a goal).
struct DSProgressBar: View {
    let fraction: Double
    var onHero = false
    var tint: Color?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(onHero ? ds.onHeroSoft.opacity(0.3) : ds.sunk)
                Capsule().fill(tint ?? (onHero ? ds.xp : ds.action))
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: AlphonsoDS.Space.s3)
        .accessibilityHidden(true)
    }
}

/// An empty or failed state: Alphonso (or a 3D icon) over a title and a line, on a card.
struct DSEmptyState: View {
    var art: String?
    var emoji: String?
    let title: String
    var message: String?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            if let art {
                Image(art).resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 2).accessibilityHidden(true)
            } else if let emoji {
                Icon3DView(emoji: emoji, size: AlphonsoDS.Space.s12)
            }
            Text(title).dsText(.headline).foregroundStyle(ds.ink).multilineTextAlignment(.center)
            if let message, !message.isEmpty {
                Text(message).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(AlphonsoDS.Space.s4)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.94)))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Chips, segments, pills

/// One choice as a chip: the answer look (a bordered face), the choice tint when it is picked.
struct DSChip<Leading: View>: View {
    let label: String
    let selected: Bool
    /// What VoiceOver says when it differs from the visible label (a person's name with their avatar).
    var accessibilityText: String?
    let action: () -> Void
    @ViewBuilder var leading: Leading
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s2) {
                leading
                Text(label).dsText(.footnote).foregroundStyle(selected ? ds.choice : ds.brand).lineLimit(1)
            }
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .fill(selected ? ds.choiceTint : ds.card))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .strokeBorder(selected ? ds.choice : ds.line, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText ?? label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

extension DSChip where Leading == EmptyView {
    init(_ label: String, selected: Bool, accessibilityText: String? = nil, action: @escaping () -> Void) {
        self.init(label: label, selected: selected, accessibilityText: accessibilityText, action: action) { EmptyView() }
    }
}

/// A segmented control in the design system: a sunk track with the picked segment raised on a card.
struct DSSegmented<Value: Hashable>: View {
    struct Option: Identifiable {
        let value: Value
        let label: String
        var id: String { label }
    }

    let options: [Option]
    @Binding var selection: Value
    let accessibilityLabel: String
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: AlphonsoDS.Space.s1)) : AnyLayout(HStackLayout(spacing: AlphonsoDS.Space.s1))
        layout {
            ForEach(options) { option in
                let on = option.value == selection
                Button { selection = option.value } label: {
                    Text(option.label).dsText(.footnote)
                        .foregroundStyle(on ? ds.brand : ds.inkSoft)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch - AlphonsoDS.Space.s2)
                        .background(
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control - AlphonsoDS.Space.s1, style: .continuous)
                                .fill(on ? ds.card : Color.clear))
                        .dsElevation(on ? AlphonsoDS.Elevation.resting : [], line: ds.line)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(AlphonsoDS.Space.s1)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.sunk))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }
}

/// A short status label: "You won", "Owner", "Blocked", "YOU".
struct DSPill: View {
    enum Tone { case info, good, bad, neutral, gold }
    let text: String
    var tone: Tone = .info
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(text).dsText(.caption)
            .foregroundStyle(ink)
            .padding(.horizontal, AlphonsoDS.Space.s2)
            .padding(.vertical, AlphonsoDS.Space.s1)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(face))
    }

    private var ink: Color {
        switch tone {
        case .info: return ds.choice
        case .good: return ds.rightInk
        case .bad: return ds.wrongInk
        case .neutral: return ds.inkSoft
        case .gold: return ds.actionText
        }
    }

    private var face: Color {
        switch tone {
        case .info: return ds.choiceTint
        case .good: return ds.rightTint
        case .bad: return ds.wrongTint
        case .neutral: return ds.sunk
        case .gold: return ds.actionTint
        }
    }
}

// MARK: - Buttons and inputs

/// The pressable button in the design system: a face over a darker edge it sinks into when pressed. `compact` is the
/// small one that sits in a row beside text; the default is the full-width one.
struct DSButtonStyle: ButtonStyle {
    enum Variant { case primary, secondary, danger }
    var variant: Variant = .primary
    var compact = false
    var fullWidth = true

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: compact ? AlphonsoDS.Radius.control - AlphonsoDS.Space.s1 : AlphonsoDS.Radius.control, style: .continuous)
        let edgeHeight = variant == .primary ? AlphonsoDS.Edge.primary : AlphonsoDS.Edge.secondary
        let off = !isEnabled && variant == .primary
        let sink = off ? edgeHeight : (configuration.isPressed ? edgeHeight - AlphonsoDS.Edge.pressedSliver : 0)
        return configuration.label
            .dsText(compact ? .footnote : .headline)
            .foregroundStyle(off ? ds.inkFaint : text)
            .multilineTextAlignment(.center)
            .padding(.horizontal, compact ? AlphonsoDS.Space.s4 : AlphonsoDS.Space.s6)
            .padding(.vertical, compact ? AlphonsoDS.Space.s2 : AlphonsoDS.Space.s3)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: compact ? AlphonsoDS.Space.minTouch : AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2)
            .background { shape.fill(off ? AnyShapeStyle(ds.sunk) : face) }
            .overlay { if variant != .primary { shape.strokeBorder(ds.line, lineWidth: 2) } }
            .offset(y: sink)
            .background(alignment: .top) { shape.fill(off ? Color.clear : edge).offset(y: edgeHeight) }
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
        case .secondary, .danger: return AnyShapeStyle(ds.card)
        }
    }

    private var edge: Color { variant == .primary ? ds.actionEdge : ds.line }

    private var text: Color {
        switch variant {
        case .primary: return ds.onAction
        case .secondary: return ds.brand
        case .danger: return ds.wrongInk
        }
    }
}

/// The look of a secondary button for a `Menu`'s label (a Menu cannot take a ButtonStyle's press): a card face with
/// a line border and the brand text.
struct DSMenuLabel: View {
    let text: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(text)
            .dsText(.headline)
            .foregroundStyle(ds.brand)
            .multilineTextAlignment(.center)
            .padding(.horizontal, AlphonsoDS.Space.s6)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
    }
}

extension ButtonStyle where Self == DSButtonStyle {
    static func dsButton(_ variant: DSButtonStyle.Variant = .primary, compact: Bool = false, fullWidth: Bool = true) -> DSButtonStyle {
        DSButtonStyle(variant: variant, compact: compact, fullWidth: fullWidth)
    }
}

extension View {
    /// A text field in the lesson's answer look: a sunk well with a border that turns to the choice colour on focus.
    func dsField(focused: Bool = false) -> some View { modifier(DSFieldStyle(focused: focused)) }

    /// A List row that is only a vehicle for a card: no row background, no separator, a gutter and a gap below.
    func dsListRow(top: CGFloat = 0, bottom: CGFloat = AlphonsoDS.Space.s3) -> some View {
        listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(
                top: top, leading: AlphonsoDS.Space.gutter, bottom: bottom, trailing: AlphonsoDS.Space.gutter))
    }

    /// A List on a scene: the scene first, the flat surface behind it (a `.background` added later sits behind an
    /// earlier one), the system list background hidden, and the choice colour as the tint.
    func dsSceneList(_ scene: SceneName) -> some View { modifier(DSSceneList(scene: scene)) }
}

private struct DSFieldStyle: ViewModifier {
    let focused: Bool
    @Environment(\.alphonsoDS) private var ds

    func body(content: Content) -> some View {
        content
            .dsText(.body)
            .foregroundStyle(ds.ink)
            .textFieldStyle(.plain)
            .padding(AlphonsoDS.Space.s3)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .strokeBorder(focused ? ds.choice : ds.line, lineWidth: 2))
    }
}

private struct DSSceneList: ViewModifier {
    let scene: SceneName
    @Environment(\.alphonsoDS) private var ds

    func body(content: Content) -> some View {
        content
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .screenScene(scene)
            .background(ds.surface)
            .tint(ds.choice)
    }
}
