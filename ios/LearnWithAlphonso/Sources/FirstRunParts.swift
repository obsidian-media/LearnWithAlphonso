import SwiftUI
import UIKit
import LearnWithAlphonsoKit

// The first run's parts in the round-6 design system, the same as the web's src/components/firstrun/FirstRunParts.tsx:
// the room with Alphonso (or Hector) and the HUD, his bubble with a speaker, the choice rows and tiles, the age cards,
// the interest chips, the picker rows, the flag switch and the footer. Every colour and type size is a design-system
// token (`ds.*`, `.dsText`); first-run screens stay light like the lesson (`lessonLightScope`).

// MARK: - Icons

/// The web's first-run icons (FirstRunIcons.tsx) as SF Symbols, by the Kit's semantic names.
enum FirstRunIcon {
    static func symbol(_ name: String) -> String {
        switch name {
        case "plane": return "airplane"
        case "brief": return "briefcase"
        case "cap": return "graduationcap"
        case "home": return "house"
        case "medal": return "medal"
        case "smile": return "face.smiling"
        case "seed": return "circle.dotted"
        case "sprout": return "leaf"
        case "tree": return "tree"
        case "food": return "fork.knife"
        case "ball": return "soccerball"
        case "music": return "music.note"
        case "film": return "film"
        case "chip": return "cpu"
        case "leaf": return "leaf"
        case "brush": return "paintbrush"
        case "people": return "person.2"
        case "globe": return "globe"
        case "pin": return "mappin.and.ellipse"
        case "store": return "storefront"
        case "search": return "magnifyingglass"
        case "share": return "point.3.connected.trianglepath.dotted"
        case "pod": return "antenna.radiowaves.left.and.right"
        case "chat": return "bubble.left"
        case "brain": return "brain"
        case "heartc": return "heart"
        case "mail": return "envelope"
        case "cal": return "calendar"
        case "clock": return "clock"
        case "target": return "target"
        default: return "circle"
        }
    }
}

struct FirstRunSymbol: View {
    let name: String
    var size: CGFloat = 22

    var body: some View {
        Image(systemName: FirstRunIcon.symbol(name))
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Screen

/// A first-run screen: the room on top running under the status bar, Alphonso's bubble overlapping its foot, the
/// step's content, and the footer pinned to the bottom. The content scrolls, so large Dynamic Type never clips.
struct FirstRunScreen<Room: View, Content: View, Footer: View>: View {
    /// False for a screen with no room on top (the plan): its content starts below the status bar.
    var underStatusBar = true
    @ViewBuilder var room: () -> Room
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { outer in
            ScrollView {
                VStack(spacing: 0) {
                    room()
                    content()
                }
                .padding(.bottom, AlphonsoDS.Space.s4)
            }
            .scrollBounceBehavior(.basedOnSize)
            .ignoresSafeArea(.container, edges: underStatusBar ? .top : [])
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // A screen with no footer (EmptyView) must add NOTHING here: padding and a background on an
                // EmptyView make the inset fill the whole screen with the surface colour, which painted the
                // sign-in step blank (the accessibility tree was complete, the pixels were not).
                if Footer.self != EmptyView.self {
                    footer()
                        .padding(.horizontal, AlphonsoDS.Space.gutter)
                        .padding(.top, AlphonsoDS.Space.s3)
                        .padding(.bottom, AlphonsoDS.Space.s2)
                        .background(ds.surface.ignoresSafeArea(edges: .bottom))
                }
            }
            // The room runs up under the status bar; the HUD over it keeps clear of it.
            .environment(\.firstRunTopInset, underStatusBar ? outer.safeAreaInsets.top : 0)
        }
        .background(ds.surface.ignoresSafeArea())
        .lessonLightScope()
    }
}

private struct FirstRunTopInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// The status bar's height above a first-run room, so its HUD sits below it.
    var firstRunTopInset: CGFloat {
        get { self[FirstRunTopInsetKey.self] }
        set { self[FirstRunTopInsetKey.self] = newValue }
    }
}

