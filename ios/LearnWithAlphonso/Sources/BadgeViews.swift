import SwiftUI
import LearnWithAlphonsoKit

// The collectible badge set (round 12): one sculpted medallion per achievement, drawn from the asset catalog, in three
// states. Earned is full colour, in progress is dimmed with a gold ring that fills, locked is a grey silhouette with a
// lock. The state itself comes from the Kit (`BadgePresentation.states`); nothing here decides it.

/// One medallion at a size, in a state.
struct BadgeMedallion: View {
    let id: String
    let size: CGFloat
    let state: BadgeState
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ZStack {
            if let fraction = state.fraction {
                Circle().strokeBorder(ds.line, lineWidth: AlphonsoDS.Space.s1)
                    .frame(width: size + AlphonsoDS.Space.s3, height: size + AlphonsoDS.Space.s3)
                Circle().trim(from: 0, to: fraction)
                    .stroke(ds.xp, style: StrokeStyle(lineWidth: AlphonsoDS.Space.s1, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: size + AlphonsoDS.Space.s3 - AlphonsoDS.Space.s1, height: size + AlphonsoDS.Space.s3 - AlphonsoDS.Space.s1)
            }
            Image(BadgePresentation.artName(id: id))
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
                .saturation(saturation)
                .brightness(brightness)
                .opacity(opacity)
                .shadow(color: ds.brand.opacity(state == .earned ? 0.3 : 0), radius: AlphonsoDS.Space.s2, y: AlphonsoDS.Space.s1)
            if state == .locked {
                Image(systemName: "lock.fill")
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .frame(width: AlphonsoDS.Space.s6, height: AlphonsoDS.Space.s6)
                    .background(Circle().fill(ds.card))
                    .overlay(Circle().strokeBorder(ds.line, lineWidth: 2))
                    .frame(width: size, height: size, alignment: .bottomTrailing)
            }
        }
        .frame(width: size + AlphonsoDS.Space.s3, height: size + AlphonsoDS.Space.s3)
        // Decorative: the name beside it says what the badge is, and the state is spoken by the cell.
        .accessibilityHidden(true)
    }

    private var saturation: Double {
        switch state {
        case .earned: return 1
        case .progress: return 0.15
        case .locked: return 0
        }
    }

    private var brightness: Double {
        switch state {
        case .earned: return 0
        case .progress: return -0.18
        case .locked: return -0.38
        }
    }

    private var opacity: Double {
        switch state {
        case .earned: return 1
        case .progress: return 0.82
        case .locked: return 0.55
        }
    }
}

/// What VoiceOver says for a badge's state.
func badgeStateSpeech(_ state: BadgeState) -> String {
    switch state {
    case .earned: return "Unlocked"
    case let .progress(value, threshold): return "In progress, \(BadgePresentation.progressLine(value: value, threshold: threshold))"
    case .locked: return "Locked"
    }
}

/// A badge on the Achievements grid: the medallion over its name, and its description (or its progress).
struct BadgeGridCell: View {
    let achievement: Achievement
    let state: BadgeState
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            VStack(spacing: AlphonsoDS.Space.s1 + 2) {
                BadgeMedallion(id: achievement.id, size: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s8, state: state)
                Text(achievement.title).dsText(.footnote)
                    .foregroundStyle(state == .locked ? ds.inkSoft : ds.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if case let .progress(value, threshold) = state {
                    Text(BadgePresentation.progressLine(value: value, threshold: threshold))
                        .dsText(.caption).foregroundStyle(ds.actionText)
                } else {
                    Text(achievement.description).dsText(.caption).foregroundStyle(ds.inkSoft)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .padding(.horizontal, AlphonsoDS.Space.s1 + 2)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .fill((state == .locked ? ds.sunk : ds.card).opacity(0.94)))
            .dsElevation(state == .locked ? [] : AlphonsoDS.Elevation.resting, line: ds.line)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(achievement.title). \(achievement.description)")
        .accessibilityValue(badgeStateSpeech(state))
        .accessibilityHint("Opens the details")
    }
}

/// The detail sheet for one badge: a large medallion (on a glow when earned), its name and tier, where the learner is
/// (a progress card, or the unlock day), and the family ladder.
struct AchievementDetailSheet: View {
    let achievement: Achievement
    let catalog: [Achievement]
    let states: [String: BadgeState]
    /// "Nov 9, 2026" for an earned badge, when the profile data has the day.
    let unlockedOn: String?
    let onClose: () -> Void
    @Environment(\.alphonsoDS) private var ds

