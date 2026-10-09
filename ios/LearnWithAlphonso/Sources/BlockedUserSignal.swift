import Foundation

/// Posted after a block succeeds on any screen, so a list that stays alive underneath (the League board keeps
/// running behind the Teams screen it pushes) can drop that person at once instead of at the next reload.
enum BlockedUserSignal {
    static let name = Notification.Name("BlockedUserSignal.blocked")

    static func post(userID: String) {
        NotificationCenter.default.post(name: name, object: nil, userInfo: ["userID": userID])
    }

    static func userID(from notification: Notification) -> String? {
        notification.userInfo?["userID"] as? String
    }
}