/// The room with a figure standing in it, bottom-centred; the HUD (or a badge) floats over it.
struct FirstRunRoom<Top: View>: View {
    enum Size { case normal, tall, hero }
    let roomID: String
    let figure: UIImage?
    let figureLabel: String
    var size: Size = .normal
    var chip: String?
    @ViewBuilder var top: () -> Top

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.firstRunTopInset) private var topInset

    private var roomHeight: CGFloat {
        switch size {
        case .normal: return 230
        case .tall: return 380
        case .hero: return 300
        }
    }

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let total = geo.size.height
            let figureWidth = min(width * 0.62, total * 0.82)
            ZStack(alignment: .top) {
                ds.sunk
                if let art = LessonArt.room(roomID) {
                    let scaledHeight = max(total, width * art.size.height / max(1, art.size.width))
                    let scaledWidth = scaledHeight * art.size.width / max(1, art.size.height)
                    Image(uiImage: art)
                        .resizable()
                        .frame(width: scaledWidth, height: scaledHeight)
                        .offset(y: -(scaledHeight - total) * 0.38)
                        .frame(width: width, height: total, alignment: .top)
                        .accessibilityHidden(true)
                }
                LinearGradient(
                    stops: [.init(color: ds.heroB.opacity(0.46), location: 0), .init(color: .clear, location: 0.3),
                            .init(color: .clear, location: 0.72), .init(color: ds.surface, location: 1)],
                    startPoint: .top, endPoint: .bottom)
                    .accessibilityHidden(true)
                if let figure {
                    Image(uiImage: figure)
                        .resizable()
                        .scaledToFit()
                        .frame(width: figureWidth, height: figureWidth)
                        .position(x: width / 2, y: total - figureWidth / 2 + LessonStage.alphonsoSink)
                        .accessibilityElement()
                        .accessibilityLabel(figureLabel)
                        .accessibilityAddTraits(.isImage)
                        .id(ObjectIdentifier(figure))
                        .transition(.opacity)
                }
                if let chip {
                    HStack(spacing: 6) {
                        Circle().fill(ds.action).frame(width: 8, height: 8).accessibilityHidden(true)
                        Text(chip).dsText(.caption).foregroundStyle(ds.brand)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(ds.card))
                    .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, AlphonsoDS.Space.gutter)
                    .padding(.bottom, AlphonsoDS.Space.s6)
                }
                top()
                    .padding(.top, topInset + AlphonsoDS.Space.s2)
                    .padding(.horizontal, AlphonsoDS.Space.gutter)
            }
            .frame(width: width, height: total)
            .clipped()
            .animation(reduceMotion ? nil : .easeInOut(duration: AlphonsoDS.Motion.swap), value: roomID)
        }
        .frame(height: roomHeight + topInset)
    }
}

/// Back, the eight dashes and "Question 3 of 8", and Skip, over the room.
struct FirstRunHUD: View {
    var step = 0
    var total = 0
    var showCounter = true
    var backLabel = "Back"
    var onBack: (() -> Void)?
    var onSkip: (() -> Void)?

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                if let onBack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .resizable().scaledToFit().frame(width: 14, height: 14)
                            .fontWeight(.bold)
                            .foregroundStyle(ds.brand)
                            .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                            .background(Circle().fill(ds.card))
                            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(backLabel)
                }
                if showCounter && total > 0 {
                    HStack(spacing: 6) {
                        ForEach(0..<total, id: \.self) { i in
                            Capsule()
                                .fill(i < step ? ds.action : ds.card.opacity(0.7))
                                .frame(height: 6)
                        }
                    }
                    .accessibilityElement()
                    .accessibilityLabel("Question \(step) of \(total)")
                } else {
                    Spacer()
                }
                if let onSkip {
                    Button("Skip", action: onSkip)
                        .dsText(.headline)
                        .foregroundStyle(ds.card)
                        .shadow(color: ds.heroB.opacity(0.5), radius: 2, y: 1)
                        .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                        .accessibilityHint("Goes to the next question")
                } else if showCounter && total > 0 {
                    Color.clear.frame(width: AlphonsoDS.Space.minTouch, height: 1)
                }
            }
            if showCounter && total > 0 {
                Text("Question \(step) of \(total)")
                    .dsText(.overline)
                    .foregroundStyle(ds.brand)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(ds.card))
                    .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
                    .accessibilityHidden(true)
            }
        }
    }
}

