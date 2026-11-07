import SwiftUI
import LearnWithAlphonsoKit

/// Profile's Overview / Progress / Social split (round 6.1, option A). Which section sits on which tab is
/// ProfileTabs in the Kit; these are the controls only.

/// The segmented tab control under the hero.
struct ProfileTabPicker: View {
    @Binding var selection: ProfileTab
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s1) {
            ForEach(ProfileTab.allCases, id: \.self) { tab in
                let selected = tab == selection
                Button {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select)) { selection = tab }
                } label: {
                    Text(tab.label)
                        .dsText(.headline)
                        .foregroundStyle(selected ? ds.onAction : ds.ink)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                        .background(
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                                .fill(selected ? ds.choice : ds.card.opacity(0)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
                .accessibilityAddTraits(selected ? AccessibilityTraits([.isButton, .isSelected]) : AccessibilityTraits.isButton)
            }
        }
        .padding(AlphonsoDS.Space.s1)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control + AlphonsoDS.Space.s1, style: .continuous).fill(ds.card.opacity(0.92)))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Profile sections")
    }
}

/// The Skills slot at the top of Progress. There is no skills data yet, so this says so honestly.
struct ProfileSkillsSlot: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            Text("Skills").dsText(.headline).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
            Text("Your listening, speaking, vocabulary, grammar and reading shape will appear here once there is enough practice to show it.")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s4)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.92)))
        .accessibilityElement(children: .combine)
    }
}

/// A collapsed Progress card: title and a one-line summary; opening shows the full section.
struct ProfileFold<Content: View>: View {
    let title: String
    let summary: String
    @ViewBuilder var content: Content
    @State private var open = false
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Button {
                withAnimation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select)) { open.toggle() }
            } label: {
                HStack(spacing: AlphonsoDS.Space.s3) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(title).dsText(.headline).foregroundStyle(ds.ink)
                        Text(summary).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    Image(systemName: "chevron.down")
                        .foregroundStyle(ds.inkSoft)
                        .rotationEffect(.degrees(open ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.vertical, AlphonsoDS.Space.s2)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.92)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(summary)")
            .accessibilityValue(open ? "Expanded" : "Collapsed")
            .accessibilityHint(open ? "Double tap to collapse" : "Double tap to expand")
            if open { content }
        }
    }
}