    private var state: BadgeState { states[achievement.id] ?? .locked }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AlphonsoDS.Space.s3) {
                    hero
                    statusCard
                    ladderCard
                }
                .padding(.horizontal, AlphonsoDS.Space.gutter)
                .padding(.vertical, AlphonsoDS.Space.s3)
            }
            .background(ds.surface)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onClose)
                }
            }
        }
        .tint(ds.choice)
    }

    private var hero: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            ZStack {
                if state == .earned {
                    Circle()
                        .fill(RadialGradient(colors: [ds.xpTint, ds.xpTint.opacity(0)], center: .center,
                                             startRadius: 0, endRadius: AlphonsoDS.Space.s12 * 2))
                        .frame(width: AlphonsoDS.Space.s12 * 4, height: AlphonsoDS.Space.s12 * 4)
                }
                BadgeMedallion(id: achievement.id, size: AlphonsoDS.Space.s12 * 3 + AlphonsoDS.Space.s2, state: state)
            }
            Text(achievement.title).dsText(.display).foregroundStyle(ds.ink).multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            DSPill(text: BadgePresentation.tierLabel(id: achievement.id, tier: achievement.tier), tone: tierTone)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(achievement.title), \(BadgePresentation.tierLabel(id: achievement.id, tier: achievement.tier)), \(badgeStateSpeech(state))")
        .accessibilityAddTraits(.isHeader)
    }

    private var tierTone: DSPill.Tone {
        switch achievement.tier {
        case "silver": return .neutral
        case "diamond": return .info
        default: return .gold
        }
    }

    @ViewBuilder private var statusCard: some View {
        switch state {
        case let .progress(value, threshold):
            DSCard(spacing: AlphonsoDS.Space.s2) {
                HStack {
                    Text(BadgePresentation.progressLine(value: value, threshold: threshold))
                        .dsText(.headline).foregroundStyle(ds.ink)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    DSPill(text: "\(BadgePresentation.percent(value: value, threshold: threshold))%", tone: .gold)
                }
                DSProgressBar(
                    fraction: BadgePresentation.fraction(value: value, threshold: threshold),
                    tint: ds.xp,
                    accessibilityLabel: "Progress",
                    accessibilityValue: BadgePresentation.progressLine(value: value, threshold: threshold))
                Text(achievement.description).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .earned:
            DSCard {
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Icon3DView(emoji: "\u{2705}", size: AlphonsoDS.Space.s8)
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        Text("Unlocked").dsText(.headline).foregroundStyle(ds.ink)
                        if let unlockedOn {
                            Text(unlockedOn).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        } else {
                            Text(achievement.description).dsText(.footnote).foregroundStyle(ds.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .combine)
            }
        case .locked:
            DSCard {
                Text("Locked").dsText(.headline).foregroundStyle(ds.ink)
                Text(achievement.description).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var ladderCard: some View {
        let rungs = BadgePresentation.ladder(for: achievement, in: catalog)
        return DSCard {
            DSOverline("\(BadgePresentation.familyName(achievement.category)) ladder")
            HStack(alignment: .bottom) {
                ForEach(rungs) { rung in
                    let current = rung.id == achievement.id
                    VStack(spacing: AlphonsoDS.Space.s1) {
                        BadgeMedallion(
                            id: rung.id,
                            size: current ? AlphonsoDS.Space.s12 + AlphonsoDS.Space.s3 : AlphonsoDS.Space.s12 - AlphonsoDS.Space.s1,
                            state: states[rung.id] ?? .locked)
                        Text(BadgePresentation.grouped(rung.threshold)).dsText(.caption)
                            .foregroundStyle(current ? ds.actionText : ds.inkSoft)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(rung.title), \(rung.threshold)")
                    .accessibilityValue(badgeStateSpeech(states[rung.id] ?? .locked))
                }
            }
        }
    }
}

/// The unlock moment (slides up after the lesson-complete celebration, or from a tap on its toast): confetti dots in
/// the robe colours, Alphonso beside the new medallion on a gold glow, the label, name, description, tier chip, the
/// one-line celebration for a streak badge, and Continue. Reduce Motion: no confetti, the sheet just appears.
struct AchievementUnlockSheet: View {
    let achievement: Achievement
    let onClose: () -> Void
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // Scrolls so Continue (pinned below) never leaves the screen at the largest text sizes.
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s3) {
                HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
                    Image("Alphonso-\(BadgePresentation.unlockPose(category: achievement.category))")
                        .resizable().scaledToFit()
                        .frame(height: AlphonsoDS.Space.s12 * 4)
                        .accessibilityHidden(true)
                    ZStack {
                        Circle()
                            .fill(RadialGradient(colors: [ds.xpTint, ds.xpTint.opacity(0)], center: .center,
                                                 startRadius: 0, endRadius: AlphonsoDS.Space.s12 * 2))
                            .frame(width: AlphonsoDS.Space.s12 * 4, height: AlphonsoDS.Space.s12 * 4)
                        BadgeMedallion(id: achievement.id, size: AlphonsoDS.Space.s12 * 3 + AlphonsoDS.Space.s2, state: .earned)
                    }
                }
                DSOverline("Achievement unlocked")
                Text(achievement.title).dsText(.display).foregroundStyle(ds.ink).multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(achievement.description).dsText(.body).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                DSPill(text: BadgePresentation.tierLabel(id: achievement.id, tier: achievement.tier), tone: .gold)
                if let line = BadgePresentation.celebrationLine(category: achievement.category, threshold: achievement.threshold) {
                    Text(line).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(AlphonsoDS.Space.gutter)
            .frame(maxWidth: .infinity)
        }
        .background(ds.surface)
        // The robe-colour confetti falls behind the content; under Reduce Motion there is none.
        .overlay {
            if !reduceMotion {
                LessonConfettiView(reduce: false).allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button("Continue", action: onClose)
                .buttonStyle(.dsButton(.primary))
                .padding(AlphonsoDS.Space.gutter)
                .background(ds.surface)
        }
        .presentationDetents([.large])
        .accessibilityElement(children: .contain)
    }
}
