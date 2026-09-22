import SwiftUI
import LearnWithAlphonsoKit

/// Streak/hearts/XP, shown at the top of the Learn tab -- the app had no
/// always-visible "here's where you stand" summary anywhere before this
/// (direct user feedback: the app "feels like an empty piece of
/// background with some written knowledge on it," no live element).
/// Reads `SyncQueueStore`'s already-cached last-known progress (no new
/// network call -- same "cached, may be a little stale, refreshed after
/// every lesson/sync" tradeoff this app already accepts for
/// `LeagueTierCache`), so it renders instantly and degrades to nothing
/// (not a placeholder skeleton) before the very first sync has ever run.
struct StatusHeaderView: View {
    let progress: LessonCompletionProgress?

    var body: some View {
        if let progress {
            HStack(spacing: AlphonsoSpacing.sm) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(AlphonsoColor.ember)
                        .pulsingGlow()
                    Text("\(progress.streak)")
                        .font(AlphonsoFont.sans(15, weight: .bold))
                        .foregroundStyle(AlphonsoColor.ink)
                }
                .padding(.horizontal, AlphonsoSpacing.sm + 2)
                .padding(.vertical, 6)
                .background(AlphonsoColor.parchment, in: Capsule())
                .overlay(Capsule().strokeBorder(AlphonsoColor.hairline, lineWidth: 1))

                statPill(icon: "heart.fill", value: "\(progress.hearts)", tint: AlphonsoColor.destructive)
                statPill(icon: "star.fill", value: "\(progress.xp)", tint: AlphonsoColor.moss)

                Spacer()

                Text(LeagueTierPalette.label(for: progress.leagueTier))
                    .font(AlphonsoFont.sans(12, weight: .semiBold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, AlphonsoSpacing.sm + 2)
                    .padding(.vertical, 6)
                    .background(LeagueTierPalette.color(for: progress.leagueTier), in: Capsule())
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .springEntrance(response: 0.55, dampingFraction: 0.7, minScale: 0.9)
        }
    }

    private func statPill(icon: String, value: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(value)
                .font(AlphonsoFont.sans(15, weight: .bold))
                .foregroundStyle(AlphonsoColor.ink)
        }
        .padding(.horizontal, AlphonsoSpacing.sm + 2)
        .padding(.vertical, 6)
        .background(AlphonsoColor.parchment, in: Capsule())
        .overlay(Capsule().strokeBorder(AlphonsoColor.hairline, lineWidth: 1))
    }
}
