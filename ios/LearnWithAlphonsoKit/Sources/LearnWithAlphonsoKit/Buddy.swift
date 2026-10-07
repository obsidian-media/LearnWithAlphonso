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
        "age_required": "Please confirm you're 13 or older to be matched with another learner.",
        "too_many_tries": "You've tried a lot just now. Try again in an hour.",
        "match_limit": "You've been matched with a few learners this week. Try again in a few days.",
        "matching_paused": "Messages with matched learners are paused right now. Your progress is kept.",
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

    // MARK: Opt-in matching (Phase 3b)

    public static let poolIntro =
        "Or let us find one: we'll pair you with another learner of the same course at a similar level. You'll see each other's name and weekly progress, and can only send the preset messages. You can end it, block or report at any time."
    public static let stopLooking = "Stop looking"
    public static let matchedLabel = "Matched learner"
    public static let ageConfirm = "I'm 13 or older"

    private static let courseNames = ["en": "English", "fr": "French", "es": "Spanish"]

    /// "French" for "fr"; an unknown code is shown as-is.
    public static func courseName(_ course: String) -> String { courseNames[course] ?? course }
    public static func findButton(_ course: String) -> String { "Find me a study buddy (\(courseName(course)))" }
    public static func waitingLine(_ course: String) -> String {
        "Looking for a study buddy learning \(courseName(course)) at your level."
    }

    /// Most preset messages one buddy may send per hour (the server's limit).
    public static let messagesPerHour = 20

    public struct Preset: Equatable, Sendable {
        public let id: String
        public let text: String
    }

    /// The only things buddies can say to each other: fixed encouragements, never free text (owner decision
    /// 2026-10-06). The server stores and checks only the id.
    public static let presets: [Preset] = [
        Preset(id: "lets_study", text: "Let's study together!"),
        Preset(id: "nice_work", text: "Nice work!"),
        Preset(id: "keep_going", text: "Keep going, you've got this!"),
        Preset(id: "need_a_hand", text: "Need a hand?"),
        Preset(id: "on_my_way", text: "On my way to a lesson!"),
        Preset(id: "good_morning", text: "Good morning!"),
        Preset(id: "good_night", text: "Good night!"),
        Preset(id: "proud_of_you", text: "Proud of you!"),
    ]

    /// The preset's text, or nil for an id this client does not know (the history skips that message).
    public static func presetText(_ id: String) -> String? { presets.first { $0.id == id }?.text }

    /// "You: Nice work!" / "Bo: Nice work!", or nil for an unknown preset.
    public static func messageLine(isMine: Bool, buddyName: String, presetID: String) -> String? {
        guard let text = presetText(presetID) else { return nil }
        return "\(isMine ? "You" : buddyName): \(text)"
    }
}

/// One `get_buddy_messages` row.
public struct BuddyMessage: Equatable, Sendable, Identifiable {
    public let id: String
    public let senderID: String
    public let isMine: Bool
    public let presetID: String
    public let sentAt: String

    public init?(row: [String: Any]) {
        guard
            let id = row["message_id"] as? String,
            let senderID = row["sender_id"] as? String,
            let isMine = row["is_mine"] as? Bool,
            let presetID = row["preset_id"] as? String,
            let sentAt = row["sent_at"] as? String
        else { return nil }
        self.id = id
        self.senderID = senderID
        self.isMine = isMine
        self.presetID = presetID
        self.sentAt = sentAt
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
    /// Paired through opt-in matching (not a friend): the section offers block and report. A server without matching
    /// sends no `is_match`, which means a friend pair.
    public let isMatch: Bool

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
        self.isMatch = (row["is_match"] as? Bool) ?? false
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

/// The `get_buddy_pool` row: whether matching is switched on, whether the caller is waiting, and their courses.
public struct BuddyPool: Equatable, Sendable {
    public let matchingEnabled: Bool
    public let waiting: Bool
    public let course: String?
    public let courses: [String]

    public init?(row: [String: Any]) {
        guard
            let matchingEnabled = row["matching_enabled"] as? Bool,
            let waiting = row["waiting"] as? Bool,
            let courses = row["courses"] as? [String]
        else { return nil }
        self.matchingEnabled = matchingEnabled
        self.waiting = waiting
        self.course = row["course"] as? String
        self.courses = courses
    }
}

