import Foundation
import UIKit
import UserNotifications
import LearnWithAlphonsoKit

/// V4 candidate #2 -- real (remote APNs) push notifications. Owns
/// registering this device for remote notifications and holding the
/// resulting APNs device token, hex-encoded (RemotePushLogic.hexString)
/// ready to upload via ProgressSyncClient.registerDeviceToken. A
/// deliberately separate type from NotificationScheduler, not an
/// extension of it -- these are genuinely different systems (local
/// UNUserNotificationCenter scheduling vs. remote APNs registration), see
/// docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md's
/// "What already exists" section for why this doesn't touch
/// NotificationScheduler.swift at all.
///
/// Does NOT request notification *permission* itself -- iOS has exactly
/// one system permission prompt for both local and remote notifications
/// (UNUserNotificationCenter.requestAuthorization), and
/// NotificationScheduler already owns asking for it at the app's one
/// chosen priming moment (LessonPlayerView, first lesson completion).
/// This type only calls UIApplication.registerForRemoteNotifications(),
/// which is safe to call any time (a no-op / harmless failure before
/// permission is granted) -- see registerIfAuthorized().
@Observable
@MainActor
final class RemotePushRegistrar {
    private(set) var deviceTokenHex: String?
    private let center: UNUserNotificationCenter
    private var tokenObserver: NSObjectProtocol?

    init(center: UNUserNotificationCenter = .current(), notificationCenter: NotificationCenter = .default) {
        self.center = center
        // deviceTokenHex is @Observable-tracked, so this assignment from a
        // background-queue callback must land on the main actor -- matches
        // every other cross-boundary callback in this app
        // (GoogleSignInPresenter, HectorSession) hopping back to @MainActor
        // explicitly rather than assuming the poster's queue.
        tokenObserver = notificationCenter.addObserver(
            forName: AppDelegate.deviceTokenNotification,
            object: nil,
            queue: nil
        ) { [weak self] note in
            guard let data = note.object as? Data else { return }
            let hex = hexString(fromDeviceToken: data)
            Task { @MainActor [weak self] in
                self?.deviceTokenHex = hex
            }
        }
    }

    deinit {
        if let tokenObserver {
            NotificationCenter.default.removeObserver(tokenObserver)
        }
    }

    /// Call on every launch/foreground once signed in (RootView's
    /// existing `.task`, alongside triggerSync()) -- only actually
    /// registers if the user has already granted notification permission
    /// (via NotificationScheduler's existing prompt), so this never
    /// triggers a permission dialog itself. Cheap and idempotent to call
    /// repeatedly: Apple's own guidance is to call
    /// registerForRemoteNotifications on every launch, since it's also
    /// how a rotated token gets picked up, not just the first time.
    func registerIfAuthorized() async {
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }
}
