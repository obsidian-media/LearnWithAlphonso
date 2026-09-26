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
            VStack(spacing: AlphonsoSpacing.sm) {
                // Streak/hearts/XP/league in one HStack has no wrap fallback
                // -- fine at the default text size, but four capsules plus
                // a badge overflow the screen width once Dynamic Type grows
                // all four simultaneously at large accessibility sizes.
                // ViewThatFits measures both candidates and picks whichever
                // actually fits, so this needs no manual size-category
                // threshold: the single-row layout is used as long as it
                // fits, and it drops to two rows only once it doesn't.
                ViewThatFits(in: .horizontal) {
                    // 1. Everything in one row -- the original layout,
                    // used as long as it actually fits.
                    HStack(spacing: AlphonsoSpacing.sm) {
                        streakPill(progress: progress)
                        statPill(icon: "heart.fill", value: "\(progress.hearts)", tint: AlphonsoColor.destructive)
                        statPill(icon: "star.fill", value: "\(progress.xp)", tint: AlphonsoColor.moss)
                        Spacer()
                        leagueBadge(progress: progress)
                    }

                    // 2. Three stat pills on their own row, league badge
                    // below -- tried once the full row above no longer fits.
                    VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                        HStack(spacing: AlphonsoSpacing.sm) {
                            streakPill(progress: progress)
                            statPill(icon: "heart.fill", value: "\(progress.hearts)", tint: AlphonsoColor.destructive)
                            statPill(icon: "star.fill", value: "\(progress.xp)", tint: AlphonsoColor.moss)
                        }
                        leagueBadge(progress: progress)
                    }

                    // 3. Fully stacked -- the fallback ViewThatFits commits
                    // to if nothing else fits (at the largest accessibility
                    // sizes, even three pills side by side can overflow).
                    // Each pill is left-aligned on its own row rather than
                    // centered/stretched, matching how the rows above read.
                    VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                        streakPill(progress: progress)
                        statPill(icon: "heart.fill", value: "\(progress.hearts)", tint: AlphonsoColor.destructive)
                        statPill(icon: "star.fill", value: "\(progress.xp)", tint: AlphonsoColor.moss)
                        leagueBadge(progress: progress)
                    }
                }

                // Direct user feedback (see this file's own header doc
                // comment) was that the Learn tab "feels like an empty
                // piece of background with some written knowledge on
                // it" -- this banner is the fix for the top of that
                // screen specifically (LessonBrowserView's row-card
                // work below addresses the rest of it).
                AlphonsoMascotBanner(mascot: .alphonso, message: greeting(streak: progress.streak))
            }
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .springEntrance(response: 0.55, dampingFraction: 0.7, minScale: 0.9)
        }
    }

    private func greeting(streak: Int) -> String {
        streak > 0 ? "Nice \(streak)-day streak! Ready for today's lesson?" : "Ready for today's lesson?"
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

    private func streakPill(progress: LessonCompletionProgress) -> some View {
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
    }

    private func leagueBadge(progress: LessonCompletionProgress) -> some View {
        Text(LeagueTierPalette.label(for: progress.leagueTier))
            .font(AlphonsoFont.sans(12, weight: .semiBold))
            .foregroundStyle(.white)
            .padding(.horizontal, AlphonsoSpacing.sm + 2)
            .padding(.vertical, 6)
            .background(LeagueTierPalette.color(for: progress.leagueTier), in: Capsule())
    }
}
