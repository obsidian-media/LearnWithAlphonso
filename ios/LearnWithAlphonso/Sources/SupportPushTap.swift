import SwiftUI
import Observation

/// "A person replied" was tapped on the lock screen or in the notification centre: open the Help chat. The
/// notification delegate (AppDelegate) sets `pending`; RootView shows the chat as a sheet once a learner is signed in
/// and no first-run cover is on screen (the same gate as the friend invite sheet). The decision of whether a tap means
/// "open Help" is `notificationTapDestination` in the Kit (tested); this only carries it to the view.
@Observable
@MainActor
final class SupportPushTap {
    static let shared = SupportPushTap()

    /// True from the tap until the chat is closed (or the learner is signed in and the sheet appears).
    var pending = false
}

extension View {
    /// Presents the Help chat for a tapped support notification while `isReady` (signed in, no cover on screen). A
    /// tap while signed out waits, then opens the chat after sign-in.
    func supportPushSheet(tap: SupportPushTap, session: Session, isReady: Bool) -> some View {
        sheet(isPresented: Binding(
            get: { isReady && tap.pending },
            set: { if !$0 { tap.pending = false } }
        )) {
            NavigationStack {
                HelpChatView(session: session, onClose: { tap.pending = false })
            }
        }
    }
}
