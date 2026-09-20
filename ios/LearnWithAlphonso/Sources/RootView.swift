import SwiftUI
import LearnWithAlphonsoKit

struct RootView: View {
    let session: Session
    let contentStore: ContentStore
    let entitlementStore: EntitlementStore
    let notificationScheduler: NotificationScheduler

    var body: some View {
        switch session.state {
        case .signedOut, .awaitingCode:
            AuthView(session: session)
        case .signedIn:
            TabView {
                LessonBrowserView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler)
                    .tabItem { Label("Learn", systemImage: "book.fill") }
                ReviewQueueView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler)
                    .tabItem { Label("Review", systemImage: "arrow.clockwise") }
                LeaderboardView(session: session)
                    .tabItem { Label("League", systemImage: "trophy.fill") }
                FriendsView(session: session)
                    .tabItem { Label("Friends", systemImage: "person.2.fill") }
                ConversationView(contentStore: contentStore, session: session)
                    .tabItem { Label("Practice", systemImage: "mic.fill") }
                HectorView(session: session, entitlementStore: entitlementStore)
                    .tabItem { Label("Hector", systemImage: "sparkles") }
                AchievementsView(session: session, contentStore: contentStore)
                    .tabItem { Label("Achievements", systemImage: "trophy.fill") }
            }
        }
    }
}
