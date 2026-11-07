import SwiftUI
import LearnWithAlphonsoKit

// The round-6 Alphonso Pro paywall's parts, the same as the web's src/components/paywall/PaywallParts.tsx (the approved
// "Mix: A's story, B's card"): Hector in his room with the small gold Pro card pinned in the corner, the labelled example
// call, three facts, the card leading the plans, the free row, the plans side by side and the dashed "when do I pay" row.
// Every colour and type size is a design-system token (`ds.*`, `.dsText`). No price, currency, trial or number lives here:
// the words come from the Kit's `ProPaywallCopy` and `PaywallPresentation`.

/// Who is looking at the paywall: the course the example call is in, and the first name pinned on the card.
struct PaywallLearner: Equatable {
    var course: Course = .english
    var name: String?
}

private struct PaywallLearnerKey: EnvironmentKey {
    static let defaultValue = PaywallLearner()
}

extension EnvironmentValues {
    var paywallLearner: PaywallLearner {
        get { self[PaywallLearnerKey.self] }
        set { self[PaywallLearnerKey.self] = newValue }
    }
}

/// The navy card face: the hero gradient with a gold rule inside the edge.
private struct ProCardFace: View {
    @Environment(\.alphonsoDS) private var ds
    let name: String?
    var showsChip = true

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .fill(RadialGradient(colors: [ds.heroA, ds.hero, ds.heroB], center: .topTrailing,
                                         startRadius: 0, endRadius: geo.size.width * 1.2))
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .strokeBorder(ds.onHeroKick.opacity(0.85), lineWidth: 1.5)
                Image("Hector-happy")
                    .resizable().scaledToFit()
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: geo.size.width * 0.5, y: geo.size.height * 0.12)
                    .accessibilityHidden(true)
                Text(ProPaywallCopy.kicker)
                    .dsText(.overline)
                    .foregroundStyle(ds.onHeroKick)
                    .padding(.leading, AlphonsoDS.Space.s3).padding(.top, AlphonsoDS.Space.s3)
                if showsChip {
                    RoundedRectangle(cornerRadius: AlphonsoRadius.sm, style: .continuous)
                        .fill(LinearGradient(colors: [ds.onHeroKick, ds.actionEdge], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 28, height: 20)
                        .frame(maxWidth: .infinity, alignment: .topTrailing)
                        .padding(AlphonsoDS.Space.s3)
                        .accessibilityHidden(true)
                }
                if let name {
                    Text(name)
                        .dsText(.title)
                        .foregroundStyle(ds.onHero)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        .padding(AlphonsoDS.Space.s3)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .shadow(color: ds.heroB.opacity(0.3), radius: 12, y: 8)
        }
    }
}

/// Hector in his library, fading into the screen colour, with the small tilted Pro card pinned top left.
struct PaywallRoomTop: View {
    @Environment(\.alphonsoDS) private var ds
    let name: String?

