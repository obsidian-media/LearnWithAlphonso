import Foundation

/// Where tapping a push notification takes the learner. The one pure, testable piece of the tap handling (the
/// UNUserNotificationCenter delegate and the sheet are thin UIKit/SwiftUI I/O in the app target).
///
/// The server sends every push with a `data.type` word beside the alert (supabase/functions/_shared/apns.ts spreads it
/// into the payload's top level): "nudge", "overtake" and, since the support replies, "support". Only "support" has a
/// destination: the Help chat. Anything else, a missing type or a value of another kind returns nil and the tap just
/// opens the app, exactly as before.
public enum NotificationTapDestination: Equatable, Sendable {
    case help
}

public func notificationTapDestination(userInfo: [AnyHashable: Any]) -> NotificationTapDestination? {
    guard let type = userInfo["type"] as? String else { return nil }
    return type == "support" ? .help : nil
}
