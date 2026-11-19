import SwiftUI
import LearnWithAlphonsoKit

/// The slim status row at the top of the Learn tab (streak with its protected mark, hearts, XP and the league badge,
/// small pills in one line). iOS has no cross-tab top bar like the web's, so the stats stay here. The old big tiles
/// are gone; the streak pill is also the way to the streak-freeze shop. Originally: the app had no
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
    /// Tapping the streak pill opens the streak-freeze shop (the host shows or hides its row). nil: the pill is plain.
    var onStreakTap: (() -> Void)? = nil
    /// Whether that row is showing, spoken as the pill's value.
    var freezeShopOpen = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        if let progress {
            VStack(spacing: AlphonsoDS.Space.s2) {
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
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        streakPill(progress: progress)
                        heartsPill(progress: progress)
                        statPill(icon: .boltSolid, tint: ds.xp, label: "XP", value: "\(progress.xp)")
                        Spacer()
                        leagueBadge(progress: progress)
                    }

                    // 2. Three stat pills on their own row, league badge
                    // below -- tried once the full row above no longer fits.
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            streakPill(progress: progress)
                            heartsPill(progress: progress)
                            statPill(icon: .boltSolid, tint: ds.xp, label: "XP", value: "\(progress.xp)")
                        }
                        leagueBadge(progress: progress)
                    }

                    // 3. Fully stacked -- the fallback ViewThatFits commits
                    // to if nothing else fits (at the largest accessibility
                    // sizes, even three pills side by side can overflow).
                    // Each pill is left-aligned on its own row rather than
                    // centered/stretched, matching how the rows above read.
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        streakPill(progress: progress)
                        heartsPill(progress: progress)
                        statPill(icon: .boltSolid, tint: ds.xp, label: "XP", value: "\(progress.xp)")
                        leagueBadge(progress: progress)
                    }
                }

                // The greeting that used to be a small banner here is now Alphonso's speech bubble on
                // the Learn hero stage (LearnHeroStage), built from `greeting(streak:)` below.
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.vertical, AlphonsoDS.Space.s2)
            .springEntrance(response: 0.55, dampingFraction: 0.7, minScale: 0.9)
        }
    }

    /// What Alphonso says on the Learn screen. The path map shows it in his speech bubble.
    static func greeting(streak: Int) -> String {
        streak > 0 ? "Nice \(streak)-day streak! Ready for today's lesson?" : "Ready for today's lesson?"
    }

    /// One HUD pill: the drawn icon, then the number. Round 6 draws the HUD pills fully round on the card colour, 40 pt
    /// high, the number in the headline role with tabular figures.
    private func hudPill<Icon: View>(@ViewBuilder icon: () -> Icon, value: String, hint: String? = nil, trailingChevron: String? = nil) -> some View {
        HStack(spacing: AlphonsoDS.Space.s1 + 2) {
            icon()
            Text(value).dsText(.headline).monospacedDigit().foregroundStyle(ds.ink)
            if let hint {
                Text(hint).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            // A tappable pill says so: the chevron shows (and flips) the streak-freeze shop.
            if let trailingChevron {
                Image(systemName: trailingChevron).font(.caption2.weight(.bold)).foregroundStyle(ds.inkSoft).accessibilityHidden(true)
            }
        }
        .padding(.leading, AlphonsoDS.Space.s2 + 2)
        .padding(.trailing, AlphonsoDS.Space.s3)
        .frame(minHeight: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1)
        .background(Capsule().fill(ds.card.opacity(0.94)))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
    }

    // icon is decorative (hidden) and value alone is a bare number ("5")
    // with no unit -- combine + an explicit label ("Hearts: 5") is the only
    // way VoiceOver can tell this pill apart from any other bare-number
    // pill next to it.
    private func statPill(icon: AlphonsoDS.Icon, tint: Color, label: String, value: String, hint: String? = nil, spokenHint: String? = nil) -> some View {
        hudPill(icon: { DSIconView(icon: icon, size: AlphonsoDS.Space.s5 + 2).foregroundStyle(tint) }, value: value, hint: hint)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spokenHint.map { "\(label): \(value), \($0)" } ?? "\(label): \(value)")
    }

    /// The hearts counter. Below the cap it ticks on its own: a heart that has come due appears without a sync (the same
    /// rule the server applies), and the wait for the next one shows beside the count.
    @ViewBuilder
    private func heartsPill(progress: LessonCompletionProgress) -> some View {
        if progress.hearts < HeartsEconomy.maxHearts {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let shown = HeartsEconomy.resolveHeartsRefill(
                    hearts: progress.hearts,
                    heartsRefillAt: progress.heartsRefillAt.map { Date(timeIntervalSince1970: $0 / 1000) },
                    now: context.date)
                let wait = HeartsEconomy.nextHeartCountdown(
                    hearts: shown.hearts, heartsRefillAt: shown.heartsRefillAt, now: context.date)
                statPill(
                    icon: .heartSolid, tint: ds.heart, label: "Hearts", value: "\(shown.hearts)",
                    hint: wait.map { "+1 in \($0)" },
                    spokenHint: wait.map { "next heart in \($0)" })
            }
        } else {
            statPill(icon: .heartSolid, tint: ds.heart, label: "Hearts", value: "\(progress.hearts)")
        }
    }

    /// The streak as it reads today (StreakDisplay, the server's own rule): alive only by a freeze reads as
    /// protected, a run the next lesson would restart reads 0. The profile tile uses the same function.
    static func displayedStreak(_ progress: LessonCompletionProgress, now: Date = Date()) -> StreakDisplay.Shown {
        StreakDisplay.shown(progress, now: now)
    }

    static func shownStreak(_ progress: LessonCompletionProgress?, now: Date = Date()) -> Int {
        progress.map { displayedStreak($0, now: now).streak } ?? 0
    }

    @ViewBuilder
    private func streakPill(progress: LessonCompletionProgress) -> some View {
        let shown = Self.displayedStreak(progress)
        let pill = hudPill(icon: {
            DSIconView(icon: .flameSolid, size: AlphonsoDS.Space.s5 + 2).foregroundStyle(ds.flame).pulsingGlow()
                .overlay(alignment: .bottomTrailing) {
                    if shown.state == .protected {
                        // Missed days a streak freeze covers: the same snowflake the freeze row uses.
                        Image(systemName: "snowflake")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(ds.choice)
                            .padding(1)
                            .background(Circle().fill(ds.card))
                            .offset(x: 4, y: 4)
                    }
                }
        }, value: "\(shown.streak)", trailingChevron: onStreakTap != nil ? (freezeShopOpen ? "chevron.up" : "chevron.down") : nil)
        if let onStreakTap {
            Button(action: onStreakTap) {
                pill
                    .padding(.vertical, AlphonsoDS.Space.s1)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(StreakDisplay.accessibilityLabel(shown))
            .accessibilityValue(freezeShopOpen ? "Streak freezes shown" : "")
            .accessibilityHint(freezeShopOpen ? "Double tap to hide streak freezes" : "Double tap for streak freezes")
            .accessibilityAddTraits(.isButton)
        } else {
            pill
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(StreakDisplay.accessibilityLabel(shown))
        }
    }

    private func leagueBadge(progress: LessonCompletionProgress) -> some View {
        Text(LeagueTierPalette.label(for: progress.leagueTier))
            .dsText(.caption)
            .foregroundStyle(ds.onHero)
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .padding(.vertical, AlphonsoDS.Space.s1 + 2)
            .background(LeagueTierPalette.color(for: progress.leagueTier), in: Capsule())
    }
}
