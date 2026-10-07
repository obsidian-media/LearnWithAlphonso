import Foundation

/// Study buddies (study together, Phase 3a on the server; docs/superpowers/specs/2026-10-06-study-together-design.md).
/// The server is the source of truth for the week rules (`_resolve_buddy_pair`); `BuddyRules` mirrors them so the
/// clients stay honest, and `BuddyCopy` owns the wording, which is word-for-word src/lib/buddy.ts (both pinned by the
/// shared Fixtures/buddy.fixtures.json).
public enum BuddyRules {
    /// Distinct lessons each buddy needs in a week. Equals `goal` in 20261006180000_buddy_pairing.sql.
    public static let goal = 3

    public enum Outcome: String, Sendable {
        case hit
        case grace
        case miss
        case firstWeek = "first_week"
    }

    /// One week of the pair's streak. The week the pair was formed can only help.
    public static func resolveWeek(
        streakWeeks: Int, graceAvailable: Bool, a: Int, b: Int, isFirstWeek: Bool
    ) -> (outcome: Outcome, streakWeeks: Int, graceAvailable: Bool) {
        if a >= goal && b >= goal { return (.hit, streakWeeks + 1, true) }
        if isFirstWeek { return (.firstWeek, streakWeeks, graceAvailable) }
        if graceAvailable { return (.grace, streakWeeks, false) }
        return (.miss, 0, false)
    }
}

public enum BuddyCopy {
    public static let intro =
        "Pick a friend to study with. Each week you both aim for 3 lessons and keep a streak together."
    public static let loadFailed = "Couldn't load your study buddy."

    private static let messages: [String: String] = [
        "requested": "Request sent. They'll see it on their Friends page.",
        "paired": "You're study buddies now.",
        "declined": "Request declined.",
        "cancelled": "Request cancelled.",
        "ended": "You're no longer study buddies.",
        "not_friends": "You can only ask a friend to be your study buddy.",
        "blocked": "You can't be study buddies with this person.",
        "already_paired": "You already have a study buddy.",
        "friend_paired": "Your friend already has a study buddy.",
        "already_requested": "You've already asked them.",
        "not_found": "That request is no longer open.",
        "not_paired": "You don't have a study buddy.",
        "unauthenticated": "Sign in to find a study buddy.",
        "sent": "Sent.",
        "rate_limited": "You've sent a lot of messages. Try again in a while.",
        "bad_preset": "Something went wrong. Try again.",
        "waiting": "You're on the list. We'll pair you with a learner at your level.",
        "left": "You've stopped looking for a study buddy.",
        "not_waiting": "You weren't looking for a study buddy.",
        "matching_off": "Finding a study buddy isn't available right now.",
        "not_studying": "Start that course first, then look for a study buddy.",
        "unknown": "Something went wrong. Try again.",
    ]

    /// Fixed wording for a server status; a status this client does not know gets the generic message.
    public static func statusMessage(_ status: String) -> String {
        messages[status] ?? messages["unknown"]!
    }

    /// "You 2/3 · Buddy 3/3 this week"; counts above the goal show as the goal.
    public static func weekLine(myCount: Int, buddyCount: Int, goal: Int) -> String {
        "You \(min(myCount, goal))/\(goal) · Buddy \(min(buddyCount, goal))/\(goal) this week"
    }

    public static func streakLine(_ weeks: Int) -> String {
        "Streak: \(weeks) week\(weeks == 1 ? "" : "s")"
    }

    public static func graceLine(_ available: Bool) -> String {
        available ? "1 grace week left" : "No grace week left"
    }

    public static func incomingLine(_ name: String) -> String { "\(name) wants to be your study buddy." }
    public static func outgoingLine(_ name: String) -> String { "Waiting for \(name)." }
    public static func endConfirm(_ name: String) -> String {
        "End being study buddies with \(name)? Your streak ends."
    }
}

/// One `get_my_buddy` row: the caller's active buddy and this week's counts.
public struct MyBuddy: Equatable, Sendable {
    public let pairID: String
    public let buddyID: String
    public let buddyName: String
    public let buddyAvatarSeed: String
    public let pairedAt: String
    public let weekStart: String
    public let myCount: Int
    public let buddyCount: Int
    public let goal: Int
    public let streakWeeks: Int
    public let graceAvailable: Bool
    public let lastOutcome: String?

    /// nil for a row with a missing or mistyped field (the client treats that as a broken contract and throws).
    public init?(row: [String: Any]) {
        guard
            let pairID = row["pair_id"] as? String,
            let buddyID = row["buddy_id"] as? String,
            let buddyName = row["buddy_name"] as? String,
            let buddyAvatarSeed = row["buddy_avatar_seed"] as? String,
            let pairedAt = row["paired_at"] as? String,
            let weekStart = row["week_start"] as? String,
            let myCount = row["my_count"] as? Int,
            let buddyCount = row["buddy_count"] as? Int,
            let goal = row["goal"] as? Int,
            let streakWeeks = row["streak_weeks"] as? Int,
            let graceAvailable = row["grace_available"] as? Bool,
            // Required key: a string, or JSON null before the pair's first judged week. Anything else is a broken row.
            let rawOutcome = row["last_outcome"],
            rawOutcome is NSNull || rawOutcome is String
        else { return nil }
        self.pairID = pairID
        self.buddyID = buddyID
        self.buddyName = buddyName
        self.buddyAvatarSeed = buddyAvatarSeed
        self.pairedAt = pairedAt
        self.weekStart = weekStart
        self.myCount = myCount
        self.buddyCount = buddyCount
        self.goal = goal
        self.streakWeeks = streakWeeks
        self.graceAvailable = graceAvailable
        self.lastOutcome = rawOutcome as? String
    }
}

/// One pending request from `get_buddy_requests`.
public struct BuddyRequest: Equatable, Sendable, Identifiable {
    public enum Direction: String, Sendable {
        case incoming
        case outgoing
    }

    public let id: String
    public let direction: Direction
    public let otherID: String
    public let otherName: String
    public let otherAvatarSeed: String
    public let requestedAt: String

    public init?(row: [String: Any]) {
        guard
            let id = row["request_id"] as? String,
            let rawDirection = row["direction"] as? String,
            let direction = Direction(rawValue: rawDirection),
            let otherID = row["other_id"] as? String,
            let otherName = row["other_name"] as? String,
            let otherAvatarSeed = row["other_avatar_seed"] as? String,
            let requestedAt = row["requested_at"] as? String
        else { return nil }
        self.id = id
        self.direction = direction
        self.otherID = otherID
        self.otherName = otherName
        self.otherAvatarSeed = otherAvatarSeed
        self.requestedAt = requestedAt
    }
}
