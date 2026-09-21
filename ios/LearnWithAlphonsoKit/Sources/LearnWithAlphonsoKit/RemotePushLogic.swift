import Foundation

/// V4 candidate #2 -- real (remote APNs) push notifications
/// (docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md).
/// The one pure, testable piece of this feature -- everything else is
/// thin UIKit/network I/O (RemotePushRegistrar, AppDelegate), same "pure
/// logic separated from I/O" split as SRSEngine/ProgressMath and the
/// existing local-notification design's `nextStreakReminderDate`.
///
/// Converts the raw APNs device token Data
/// (`application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`)
/// into the lowercase hex string APNs' HTTP/2 API and this app's own
/// `device_tokens.token` column both expect.
public func hexString(fromDeviceToken data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}
