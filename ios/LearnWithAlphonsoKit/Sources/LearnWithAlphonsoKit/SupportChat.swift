import Foundation

/// What the Help chat shows for each state, as pure functions. Native twin of src/lib/support-view.ts and the state
/// handling of src/components/help/useHelpChat.ts. The status is the server's; nothing here decides anything about
/// the learner's account.

public enum SupportBanner: String, Sendable, Equatable {
    case ai, person, declined, team, wait, done, offline

    public var title: String {
        switch self {
        case .ai: return SupportCopy.aiModeTitle
        case .person: return SupportCopy.personModeTitle
        case .declined: return SupportCopy.declinedTitle
        case .team: return SupportCopy.teamTitle
        case .wait: return SupportCopy.waitTitle
        case .done: return SupportCopy.solvedTitle
        case .offline: return SupportCopy.offlineTitle
        }
    }

    public var body: String {
        switch self {
        case .ai: return SupportCopy.aiModeBody
        case .person: return SupportCopy.personModeBody
        case .declined: return SupportCopy.declinedBody
        case .team: return SupportCopy.teamBody
        case .wait: return SupportCopy.waitBody
        case .done: return SupportCopy.solvedBody
        case .offline: return SupportCopy.offlineBody
        }
    }
}

public enum SupportSendLimit: Sendable, Equatable {
    case daily, conversation
}

public enum SupportChatRules {
    /// A person's replies are polled this often while the chat is open and the AI is not the one answering.
    public static let pollInterval: TimeInterval = 20

    /// `status` is nil while the first load has not finished or failed: no banner then.
    public static func banner(status: SupportStatus?, aiAvailable: Bool, aiDeclined: Bool, online: Bool) -> SupportBanner? {
        if !online { return .offline }
        guard let status else { return nil }
        switch status {
        case .new, .open: return .team
        case .waitingLearner: return .wait
        case .solved: return .done
        case .none, .ai:
            if !aiAvailable { return .person }
            return aiDeclined ? .declined : .ai
        }
    }

    public struct Composer: Equatable, Sendable {
        public let placeholder: String
        public let fine: String
        public let disabled: Bool
    }

    public static func composer(status: SupportStatus?, limit: SupportSendLimit?, online: Bool, aiFirstOpen: Bool) -> Composer {
        if limit == .daily {
            return Composer(placeholder: SupportCopy.placeholderLimit, fine: SupportCopy.fineLimit, disabled: true)
        }
        if limit == .conversation {
            return Composer(placeholder: SupportCopy.placeholderFull, fine: "", disabled: true)
        }
        let fine: String
        if !online { fine = SupportCopy.fineOffline }
        else if status == .solved { fine = SupportCopy.fineSolved }
        else if aiFirstOpen { fine = SupportCopy.aiFine }
        else { fine = SupportCopy.fine }
        let placeholder: String
        switch status {
        case .new, .open: placeholder = SupportCopy.placeholderMore
        case .waitingLearner: placeholder = SupportCopy.placeholderReply
        case .solved: placeholder = SupportCopy.placeholderSolved
        default: placeholder = SupportCopy.placeholder
        }
        return Composer(placeholder: placeholder, fine: fine, disabled: false)
    }

    /// The server's hand-off line (the web's HANDOFF_NOTICE; the parity test keeps the words equal).
    public static let handoffNotice = "A person will reply here."