    var body: some View {
        GeometryReader { geo in
            let side = geo.size.width
            ZStack(alignment: .bottom) {
                Image("Scene-hector")
                    .resizable().scaledToFill()
                    .frame(width: side, height: side).clipped()
                    .accessibilityHidden(true)
                LinearGradient(stops: [.init(color: ds.heroB.opacity(0.18), location: 0), .init(color: .clear, location: 0.3),
                                       .init(color: .clear, location: 0.62), .init(color: ds.surface, location: 0.97)],
                               startPoint: .top, endPoint: .bottom)
                    .accessibilityHidden(true)
                Image("Hector-talking")
                    .resizable().scaledToFit()
                    .frame(width: side * 0.77)
                    .accessibilityLabel(ProPaywallCopy.roomLabel)
                    .accessibilityAddTraits(.isImage)
                LinearGradient(stops: [.init(color: .clear, location: 0.74), .init(color: ds.surface.opacity(0.85), location: 0.92),
                                       .init(color: ds.surface, location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .accessibilityHidden(true)
                ProCardFace(name: name)
                    .frame(width: side * 0.4, height: side * 0.25)
                    .rotationEffect(.degrees(-6), anchor: .topLeading)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.leading, AlphonsoDS.Space.s4).padding(.top, AlphonsoDS.Space.s12)
                    .accessibilityHidden(true)
            }
            .frame(width: side, height: side)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxHeight: 430)
    }
}

/// The card leading the plans: wide, tilted a little, the learner's name on it.
struct ProCardBanner: View {
    let name: String?

    var body: some View {
        ProCardFace(name: name, showsChip: false)
            .frame(height: 92)
            .rotationEffect(.degrees(-2))
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .padding(.vertical, AlphonsoDS.Space.s1)
            .accessibilityHidden(true)
    }
}

struct PaywallHeadline: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        (Text(ProPaywallCopy.headlineLead)
            + Text(ProPaywallCopy.headlineMark).underline(true, color: ds.action)
            + Text(ProPaywallCopy.headlineEnd))
            .dsText(.displayXL)
            .foregroundStyle(ds.ink)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A white tile with the warm edge, as the mock's chat, facts and "when" boxes.
private struct PaywallTile: ViewModifier {
    @Environment(\.alphonsoDS) private var ds
    var radius: CGFloat
    var dashed = false

    func body(content: Content) -> some View {
        content
            .background(ds.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(ds.line, style: StrokeStyle(lineWidth: 2, dash: dashed ? [6, 4] : []))
            )
    }
}

private extension View {
    func paywallTile(radius: CGFloat, dashed: Bool = false) -> some View {
        modifier(PaywallTile(radius: radius, dashed: dashed))
    }
}

/// One real-looking moment: Hector remembering last week's mistake. Labelled as an example, honestly.
struct PaywallExampleCall: View {
    @Environment(\.alphonsoDS) private var ds
    let course: Course

    var body: some View {
        let call = ProPaywallContent.exampleCall(for: course)
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                hectorDot
                (Text(call.before) + Text(call.recalled).bold().foregroundColor(ds.actionText) + Text(call.after))
                    .dsText(.body)
                    .foregroundStyle(ds.ink)
                    .padding(AlphonsoDS.Space.s3)
                    .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Space.s4, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(call.reply)
                .dsText(.body)
                .foregroundStyle(ds.onHero)
                .padding(AlphonsoDS.Space.s3)
                .background(ds.brand, in: RoundedRectangle(cornerRadius: AlphonsoDS.Space.s4, style: .continuous))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .environment(\.locale, Locale(identifier: course.wireCode))
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                hectorDot
                Text(call.praise)
                    .dsText(.body)
                    .foregroundStyle(ds.ink)
                    .padding(AlphonsoDS.Space.s3)
                    .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Space.s4, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .paywallTile(radius: AlphonsoDS.Radius.bubble)
        .overlay(alignment: .topLeading) {
            Text(ProPaywallCopy.exampleLabel)
                .dsText(.caption)
                .textCase(.uppercase)
                .foregroundStyle(ds.inkSoft)
                .padding(.horizontal, AlphonsoDS.Space.s2)
                .background(ds.surface)
                .padding(.leading, AlphonsoDS.Space.s3)
                .offset(y: -AlphonsoDS.Space.s3)
        }
        .padding(.top, AlphonsoDS.Space.s2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(ProPaywallCopy.exampleLabel). Hector: \(call.before)\(call.recalled)\(call.after) You: \(call.reply) Hector: \(call.praise)")
    }

    private var hectorDot: some View {
        Image("Hector-happy")
            .resizable().scaledToFill()
            .frame(width: 28, height: 28, alignment: .top)
            .clipShape(Circle())
            .background(ds.sunk, in: Circle())
            .accessibilityHidden(true)
    }
}

/// The three facts: any topic, remembers your weak spots, a long conversation every day.
struct PaywallFacts: View {
    @Environment(\.alphonsoDS) private var ds
    private static let symbols = ["text.bubble", "brain", "sun.max"]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) { tiles }
            VStack(spacing: AlphonsoDS.Space.s2) { tiles }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProPaywallCopy.factsSpoken)
    }

    @ViewBuilder
    private var tiles: some View {
        ForEach(Array(ProPaywallCopy.facts.enumerated()), id: \.offset) { index, fact in
            VStack(spacing: AlphonsoDS.Space.s1) {
                Image(systemName: Self.symbols[index])
                    .foregroundStyle(ds.choice)
                    .dsText(.title)
                Text(fact.title).dsText(.headline).foregroundStyle(ds.ink)
                Text(fact.detail).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AlphonsoDS.Space.s3).padding(.horizontal, AlphonsoDS.Space.s1)
            .paywallTile(radius: AlphonsoDS.Radius.control)
        }
    }
}

/// "Everything else stays free": lessons, Alphonso calls, audio, review.
struct PaywallFreeRow: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            FlowChips(items: ProPaywallCopy.freeItems)
            Text(ProPaywallCopy.freeNote)
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(ProPaywallCopy.freeLabel): \(ProPaywallCopy.freeItems.joined(separator: ", ")). \(ProPaywallCopy.freeNote)")
    }
}

