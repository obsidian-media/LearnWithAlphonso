import SwiftUI

// The small pieces the redesigned Settings screen is built from. Every colour, size and type role is a design-system
// token, so a palette or night setting changes them and nothing else.

/// A switch row's label: the title, with the line that explains it under it.
struct SettingsToggleLabel: View {
    let title: String
    var subtitle: String?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            Text(title).dsText(.headline).foregroundStyle(ds.ink)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle).dsText(.caption).foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
    }
}

/// The thin rule between two rows of one card.
struct SettingsDivider: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Divider().overlay(ds.line)
    }
}

/// A row that opens something: a title, an optional second line, and the chevron or arrow on the right.
struct SettingsNavLabel: View {
    let title: String
    var subtitle: String?
    var trailing: String = "chevron.right"
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                Text(title).dsText(.headline).foregroundStyle(ds.ink)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).dsText(.caption).foregroundStyle(ds.inkSoft)
                }
            }
            Spacer(minLength: AlphonsoDS.Space.s2)
            Image(systemName: trailing).dsText(.caption).foregroundStyle(ds.inkFaint)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// The round marker of a one-of-three choice: a ring, filled when it is the pick.
struct SettingsRadioDot: View {
    let selected: Bool
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Circle()
            .strokeBorder(selected ? ds.choice : ds.line, lineWidth: 2)
            .background(Circle().fill(selected ? ds.choiceTint : ds.card))
            .overlay(Circle().fill(selected ? ds.choice : Color.clear).padding(AlphonsoDS.Space.s1 + 1))
            .frame(width: AlphonsoDS.Space.s5, height: AlphonsoDS.Space.s5)
            .accessibilityHidden(true)
    }
}
