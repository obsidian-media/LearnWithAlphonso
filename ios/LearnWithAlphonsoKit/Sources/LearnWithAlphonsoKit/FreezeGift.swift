import Foundation

/// Gift a streak freeze, the iOS side (mirrors src/lib/freeze-gift.ts on the web and core/logic/FreezeGift.kt on
/// Android; keep the three in step). The rules live in the database (`gift_streak_freeze`: a transfer of a freeze the
/// sender holds, one per friend per UTC day, refused when the friend already holds 3). This file only turns the
/// database's answer into words and decides what a row's button shows; the app never decides whether a gift is
/// allowed, it only avoids offering one it already knows will be refused.
public enum GiftFreezeReason: String, Sendable, Equatable, CaseIterable {
    case unauthenticated
    case notFriends = "not-friends"
    case alreadyGiftedToday = "already-gifted-today"
    case noFreeze = "no-freeze"
    case recipientFull = "recipient-full"
    /// Not a database answer: anything unknown, and any failed call, reads as this (never a made-up reason).
    case error

    /// A known database reason maps to itself; anything else, or nothing, to `.error`.
    public static func from(_ raw: String?) -> GiftFreezeReason {
        guard let raw, let reason = GiftFreezeReason(rawValue: raw), reason != .error else { return .error }
        return reason
    }
}

/// `reason` is nil on success; `freezes` is the sender's balance after the call, as the server reports it.
public struct GiftFreezeOutcome: Sendable, Equatable {
    public let ok: Bool
    public let reason: GiftFreezeReason?
    public let freezes: Int?

    public init(ok: Bool, reason: GiftFreezeReason?, freezes: Int?) {
        self.ok = ok
        self.reason = reason
        self.freezes = freezes
    }
}

/// A received gift row (`streak_freeze_gifts`) the learner has not yet seen.
public struct FreezeGift: Sendable, Equatable, Identifiable {
    public let id: String
    public let senderID: String

    public init(id: String, senderID: String) {
        self.id = id
        self.senderID = senderID
    }
}

/// What the Friends screen needs to draw the gift buttons: the caller's own balance (nil = unknown) and today's recipients.
public struct FreezeGiftState: Sendable, Equatable {
    public let freezes: Int?
    public let giftedTodayTo: Set<String>

    public init(freezes: Int?, giftedTodayTo: Set<String>) {
        self.freezes = freezes
        self.giftedTodayTo = giftedTodayTo
    }

    /// Nothing known yet: the button is offered and the database answers.
    public static let unknown = FreezeGiftState(freezes: nil, giftedTodayTo: [])
}

public enum GiftButtonState: Sendable, Equatable, CaseIterable {
    case send
    case sentToday
    case noFreeze
}

public enum FreezeGiftCopy {
    public static func message(for outcome: GiftFreezeOutcome, friendName: String) -> String {
        if outcome.ok { return "Freeze sent to \(friendName)." }
        switch outcome.reason ?? .error {
        case .recipientFull: return "\(friendName) already has all the freezes they can hold."
        case .alreadyGiftedToday: return "You already gifted \(friendName) a freeze today. Try again tomorrow."
        case .noFreeze: return "You have no streak freeze to give."
        case .notFriends: return "Couldn't send a freeze to \(friendName)."
        case .unauthenticated, .error: return "Couldn't send a freeze to \(friendName). Try again."
        }
    }

    /// What the row's gift button shows, from what the screen has loaded (the database still has the last word).
    public static func buttonState(myFreezes: Int?, giftedTodayTo: Set<String>, friendID: String) -> GiftButtonState {
        if giftedTodayTo.contains(friendID) { return .sentToday }
        if let myFreezes, myFreezes < 1 { return .noFreeze }
        return .send
    }

    /// The accessible name of the row's gift button: says what it does, or why it is off.
    public static func accessibilityLabel(friendName: String, state: GiftButtonState) -> String {
        switch state {
        case .sentToday: return "Streak freeze already sent to \(friendName) today"
        case .noFreeze: return "Gift a streak freeze to \(friendName) (you have none to give)"
        case .send: return "Gift a streak freeze to \(friendName)"
        }
    }

    /// The toast for freezes received: one friend by name, several by count.
    public static func receivedToast(senderNames: [String]) -> String {
        senderNames.count == 1
            ? "\(senderNames[0]) gifted you a streak freeze!"
            : "\(senderNames.count) friends gifted you a streak freeze!"
    }
}
