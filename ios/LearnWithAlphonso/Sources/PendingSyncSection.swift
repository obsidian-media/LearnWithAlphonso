import SwiftUI
import LearnWithAlphonsoKit

/// One quiet line on the Learn tab while finished lessons or review answers are waiting to reach the server,
/// with a "Sync now" button when there is a connection. Hidden when nothing is waiting.
///
/// A conditional row with no `.task` of its own: a List row that draws nothing produces no row, so a task
/// attached to it would never fire.
struct PendingSyncSection: View {
    let syncQueueStore: SyncQueueStore
    let session: Session
    let isConnected: Bool
    @State private var isSyncing = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        // Read so the line updates when something is queued or a sync pass ends.
        let _ = syncQueueStore.queueRevision
        let waiting = syncQueueStore.pendingCounts(for: session.userID)
        if let message = PendingSyncNotice.message(
            lessons: waiting.lessons, reviewAnswers: waiting.reviewAnswers, isConnected: isConnected)
        {
            DSCard(spacing: AlphonsoDS.Space.s2) {
                HStack(alignment: .center, spacing: AlphonsoDS.Space.s3) {
                    Image("Alphonso-refill-hourglass").resizable().scaledToFit()
                        .frame(height: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2)
                        .accessibilityHidden(true)
                    Text(message).dsText(.headline).foregroundStyle(ds.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                if isConnected {
                    Button(isSyncing ? PendingSyncNotice.syncingTitle : PendingSyncNotice.syncNowTitle) {
                        Task { await syncNow() }
                    }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .disabled(isSyncing)
                }
            }
            .accessibilityElement(children: .contain)
            .dsListRow(top: AlphonsoDS.Space.s2)
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