    /// The name line of a person's reply: "<first name> \u{00B7} Support team", or just "Support team" with no name. A
    /// person is never labelled with Miya's name (she is the AI helper), even a staff member called Miya.
    public static func staffLabel(_ firstName: String?) -> String {
        let name = (firstName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.lowercased() != "miya" else { return SupportCopy.person }
        return "\(name) \u{00B7} \(SupportCopy.person)"
    }

    /// The words above a message: Miya for the AI (the AI tag is drawn beside it), the staff label for a person, nil otherwise.
    public static func speakerLabel(_ message: SupportMessage) -> String? {
        switch message.kind {
        case .ai: return SupportCopy.ai
        case .support: return staffLabel(message.staffName)
        case .you, .system: return nil
        }
    }

    /// Whether Miya's hand-off pose goes above the system line at `index`: it is the hand-off notice and an AI message came earlier.
    public static func showsHandoffPose(messages: [SupportMessage], index: Int) -> Bool {
        guard messages.indices.contains(index) else { return false }
        let message = messages[index]
        guard message.kind == .system, message.body == handoffNotice else { return false }
        return messages[..<index].contains { $0.kind == .ai }
    }

    /// The conversation is polled while it is open and the AI is not the one answering.
    public static func shouldPoll(status: SupportStatus?) -> Bool {
        guard let status else { return false }
        return status != .ai
    }

    /// The id of the first unread person reply, where the "New reply" divider goes; nil when nothing is unread.
    public static func unreadDividerID(messages: [SupportMessage], unread: Int) -> Int? {
        guard unread > 0 else { return nil }
        let staff = messages.filter { $0.kind == .support }
        guard !staff.isEmpty else { return nil }
        return staff.suffix(unread).first?.id
    }

    /// Messages by id, oldest first: what a poll or a send adds to what is already on screen.
    public static func merge(_ current: [SupportMessage], _ incoming: [SupportMessage]) -> [SupportMessage] {
        var byID: [Int: SupportMessage] = [:]
        for message in current { byID[message.id] = message }
        for message in incoming { byID[message.id] = message }
        return byID.values.sorted { $0.id < $1.id }
    }

    /// The server's limit on one message: zod `max(2000)` counts UTF-16 code units, not Characters.
    public static let maxMessageUnits = 2000

    /// `text` cut to the most characters that keep it within `maxMessageUnits` UTF-16 units, never splitting a
    /// character (an emoji is two units or more, so 1,500 of them would pass a Character count and be refused).
    public static func clamped(_ text: String, units: Int = maxMessageUnits) -> String {
        guard text.utf16.count > units else { return text }
        var out = text
        while out.utf16.count > units { out.removeLast() }
        return out
    }

    /// The learner's text, trimmed, or nil when there is nothing to send (the server trims too and refuses empty).
    public static func sendableText(_ draft: String) -> String? {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}

// MARK: - Times

/// "Today", "Yesterday", "14 Nov", and "9:41 AM" / "Mon 11:12 AM" / "14 Nov, 10:02 AM". The calendar carries the time
/// zone, so a test pins both.
public struct SupportClock: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    private func formatted(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    /// The server's ISO 8601 string as a date. Postgres sends up to six fractional digits; three are kept.
    public static func parse(_ iso: String) -> Date? {
        var text = iso
        if let range = text.range(of: #"\.(\d{3})\d+"#, options: .regularExpression) {
            text.replaceSubrange(range, with: String(text[range].prefix(4)))
        }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }

    public func dayKey(_ iso: String) -> String {
        guard let date = Self.parse(iso) else { return iso }
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }

    public func dayLabel(_ iso: String, now: Date) -> String {
        guard let date = Self.parse(iso) else { return "" }
        if calendar.isDate(date, inSameDayAs: now) { return SupportCopy.today }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
            return SupportCopy.yesterday
        }
        return formatted(date, "d MMM")
    }

    public func timeLabel(_ iso: String, now: Date) -> String {
        guard let date = Self.parse(iso) else { return "" }
        let clock = formatted(date, "h:mm a")
        if calendar.isDate(date, inSameDayAs: now) { return clock }
        let ageDays = now.timeIntervalSince(date) / 86_400
        if ageDays >= 0, ageDays < 6 { return "\(formatted(date, "EEE")) \(clock)" }
        return "\(formatted(date, "d MMM")), \(clock)"
    }
}

// MARK: - The chat's state

/// A message the learner has sent that the server has not confirmed. Its text is kept until a retry succeeds.
public struct SupportPending: Sendable, Equatable {
    public enum State: Sendable, Equatable { case sending, failed }
    public let clientID: String
    public let text: String
    /// The newest message id on screen when it was sent, so a stored copy is not drawn twice.
    public let baseID: Int
    public let at: String
    public var state: State
    public var failure: SupportErrorKind?

    public init(clientID: String, text: String, baseID: Int, at: String, state: State = .sending, failure: SupportErrorKind? = nil) {
        self.clientID = clientID
        self.text = text
        self.baseID = baseID
        self.at = at
        self.state = state
        self.failure = failure
    }
}

/// Everything the Help screen shows, changed only through these functions (the screen's model does the network and
/// calls them). Mirrors the web's useHelpChat.
public struct SupportChatState: Sendable, Equatable {
    public enum Load: Sendable, Equatable { case loading, error, ready }