// MARK: - Bubble

/// Alphonso's line: the speaker button reads it aloud; a title and an optional sub. The tail points up at him.
struct FirstRunBubble: View {
    let title: String
    var sub: String?
    var playLabel = "Hear Alphonso"
    var onPlay: (() -> Void)?

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(alignment: .center, spacing: AlphonsoDS.Space.s3) {
            if let onPlay {
                Button(action: onPlay) {
                    DSIconView(icon: .speaker, size: 20)
                        .foregroundStyle(ds.actionText)
                        .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                        .background(Circle().fill(ds.choiceTint))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playLabel)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .dsText(.title)
                    .foregroundStyle(ds.brand)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let sub {
                    Text(sub)
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background { RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card) }
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(ds.card)
                .frame(width: 18, height: 18)
                .rotationEffect(.degrees(45))
                .offset(y: -7)
                .accessibilityHidden(true)
        }
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        .padding(.horizontal, AlphonsoDS.Space.gutter)
        .padding(.top, -AlphonsoDS.Space.s4)
    }
}

// MARK: - Choices

/// The pressable card look: a bordered face over a coloured bottom edge.
struct FirstRunCardStyle: ButtonStyle {
    var selected: Bool
    var radius: CGFloat = AlphonsoDS.Radius.control

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let edge = AlphonsoDS.Edge.answer
        let sink = configuration.isPressed ? edge - AlphonsoDS.Edge.pressedSliver : 0
        return configuration.label
            .background { shape.fill(selected ? ds.choiceTint : ds.card) }
            .overlay { shape.strokeBorder(selected ? ds.choice : ds.line, lineWidth: 2) }
            .offset(y: sink)
            .background(alignment: .top) { shape.fill(selected ? ds.choiceEdge : ds.line).offset(y: edge) }
            .padding(.bottom, edge)
            .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// The round tick on the right of a choice row.
struct FirstRunRadio: View {
    let on: Bool
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack {
            if on {
                Circle().fill(ds.choice)
                DSIconView(icon: .check, size: 14).foregroundStyle(ds.card)
            } else {
                Circle().strokeBorder(ds.line, lineWidth: 2)
            }
        }
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)
    }
}

/// A rounded square holding an icon, filled in brand blue when its row is picked.
struct FirstRunIconBadge: View {
    let icon: String
    var on = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        FirstRunSymbol(name: icon, size: 20)
            .foregroundStyle(on ? ds.card : ds.brand)
            .frame(width: 40, height: 40)
            .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(on ? ds.brand : ds.choiceTint))
    }
}

/// A full-width choice: a lead (flag or icon), the label and an optional sub, and the radio.
struct FirstRunChoiceRow<Lead: View>: View {
    let label: String
    var sub: String?
    let selected: Bool
    let action: () -> Void
    @ViewBuilder var lead: () -> Lead

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                lead()
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).dsText(.headline).foregroundStyle(ds.brand)
                    if let sub { Text(sub).dsText(.caption).foregroundStyle(ds.inkSoft) }
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                FirstRunRadio(on: selected)
            }
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        }
        .buttonStyle(FirstRunCardStyle(selected: selected))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// A tile with an icon over its label (goals, how you heard), two to a row.
struct FirstRunChoiceTile: View {
    let icon: String
    let label: String
    let selected: Bool
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            VStack(spacing: AlphonsoDS.Space.s2) {
                FirstRunSymbol(name: icon, size: 26).foregroundStyle(ds.brand)
                Text(label)
                    .dsText(.footnote)
                    .foregroundStyle(ds.brand)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: 84)
        }
        .buttonStyle(FirstRunCardStyle(selected: selected))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// The age screen's card: every one looks the same until tapped.
