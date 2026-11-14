import SwiftUI
import LearnWithAlphonsoKit

/// A screen listing every achievement (locked and unlocked), matching the
/// web app's catalog display on /profile (src/components/AchievementBadge.tsx
/// + profile.tsx). Catalog is bundled (ContentStore.achievements, same
/// pattern as curriculum/scenarios); per-user unlock state comes from
/// fetchUnlockedAchievements(), an RLS-scoped read of user_achievements.
///
/// Progress toward a locked badge comes from the same batched profile read the Profile card uses
/// (`fetchProfileOverview`, through `ProfileMath.achievementStats`), best effort: without it every badge that is not
/// earned is simply locked, never a made-up number. Which badge shows a ring, and every word about a badge's state, is
/// decided in the Kit (`BadgePresentation`); this view only draws it.
struct AchievementsView: View {
    let session: Session
    let contentStore: ContentStore
    let notificationScheduler: NotificationScheduler
    /// Set when the screen is a sheet (over a lesson): shows a Done button. Nil when it is pushed.
    var onClose: (() -> Void)?

    @State private var unlockedByID: [String: UnlockedAchievement] = [:]
    @State private var stats: [String: Int] = [:]
    @State private var unlockedOn: [String: String] = [:]
    @State private var weaknessTrend: [WeaknessTrendEntry] = []
    /// False when the unlock read failed: the profile read alone cannot say what is earned, so no rings are drawn.
    @State private var unlockStatusKnown = true
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var detail: Achievement?
    @Environment(\.alphonsoDS) private var ds

    private var catalog: [Achievement] { contentStore.achievements }

    private var states: [String: BadgeState] {
        BadgePresentation.states(catalog: catalog, unlocked: Set(unlockedByID.keys), stats: stats,
            unlockStatusKnown: unlockStatusKnown)
    }

    var body: some View {
        NavigationStack {
            List {
                header.dsListRow(top: AlphonsoDS.Space.s2)

                if let errorMessage {
                    Text(errorMessage)
                        .dsText(.footnote).foregroundStyle(ds.wrongInk)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .dsListRow()
                }

                if isLoading {
                    DSCard { ProgressView().tint(ds.choice).frame(maxWidth: .infinity) }
                        .dsListRow()
                } else {
                    grid.dsListRow()
                }

                if !weaknessTrend.isEmpty {
                    DSOverline("Weakness trend").dsListRow(bottom: AlphonsoDS.Space.s2)
                    WeaknessTrendSection(entries: weaknessTrend).dsListRow()
                }
            }
            .dsSceneList(.profile)
            .navigationTitle("Achievements")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onClose {
                    ToolbarItem(placement: .topBarTrailing) { Button("Done", action: onClose) }
                }
            }
        }
        .tint(ds.choice)
        .task { await load() }
        .sheet(item: $detail) { achievement in
            AchievementDetailSheet(
                achievement: achievement, catalog: catalog, states: states,
                unlockedOn: unlockedOn[achievement.id].flatMap { BadgePresentation.unlockedDate($0) },
                onClose: { detail = nil })
                .presentationDetents([.large])
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                Text("Achievements").dsText(.display).foregroundStyle(ds.brand)
                    .accessibilityAddTraits(.isHeader)
                if !isLoading {
                    Text(BadgePresentation.unlockedLine(unlocked: unlockedByID.count, total: catalog.count))
                        .dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
            }
            Spacer(minLength: 0)
            Image("Alphonso-surprised-impressed").resizable().scaledToFit()
                .frame(height: AlphonsoDS.Space.s12 * 2 + AlphonsoDS.Space.s6)
                .accessibilityHidden(true)
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .alphonsoGlass(radius: AlphonsoDS.Radius.bubble)
        .accessibilityElement(children: .contain)
    }

    private var grid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: AlphonsoDS.Space.s2 + 2, alignment: .top), count: 3)
        let current = states
        return LazyVGrid(columns: columns, spacing: AlphonsoDS.Space.s2 + 2) {
            ForEach(catalog) { achievement in
                BadgeGridCell(achievement: achievement, state: current[achievement.id] ?? .locked) {
                    detail = achievement
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        unlockStatusKnown = true
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
            unlockStatusKnown = false
            errorMessage = "Couldn't load your unlock status. Showing the full catalog."
        }
        // Best-effort: the progress numbers and the unlock days come from the profile read. Without it a badge is
        // earned or locked, never a ring.
        if let userID = session.userID,
           let overview = try? await client.fetchProfileOverview(
               userID: userID, course: ActiveCoursePreference.load(for: userID, from: .standard).wireCode) {
            stats = ProfileMath.achievementStats(overview)
            unlockedOn = Dictionary(
                overview.achievements.compactMap { row in row.unlockedAt.map { (row.id, $0) } },
                uniquingKeysWith: { first, _ in first })
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
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard(spacing: AlphonsoDS.Space.s2) {
            Text("Grammar gaps we've spotted, and how they're going")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(Array(entries.prefix(8).enumerated()), id: \.element.category) { index, entry in
                if index > 0 { Divider().overlay(ds.line) }
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Text(entry.category.replacingOccurrences(of: "-", with: " ").capitalized)
                        .dsText(.body).foregroundStyle(ds.ink)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    if entry.openCount > 0 {
                        DSPill(text: "Still working on it", tone: .gold)
                    } else {
                        DSPill(text: "Mastered (\(entry.resolvedCount)\u{00D7})", tone: .good)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}
