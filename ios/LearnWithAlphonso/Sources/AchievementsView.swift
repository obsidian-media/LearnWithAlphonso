import SwiftUI
import LearnWithAlphonsoKit

/// A screen listing every achievement (locked and unlocked), matching the
/// web app's catalog display on /profile (src/components/AchievementBadge.tsx
/// + profile.tsx). Catalog is bundled (ContentStore.achievements, same
/// pattern as curriculum/scenarios); per-user unlock state comes from
/// fetchUnlockedAchievements(), an RLS-scoped read of user_achievements.
///
/// NOTE: unlike the web's locked-achievement display, this screen does not
/// show a numeric progress toward locked achievements. complete-lesson's
/// own upsert logic (supabase/functions/complete-lesson/index.ts) only
/// ever writes a user_achievements row once an achievement's threshold is
/// actually crossed -- there's no RLS-readable source for a locked
/// achievement's current running stat (lessons completed, perfect-lesson
/// count, league promotions aren't exposed via any other read this client
/// has). Locked achievements are shown greyed out instead of with a
/// fabricated or inaccurate progress number.
struct AchievementsView: View {
    let session: Session
    let contentStore: ContentStore
    let notificationScheduler: NotificationScheduler

    @State private var unlockedByID: [String: UnlockedAchievement] = [:]
    @State private var weaknessTrend: [WeaknessTrendEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var unlockedCount: Int { unlockedByID.count }
    private var totalCount: Int { contentStore.achievements.count }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView().tint(AlphonsoColor.moss)
                } else {
                    ScrollView {
                        if let errorMessage {
                            Text(errorMessage)
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                                .padding(.top, 8)
                        }
                        Text("\(unlockedCount) of \(totalCount) unlocked")
                            .font(AlphonsoFont.sans(12, weight: .medium))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .padding(.top, 8)

                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: AlphonsoSpacing.sm + 4)], spacing: AlphonsoSpacing.sm + 4) {
                            ForEach(contentStore.achievements) { achievement in
                                AchievementBadgeView(achievement: achievement, unlocked: unlockedByID[achievement.id] != nil)
                            }
                        }
                        .padding()

                        if !weaknessTrend.isEmpty {
                            WeaknessTrendSection(entries: weaknessTrend)
                                .padding(.horizontal)
                                .padding(.bottom)
                        }
                    }
                    .background(AlphonsoColor.surface)
                }
            }
            .navigationTitle("Achievements")
        }
        .tint(AlphonsoColor.moss)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        guard let accessToken = session.accessToken else {
            errorMessage = "You've been signed out. Please sign in again."
            isLoading = false
            return
        }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            let unlocked = try await client.fetchUnlockedAchievements()
            unlockedByID = Dictionary(uniqueKeysWithValues: unlocked.map { ($0.achievementID, $0) })
        } catch {
            errorMessage = "Couldn't load your unlock status -- showing the full catalog."
        }
        // Best-effort: a weakness-trend failure shouldn't block the
        // achievements catalog itself from showing.
        weaknessTrend = (try? await client.fetchWeaknessTrend()) ?? []
        notificationScheduler.scheduleWeaknessPracticeNudge(
            openCategories: weaknessTrend.filter { $0.openCount > 0 }.map(\.category)
        )
        isLoading = false
    }
}

/// V3 package 3b -- mirrors profile.tsx's "Weakness trend" section exactly:
/// per-category detected/resolved history from `weakness_events`, "Still
/// working on it" while more categories are open than resolved, "Mastered"
/// once they even out.
struct WeaknessTrendSection: View {
    let entries: [WeaknessTrendEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm + 2) {
            Text("Weakness trend")
                .font(AlphonsoFont.display(18, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("Grammar gaps we've spotted, and how they're going")
                .font(AlphonsoFont.sans(12))
                .foregroundStyle(AlphonsoColor.inkSoft)
            VStack(spacing: AlphonsoSpacing.sm) {
                ForEach(entries.prefix(8), id: \.category) { entry in
                    HStack {
                        Text(entry.category.replacingOccurrences(of: "-", with: " ").capitalized)
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.ink)
                        Spacer()
                        if entry.openCount > 0 {
                            Text("Still working on it")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ember)
                        } else {
                            Text("Mastered (\(entry.resolvedCount)\u{00D7})")
                                .font(AlphonsoFont.sans(12, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.moss)
                        }
                    }
                }
            }
            .padding(AlphonsoSpacing.sm + 4)
            .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous))
        }
    }
}

/// Ports AchievementBadge.tsx exactly: tier color when unlocked, a neutral
/// grey + reduced opacity when locked, same glyph-per-icon mapping (using
/// SF Symbols in place of the web's inline SVGs).
struct AchievementBadgeView: View {
    let achievement: Achievement
    let unlocked: Bool

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbolName)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(unlocked ? tierColor : Color(white: 0.78))
                .clipShape(Circle())
            Text(achievement.title)
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(achievement.description)
                .font(AlphonsoFont.sans(11))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .padding(AlphonsoSpacing.sm + 4)
        .frame(maxWidth: .infinity)
        .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous))
        .opacity(unlocked ? 1 : 0.55)
    }

    /// Exact hex ports of AchievementBadge.tsx's TIER_COLORS.
    private var tierColor: Color {
        switch achievement.tier {
        case "bronze": return Color(hex: 0xB07242)
        case "silver": return Color(hex: 0x8A9099)
        case "gold": return Color(hex: 0xC4933F)
        case "diamond": return Color(hex: 0x4A7F7A)
        default: return Color(white: 0.53)
        }
    }

    private var symbolName: String {
        switch achievement.icon {
        case "flame": return "flame.fill"
        case "bolt": return "bolt.fill"
        case "star": return "star.fill"
        case "check": return "checkmark"
        case "shield": return "shield.fill"
        case "snow": return "snowflake"
        default: return "circle.fill"
        }
    }
}

// Color(hex:) now lives in DesignSystem/AlphonsoTheme.swift (shared across
// the app) -- this file's own copy was removed to avoid a duplicate
// `init(hex:)` declaration on the same type in the same module.
