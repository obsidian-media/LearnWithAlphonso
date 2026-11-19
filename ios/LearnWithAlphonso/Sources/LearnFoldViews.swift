import SwiftUI
import LearnWithAlphonsoKit

/// Learn screen, round 6.1 option A: the pinned "you are here" card, the slim fold rows and the jump button.
/// The folding rules live in the Kit (LearnFold); these are only the views.

/// The current unit's info and one gold Continue lesson button, drawn on the scene inside LearnHeroStage (Learn's one hero).
struct LearnCurrentUnitCard: View {
    let unitNumber: Int
    let unitCount: Int
    let unitTitle: String
    let lessonTitle: String

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text("You are here \u{00B7} Unit \(unitNumber) of \(unitCount)")
                .dsText(.overline)
                .foregroundStyle(ds.onHeroKick)
            Text(unitTitle)
                .dsText(.title)
                .foregroundStyle(ds.onHero)
                .fixedSize(horizontal: false, vertical: true)
            Text("Next: \(lessonTitle)")
                .dsText(.footnote)
                .foregroundStyle(ds.onHeroSoft)
                .fixedSize(horizontal: false, vertical: true)
            // The one way in: the design system's primary button look (gold face, darker edge). The whole hero is the
            // tap target (the NavigationLink sits behind it), so this is drawn, not a second Button.
            Text("Continue lesson")
                .dsText(.headline)
                .foregroundStyle(ds.onAction)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                .background(ds.action, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                .background(
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                        .fill(ds.actionEdge)
                        .offset(y: 4)
                )
                .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("You are here. Unit \(unitNumber) of \(unitCount), \(unitTitle). Continue lesson: \(lessonTitle)")
        .accessibilityAddTraits(.isButton)
    }
}

/// One slim row that folds a run of finished units, or a unit that is still ahead. Tapping toggles it.
struct LearnFoldRow: View {
    let title: String
    let detail: String
    let isExpanded: Bool
    let spokenDetail: String
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                Text(title).dsText(.headline).foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: AlphonsoDS.Space.s2)
                if !detail.isEmpty {
                    Text(detail).dsText(.caption).foregroundStyle(ds.inkSoft).monospacedDigit()
                }
                Image(systemName: "chevron.down")
                    .foregroundStyle(ds.inkSoft)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card.opacity(0.92)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spokenDetail.isEmpty ? title : "\(title), \(spokenDetail)")
        .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
        .accessibilityHint(isExpanded ? "Double tap to collapse" : "Double tap to expand")
    }
}

/// Floats at the bottom of Learn when the current unit is scrolled out of sight.
struct JumpToCurrentButton: View {
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            Label("Jump to current", systemImage: "arrow.up.to.line")
                .dsText(.headline)
                .foregroundStyle(ds.ink)
                .padding(.horizontal, AlphonsoDS.Space.s5)
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .background(ds.xp, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Scrolls back to the unit you are on")
    }
}

/// The id the Jump to current button scrolls to.
enum LearnFoldAnchor {
    static let current = "learn-current-unit"
}

/// Marks the current unit's banner: gives it the scroll id and reports whether it is on screen.
struct CurrentUnitMarker: ViewModifier {
    let active: Bool
    let onVisibility: (Bool) -> Void

    func body(content: Content) -> some View {
        if active {
            content
                .id(LearnFoldAnchor.current)
                .onAppear { onVisibility(true) }
                .onDisappear { onVisibility(false) }
        } else {
            content
        }
    }
}

extension View {
    /// A fold row sits in the List as a bare slim card: no separator, no row background, a little air.
    func foldRowStyle() -> some View {
        listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: AlphonsoDS.Space.s1, leading: AlphonsoDS.Space.s4, bottom: AlphonsoDS.Space.s1, trailing: AlphonsoDS.Space.s4))
    }
}

/// The motion for opening and closing a fold: the design system's selection timing, none under Reduce Motion.
func learnFoldAnimation(reduceMotion: Bool) -> Animation? {
    reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select)
}