    public var load: Load = .loading
    public var status: SupportStatus?
    public var aiAvailable = false
    public var messages: [SupportMessage] = []
    /// Where the "New reply" divider goes (a message id), or nil.
    public var dividerID: Int?
    public var pending: SupportPending?
    public var limit: SupportSendLimit?
    /// Ids of the learner messages sent in this visit (they read "Sent").
    public var sentIDs: [Int] = []
    public var handoffBusy = false
    public var handoffFailed = false
    /// Bumped by every change a send or hand-off makes, so a poll that started before it can be told apart from one
    /// that started after (`polled(_:startedAt:)`).
    public private(set) var revision = 0

    public init() {}

    public var newestID: Int { messages.map(\.id).max() ?? 0 }

    /// A failed message the server already holds (a poll found it) is not drawn a second time.
    public var pendingShown: SupportPending? {
        guard let pending else { return nil }
        if pending.state == .failed,
           messages.contains(where: { $0.kind == .you && $0.id > pending.baseID && $0.body == pending.text }) {
            return nil
        }
        return pending
    }

    /// The first-open screen: loaded, nothing said yet, nothing in flight.
    public var isEmpty: Bool { load == .ready && messages.isEmpty && pending == nil }

    public mutating func loadStarted() { load = .loading }

    public mutating func loaded(_ conversation: SupportConversation) {
        load = .ready
        status = conversation.status
        aiAvailable = conversation.aiAvailable
        messages = conversation.messages
        dividerID = SupportChatRules.unreadDividerID(messages: conversation.messages, unread: conversation.unread)
    }

    public mutating func loadFailed() { load = .error }

    /// A poll adds what is new and moves the divider to the first new person reply; a failed poll changes nothing.
    public mutating func polled(_ conversation: SupportConversation, startedAt startRevision: Int? = nil) {
        // A poll read before a send or hand-off finished is older than what is on screen: it must not roll the
        // status or messages back.
        if let startRevision, startRevision != revision { return }
        let known = Set(messages.map(\.id))
        let fresh = conversation.messages.first { $0.kind == .support && !known.contains($0.id) }
        status = conversation.status
        aiAvailable = conversation.aiAvailable
        messages = SupportChatRules.merge(messages, conversation.messages)
        dividerID = dividerID ?? fresh?.id
    }

    public mutating func sendStarted(_ pending: SupportPending) {
        var sending = pending
        sending.state = .sending
        sending.failure = nil
        self.pending = sending
        limit = nil
        revision += 1
    }

    public mutating func sendSucceeded(_ update: SupportUpdate) {
        pending = nil
        revision += 1
        status = update.status
        messages = SupportChatRules.merge(messages, update.messages)
        sentIDs += update.messages.filter { $0.kind == .you }.map(\.id)
    }

    public mutating func sendFailed(_ failed: SupportPending, kind: SupportErrorKind) {
        revision += 1
        switch kind {
        case .dailyLimit, .conversationLimit:
            // Nothing was stored: the draft is not kept (the box is closed for today).
            pending = nil
            limit = kind == .dailyLimit ? .daily : .conversation
        default:
            var kept = failed
            kept.state = .failed
            kept.failure = kind
            pending = kept
        }
    }

    public mutating func handoffStarted() {
        revision += 1
        handoffBusy = true
        handoffFailed = false
    }

    public mutating func handoffSucceeded(_ update: SupportUpdate) {
        handoffBusy = false
        revision += 1
        status = update.status
        messages = SupportChatRules.merge(messages, update.messages)
        // A conversation opened by this tap: the server's first read is the screen's first read.
        load = .ready
    }

    public mutating func handoffFailedNow() {
        handoffBusy = false
        handoffFailed = true
    }

    /// Whether the learner may send now. The caller also checks the text and the connection.
    public func canSend(online: Bool, composerDisabled: Bool) -> Bool {
        online && !composerDisabled && load == .ready && pending == nil && limit == nil
    }

    /// Retry is offered only for a failed message.
    public var retryable: SupportPending? {
        guard let pending, pending.state == .failed else { return nil }
        return pending
    }
}