struct FirstRunAgeCard: View {
    let choice: AgeChoice
    let selected: Bool
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(choice.big).dsText(.numeral).foregroundStyle(ds.brand).minimumScaleFactor(0.6).lineLimit(1)
                Text(choice.small).dsText(.caption).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
            }
            .padding(.vertical, AlphonsoDS.Space.s3)
            .padding(.horizontal, AlphonsoDS.Space.s1)
            .frame(maxWidth: .infinity, minHeight: 76)
        }
        .buttonStyle(FirstRunCardStyle(selected: selected))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(choice.accessibilityLabel)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// An interest: a pill with an icon, toggled on and off.
struct FirstRunInterestChip: View {
    let icon: String
    let label: String
    let selected: Bool
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                FirstRunSymbol(name: icon, size: 16)
                Text(label).dsText(.footnote)
            }
            .foregroundStyle(selected ? ds.card : ds.brand)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .background(Capsule().fill(selected ? ds.choice : ds.card))
            .overlay(Capsule().strokeBorder(selected ? ds.choice : ds.line, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// A course's flag: the web's SVG flags as the system's flag emoji (iOS draws them).
struct FirstRunCourseFlag: View {
    let course: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(course == "fr" ? "\u{1F1EB}\u{1F1F7}" : course == "es" ? "\u{1F1EA}\u{1F1F8}" : "\u{1F1EC}\u{1F1E7}")
            .dsText(.title)
            .frame(width: 40, height: 28)
            .accessibilityHidden(true)
    }
}

/// A country as its two letters in a chip (the web's choice, so every country reads the same everywhere).
struct FirstRunCountryChip: View {
    let code: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(code)
            .dsText(.headline)
            .foregroundStyle(ds.brand)
            .frame(width: 40, height: 40)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(ds.xpTint))
            .accessibilityHidden(true)
    }
}

/// "I speak / English >": opens a picker.
struct FirstRunPickerRow<Lead: View>: View {
    let overline: String
    let value: String
    let action: () -> Void
    @ViewBuilder var lead: () -> Lead

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                lead()
                VStack(alignment: .leading, spacing: 2) {
                    Text(overline).dsText(.overline).foregroundStyle(ds.actionText)
                    Text(value).dsText(.headline).foregroundStyle(ds.brand)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                DSIconView(icon: .chevron, size: 16).foregroundStyle(ds.inkSoft)
            }
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        }
        .buttonStyle(FirstRunCardStyle(selected: false))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens a list to choose from")
    }
}

/// "Show my flag on leaderboards": off unless turned on.
struct FirstRunSwitchRow: View {
    let label: String
    let sub: String
    @Binding var isOn: Bool

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).dsText(.footnote).foregroundStyle(ds.brand)
                Text(sub).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .tint(ds.choice)
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.vertical, AlphonsoDS.Space.s3)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
    }
}

/// The small note under a step (the placement offer).
struct FirstRunHint: View {
    let text: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(text)
            .dsText(.footnote)
            .foregroundStyle(ds.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Footer

/// The primary button, with an optional note above it and a text button under it.
struct FirstRunFooter: View {
    let label: String
    var disabled = false
    var note: String?
    var secondary: (label: String, action: () -> Void)?
    let action: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            if let note {
                Text(note)
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(label, action: action)
                .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
                .disabled(disabled)
            if let secondary {
                Button(secondary.label, action: secondary.action)
                    .dsText(.headline)
                    .foregroundStyle(ds.choice)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
            }
        }
    }
}

// MARK: - Picker sheet

/// A searchable list for "I speak" and "I'm joining from".
struct FirstRunPickerSheet: View {
    struct Item: Identifiable {
        let id: String
        let label: String
    }
    let title: String
    let searchPrompt: String
    let items: [Item]
    let selected: String?
    var showsCode = false
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.alphonsoDS) private var ds
    @State private var query = ""

