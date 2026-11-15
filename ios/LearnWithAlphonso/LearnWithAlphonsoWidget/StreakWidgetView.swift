import SwiftUI
import WidgetKit
import LearnWithAlphonsoKit

/// The streak widget, in the round-6 design system. Real data only: the streak, the best streak, and whether the
/// learner studied today. Three looks, chosen by `StreakWidgetLook` (Kit): Royal light, Royal night when the device
/// is in dark mode, and Meadow, which stays light even then. Small draws the face; medium adds the best streak and
/// Alphonso. Every colour and type role below is a design system token.
struct StreakWidgetView: View {
    let entry: StreakEntry
    @Environment(\.widgetFamily) private var widgetFamily
    @Environment(\.colorScheme) private var colorScheme

    private static let flameSize: CGFloat = 34
    private static let emptyFlameSize: CGFloat = 44
    /// Width kept clear on the right of the medium face for Alphonso (the pose is 0.47 as wide as it is tall).
    private static let alphonsoColumn: CGFloat = AlphonsoDS.Space.s12 + AlphonsoDS.Space.s6

    private var look: StreakWidgetLook {
        StreakWidgetLook.resolve(theme: entry.snapshot?.theme, deviceDark: colorScheme == .dark)
    }

    private var colors: AlphonsoDS.Colors {
        AlphonsoDS.colors(look.palette, night: look.night)
    }

    private var layout: StreakWidgetLayout {
        StreakWidgetLayout.resolve(family: widgetFamily == .systemMedium ? .medium : .small, hasSnapshot: entry.snapshot != nil)
    }

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                content(for: snapshot)
            } else {
                emptyState
            }
        }
        // Required since iOS 17 (the app's own deploymentTarget). The background is the design system surface in
        // the resolved look, with Alphonso standing in the corner of the wide widget.
        .containerBackground(for: .widget) {
            colors.surface.overlay(alignment: .bottomTrailing) {
                if layout.showsAlphonso {
                    Image("AlphonsoStreakFlame")
                        .resizable()
                        .scaledToFit()
                        .padding(.top, AlphonsoDS.Space.s4)
                        .padding(.trailing, AlphonsoDS.Space.s2)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func content(for snapshot: StreakWidgetSnapshot) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Image("Fire")
                        .resizable()
                        .scaledToFit()
                        .frame(width: Self.flameSize, height: Self.flameSize)
                        .accessibilityHidden(true)
                    Text("\(snapshot.streak)")
                        .font(WidgetFont.font(AlphonsoDS.Typography.displayXL))
                        .foregroundStyle(colors.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                Text(StreakWidgetCopy.caption(streak: snapshot.streak))
                    .font(WidgetFont.font(AlphonsoDS.Typography.footnote))
                    .foregroundStyle(colors.inkSoft)
                if layout.showsBest {
                    Text(StreakWidgetCopy.best(streak: snapshot.streak, longestStreak: snapshot.longestStreak))
                        .font(WidgetFont.font(AlphonsoDS.Typography.caption))
                        .foregroundStyle(colors.inkSoft)
                        .padding(.top, AlphonsoDS.Space.s1)
                }
                Spacer(minLength: 0)
                statusChip(studiedToday: snapshot.studiedToday)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if layout.showsAlphonso {
                Color.clear.frame(width: Self.alphonsoColumn)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func statusChip(studiedToday: Bool) -> some View {
        HStack(spacing: AlphonsoDS.Space.s1) {
            Image(systemName: studiedToday ? "checkmark" : "circle")
            Text(studiedToday ? StreakWidgetCopy.studiedToday : StreakWidgetCopy.notStudiedYet)
        }
        .font(WidgetFont.font(AlphonsoDS.Typography.caption))
        .foregroundStyle(studiedToday ? colors.rightInk : colors.actionText)
        .padding(.horizontal, AlphonsoDS.Space.s2)
        .padding(.vertical, AlphonsoDS.Space.s1)
        .background(
            studiedToday ? colors.rightTint : colors.actionTint,
            in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key)
        )
    }

    private var emptyState: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Image("Fire")
                .resizable()
                .scaledToFit()
                .frame(width: Self.emptyFlameSize, height: Self.emptyFlameSize)
                .accessibilityHidden(true)
            Text(StreakWidgetCopy.empty)
                .font(WidgetFont.font(AlphonsoDS.Typography.footnote))
                .foregroundStyle(colors.ink)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
