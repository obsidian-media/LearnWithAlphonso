import SwiftUI
import LearnWithAlphonsoKit

/// Profile: the hub for everything that left the tab bar in Phase 0 of the
/// podcast work (docs/superpowers/specs/2026-09-24-podcast-phase0-ios-tabs-design.md).
///
/// Seven tabs were declared and iPhone renders five, so Achievements was
/// already collapsed into the system "More" list before Listen needed a
/// slot. League, Friends and Achievements move here.
///
/// Destinations are presented modally rather than pushed. Each of those
/// three screens owns its own `NavigationStack` -- LeaderboardView and
/// FriendsView additionally push Teams/Season/Duels through it -- so
/// pushing them inside this view's stack would nest navigation stacks and
/// give two navigation bars and unreliable inner links. That compiles
/// cleanly and is wrong on a screen, which is the failure mode this repo
/// has already paid for three times. Presenting them keeps those three
/// working screens untouched, and matches how LessonBrowserView already
/// presents SettingsView from its gear.
struct ProfileHubView: View {
    let session: Session
    let contentStore: ContentStore
    let notificationScheduler: NotificationScheduler

    private enum Destination: String, Identifiable {
        case league, friends, achievements, settings
        var id: String { rawValue }
    }

    @State private var destination: Destination?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(
                        .league,
                        title: "League",
                        subtitle: "Leaderboards, teams, and the season ladder",
                        emoji: "🏆"
                    )
                    row(
                        .friends,
                        title: "Friends",
                        subtitle: "Your friends, their activity, and duels",
                        emoji: "👥"
                    )
                    row(
                        .achievements,
                        title: "Achievements",
                        subtitle: "Badges earned and weak spots to work on",
                        emoji: "⭐️"
                    )
                }
                .listRowBackground(Color.clear)

                Section {
                    row(
                        .settings,
                        title: "Settings",
                        subtitle: "Theme and account",
                        emoji: "⚙️"
                    )
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Profile")
        }
        .tint(AlphonsoColor.moss)
        .sheet(item: $destination) { destination in
            switch destination {
            case .league:
                LeaderboardView(session: session)
            case .friends:
                FriendsView(session: session)
            case .achievements:
                AchievementsView(
                    session: session,
                    contentStore: contentStore,
                    notificationScheduler: notificationScheduler
                )
            case .settings:
                SettingsView(session: session)
            }
        }
    }

    private func row(
        _ target: Destination,
        title: String,
        subtitle: String,
        emoji: String
    ) -> some View {
        Button {
            destination = target
        } label: {
            AlphonsoRowCard(title: title, subtitle: subtitle, leadingEmoji: emoji)
        }
        .buttonStyle(.plain)
    }
}