    private var shown: [Item] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? items : items.filter { $0.label.localizedCaseInsensitiveContains(q) || $0.id.caseInsensitiveCompare(q) == .orderedSame }
    }

    var body: some View {
        NavigationStack {
            List(shown) { item in
                Button {
                    onPick(item.id)
                    dismiss()
                } label: {
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        if showsCode { FirstRunCountryChip(code: item.id) }
                        Text(item.label).dsText(.headline).foregroundStyle(ds.brand)
                        Spacer()
                        if item.id == selected { DSIconView(icon: .check, size: 16).foregroundStyle(ds.choice) }
                    }
                }
                .accessibilityAddTraits(item.id == selected ? .isSelected : [])
            }
            .listStyle(.plain)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: searchPrompt)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }
}

// MARK: - Profile picture

/// A learner's picture: their animal, or their initial on their colour (any other seed). Decorative by default;
/// the caller names the person.
struct ProfileAvatarView: View {
    let seed: String?
    let name: String?
    var size: CGFloat = 40

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Group {
            if let animal = ProfileAvatars.animal(fromSeed: seed), let art = FirstRunArt.avatar(animal.id) {
                Image(uiImage: art)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .background(ds.sunk)
                    .clipShape(Circle())
            } else {
                Text(ProfileAvatars.initial(of: name))
                    .dsText(size >= 64 ? .title : .headline)
                    .foregroundStyle(ds.card)
                    .minimumScaleFactor(0.5)
                    .frame(width: size, height: size)
                    .background(Circle().fill(AvatarColor.forSeed(ProfileAvatars.initialsSeed(current: seed))))
            }
        }
        .accessibilityHidden(true)
    }
}

/// The 16 animals four by four, and the learner's initial as the last choice. Presets only: there is no upload.
struct AvatarPickerGrid: View {
    let value: String
    let name: String
    /// The seed "My initial" writes (the learner's old colour seed).
    let initialsSeed: String
    let onChange: (String) -> Void

    @Environment(\.alphonsoDS) private var ds

    private let columns = Array(repeating: GridItem(.flexible(), spacing: AlphonsoDS.Space.s3), count: 4)

    var body: some View {
        let chosen = ProfileAvatars.animal(fromSeed: value)
        LazyVGrid(columns: columns, spacing: AlphonsoDS.Space.s3) {
            ForEach(ProfileAvatars.all, id: \.id) { animal in
                cell(on: chosen?.id == animal.id, label: animal.label) {
                    onChange(ProfileAvatars.seed(for: animal.id))
                } content: { side in
                    ProfileAvatarView(seed: ProfileAvatars.seed(for: animal.id), name: name, size: side)
                }
            }
            cell(on: chosen == nil, label: "My initial, \(ProfileAvatars.initial(of: name))") {
                onChange(initialsSeed)
            } content: { side in
                ProfileAvatarView(seed: initialsSeed, name: name, size: side)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Profile pictures")
    }

    private func cell<C: View>(on: Bool, label: String, action: @escaping () -> Void, @ViewBuilder content: @escaping (CGFloat) -> C) -> some View {
        Button(action: action) {
            GeometryReader { geo in
                let side = min(geo.size.width, geo.size.height) - 6
                content(side)
                    .overlay(Circle().strokeBorder(on ? ds.brand : ds.line, lineWidth: on ? 3 : 2).padding(on ? -3 : 0))
                    .overlay(alignment: .topTrailing) {
                        if on {
                            DSIconView(icon: .check, size: 12)
                                .foregroundStyle(ds.card)
                                .frame(width: 24, height: 24)
                                .background(Circle().fill(ds.brand))
                                .overlay(Circle().strokeBorder(ds.card, lineWidth: 2))
                                .offset(x: 4, y: -4)
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
            }
            .aspectRatio(1, contentMode: .fit)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}
