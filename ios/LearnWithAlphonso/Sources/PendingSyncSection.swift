import SwiftUI
import LearnWithAlphonsoKit

/// One quiet line on the Learn tab while finished lessons or review answers are waiting to reach the server,
/// with a "Sync now" button when there is a connection. Hidden when nothing is waiting.
///
/// A conditional Section with no `.task` of its own: a List section that is empty produces no row, so a task
/// attached to it would never fire.
struct PendingSyncSection: View {
    let syncQueueStore: SyncQueueStore
    let session: Session
    let isConnected: Bool
    @State private var isSyncing = false

    var body: some View {
        // Read so the line updates when something is queued or a sync pass ends.
        let _ = syncQueueStore.queueRevision
        let waiting = syncQueueStore.pendingCounts(for: session.userID)
        if let message = PendingSyncNotice.message(
            lessons: waiting.lessons, reviewAnswers: waiting.reviewAnswers, isConnected: isConnected)
        {
            Section {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                    HStack(alignment: .firstTextBaseline, spacing: AlphonsoSpacing.sm) {
                        Image(systemName: "icloud.and.arrow.up")
                            .foregroundStyle(AlphonsoColor.inkSoft)
                            .accessibilityHidden(true)
                        Text(message)
                            .font(AlphonsoFont.sans(15, weight: .medium))
                            .foregroundStyle(AlphonsoColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if isConnected {
                        Button(isSyncing ? PendingSyncNotice.syncingTitle : PendingSyncNotice.syncNowTitle) {
                            Task { await syncNow() }
                        }
                        .buttonStyle(.bordered)
                        .tint(AlphonsoColor.moss)
                        .disabled(isSyncing)
                    }
                }
                .padding(.vertical, AlphonsoSpacing.xs)
                .accessibilityElement(children: .contain)
            }
            .listRowBackground(AlphonsoColor.parchment)
        }
    }

    /// The same pass RootView runs on foreground and reconnect, with the same same-account guard.
    private func syncNow() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        guard let accessToken = await session.freshAccessToken(), let userID = session.userID else { return }
        await syncQueueStore.runSync(
            accessToken: accessToken,
            userID: userID,
            refreshAccessToken: { [session] in await session.freshAccessToken(forceRefresh: true) },
            isCurrentAccount: { session.userID == userID })
    }
}