private struct FlowChips: View {
    @Environment(\.alphonsoDS) private var ds
    let items: [String]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: AlphonsoDS.Space.s1) { chips }
            VStack(spacing: AlphonsoDS.Space.s1) { chips }
        }
    }

    private var chips: some View {
        ForEach(items, id: \.self) { item in
            Label(item, systemImage: "checkmark")
                .dsText(.footnote)
                .foregroundStyle(ds.rightInk)
                .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s1)
                .background(ds.rightTint, in: Capsule())
        }
    }
}

/// Yearly and monthly side by side, the selected one marked. One plan alone takes the full width.
struct PaywallPlanPicker: View {
    @Environment(\.alphonsoDS) private var ds
    let options: [PaywallPlanOption]
    let disabled: Bool
    let onSelect: (String) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) { cards }
            VStack(spacing: AlphonsoDS.Space.s2) { cards }
        }
        .accessibilityElement(children: .contain)
    }

    private var cards: some View {
        ForEach(options) { option in
            Button { onSelect(option.id) } label: { card(option) }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label(option))
                .accessibilityAddTraits(option.isSelected ? [.isButton, .isSelected] : .isButton)
        }
    }

    private func label(_ option: PaywallPlanOption) -> String {
        [option.title, option.priceLine, option.perMonthLine, option.savingsLine, option.trialNote]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private func card(_ option: PaywallPlanOption) -> some View {
        VStack(spacing: 1) {
            Text(option.title).dsText(.footnote).foregroundStyle(ds.inkSoft)
            Text(option.priceLine).dsText(.headline).foregroundStyle(ds.ink)
                .multilineTextAlignment(.center)
            Text(option.perMonthLine).dsText(.footnote).foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)
            if let trial = option.trialNote {
                Text(trial).dsText(.footnote).foregroundStyle(ds.actionText).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 96)
        .padding(.horizontal, AlphonsoDS.Space.s2).padding(.top, AlphonsoDS.Space.s3).padding(.bottom, AlphonsoDS.Space.s2)
        .background(option.isSelected ? ds.choiceTint : ds.card,
                    in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                .strokeBorder(option.isSelected ? ds.brand : ds.line, lineWidth: 2)
        )
        .overlay(alignment: .top) {
            if let saving = option.savingsLine {
                Text(saving)
                    .dsText(.caption)
                    .foregroundStyle(ds.onAction)
                    .padding(.horizontal, AlphonsoDS.Space.s2)
                    .background(ds.action, in: RoundedRectangle(cornerRadius: AlphonsoRadius.sm, style: .continuous))
                    .offset(y: -AlphonsoDS.Space.s3)
            }
        }
        .overlay(alignment: .topTrailing) {
            if option.isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(ds.brand)
                    .padding(AlphonsoDS.Space.s2)
            }
        }
        .padding(.top, AlphonsoDS.Space.s2)
    }
}

/// The dashed "when do I pay" row with a calendar.
struct PaywallWhenRow: View {
    @Environment(\.alphonsoDS) private var ds
    let line: PaywallWhenLine

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Image(systemName: "calendar")
                .dsText(.title)
                .foregroundStyle(ds.actionText)
                .accessibilityHidden(true)
            (Text(line.lead).bold().foregroundColor(ds.ink) + Text(" " + line.rest))
                .dsText(.body)
                .foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s3)
        .paywallTile(radius: AlphonsoDS.Radius.control, dashed: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(line.lead) \(line.rest)")
    }
}

/// The welcome after buying: Hector in his room, three openers, "Call Hector".
struct ProWelcomeView: View {
    @Environment(\.alphonsoDS) private var ds
    let name: String?
    let course: Course
    let onCall: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                PaywallRoomTop(name: name)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                    Text(ProPaywallCopy.welcomeEyebrow).dsText(.overline).foregroundStyle(ds.actionText)
                    Text(ProPaywallCopy.welcomeGreeting(name: name))
                        .dsText(.displayXL).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(ProPaywallCopy.welcomeReady).dsText(.title).foregroundStyle(ds.brand)
                    Text(ProPaywallCopy.welcomeBody).dsText(.body).foregroundStyle(ds.inkSoft)
                    Text(ProPaywallCopy.openersTitle).dsText(.headline).foregroundStyle(ds.ink)
                    ForEach(ProPaywallContent.openers(for: course), id: \.self) { opener in
                        Text(opener)
                            .dsText(.body)
                            .foregroundStyle(ds.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(AlphonsoDS.Space.s3)
                            .paywallTile(radius: AlphonsoDS.Radius.control)
                    }
                    Button(ProPaywallCopy.callHector, action: onCall)
                        .buttonStyle(.alphonsoEmber)
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
            }
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(ds.surface.ignoresSafeArea())
    }
}
