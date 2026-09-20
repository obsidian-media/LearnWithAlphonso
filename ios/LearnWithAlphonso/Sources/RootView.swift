import SwiftUI
import LearnWithAlphonsoKit

struct RootView: View {
    let session: Session
    let contentStore: ContentStore
    let entitlementStore: EntitlementStore
    let notificationScheduler: NotificationScheduler
    let networkMonitor: NetworkMonitor
    let syncQueueStore: SyncQueueStore

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        switch session.state {
        case .signedOut, .awaitingCode:
            AuthView(session: session)
        case .signedIn:
            TabView {
                LessonBrowserView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
                    .tabItem { Label("Learn", systemImage: "book.fill") }
                ReviewQueueView(contentStore: contentStore, session: session, notificationScheduler: notificationScheduler, networkMonitor: networkMonitor, syncQueueStore: syncQueueStore)
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
            .task { await triggerSync() }
            .onChange(of: networkMonitor.isConnected) { wasConnected, isConnected in
                if !wasConnected && isConnected {
                    Task { await triggerSync() }
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    Task { await triggerSync() }
                }
            }
        }
    }

    /// Drains the offline sync queue (docs/v2-kickoffs/01-offline-first.md)
    /// on connectivity regain and app foreground -- both, since a
    /// connectivity transition can be missed entirely while backgrounded.
    /// Safe to call opportunistically: an empty queue is a no-op, and
    /// SyncEngine.sync leaves any failed item queued for the next trigger.
    private func triggerSync() async {
        guard let accessToken = session.accessToken else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        let result = await SyncEngine.sync(
            pendingLessonCompletions: syncQueueStore.pendingLessonCompletions(),
            pendingReviewGrades: syncQueueStore.pendingReviewGrades(),
            client: client
        )
        syncQueueStore.removeSyncedLessonCompletions(result.syncedLessonCompletions)
        syncQueueStore.removeSyncedReviewGrades(result.syncedReviewGrades)
        if let lastKnownProgress = result.lastKnownProgress {
            syncQueueStore.updateLastKnownProgress(lastKnownProgress)
        } else {
            syncQueueStore.markSyncedNow()
        }
    }
}
