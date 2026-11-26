import Foundation

/// The pure rules of one Hector call, kept out of the view so they can be tested: which turns the tutor is sent, what
/// a fresh "Call again" resets, when the weakness analysis runs, and why a background request failed.
///
/// Mirrors Android's core/logic/HectorCall.kt; keep the two in step.
public enum HectorCall {
    /// One call's identity: `callId` names the call (the recap is keyed on it), `sessionID` is the tutor session.
    /// "Call again" mints both afresh, so a new call never continues the old thread on the server.
    public struct Ids: Equatable, Sendable {
        public let callId: String
        public let sessionID: String

        public static func fresh() -> Ids { Ids(callId: UUID().uuidString, sessionID: UUID().uuidString) }
    }

    /// The history sent with a turn: every turn BEFORE the learner's current one, which travels in `text` and which
    /// the server appends itself. `turns` already ends with that current learner turn.
    public static func priorTurns(_ turns: [ChatMessage]) -> [TutorConversationMessage] {
        let history = turns.last?.role == "user" ? turns.dropLast() : turns[...]
        return history.map { TutorConversationMessage(role: $0.role, content: $0.content) }
    }

    /// Turns a call needs before it is worth analysing.
    public static let minTurnsToAnalyse = 4

    /// Whether the weakness analysis should run now: only once per stretch of conversation (the thread survives tab
    /// switches), never for a short call, and never when a recap already analysed this call (it would bill twice).
    public static func shouldAnalyse(turnCount: Int, analysedTurnCount: Int, recapAttempted: Bool) -> Bool {
        !recapAttempted && turnCount >= minTurnsToAnalyse && turnCount > analysedTurnCount
    }

    /// Why a background request failed, as a short stable label for the log: consent, quota, auth, network or server.
    public static func failureReason(_ error: Error) -> String {
        switch TutorError.from(error) {
        case .aiConsentRequired: return "consent"
        case .quotaExceeded: return "quota"
        case .signedOut, .notEntitled, .entitlementUnavailable: return "auth"
        case .network: return "network"
        case .server: return "server"
        }
    }

    /// Learner turns a call needs before it is kept in what Hector remembers (the server enforces the same minimum).
    public static let minLearnerTurnsToSave = 3

    /// Whether the finished call should be sent to /api/hector-call-end: at least three learner turns.
    public static func qualifiesForCallEnd(_ turns: [ChatMessage]) -> Bool {
        turns.filter { $0.role == "user" }.count >= minLearnerTurnsToSave
    }

    /// The state of one call at a time: its identity, and whether its call-end has been claimed. "Call again" starts
    /// a new call, which can send its own call-end.
    public struct Tracker: Equatable, Sendable {
        public private(set) var ids: Ids
        private var callEndSentFor: String?

        public init(ids: Ids = .fresh()) { self.ids = ids }

        /// True once per call id, and only for a call that qualifies: the caller then sends /api/hector-call-end.
        public mutating func claimCallEnd(turns: [ChatMessage]) -> Bool {
            guard callEndSentFor != ids.callId, HectorCall.qualifiesForCallEnd(turns) else { return false }
            callEndSentFor = ids.callId
            return true
        }

        /// "Call again": clears this course's Hector thread and mints a new call identity. The caller captures the
        /// old call's transcript first.
        @discardableResult
        public mutating func startNewCall(store: ConversationStore, course: Course) -> ConversationSnapshot {
            ids = .fresh()
            return store.startNew(.hector(course: course), opener: nil)
        }
    }
}

/// POST /api/hector-call-end's answer: `{ saved: true, lines }` or `{ saved: false, reason }`.
public struct HectorCallEndResult: Equatable, Sendable {
    public let saved: Bool
    public let lines: Int
    public let reason: String?

    public init(saved: Bool, lines: Int = 0, reason: String? = nil) {
        self.saved = saved
        self.lines = lines
        self.reason = reason
    }

    public static func parse(_ data: Data) -> HectorCallEndResult? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let saved = object["saved"] as? Bool else { return nil }
        return HectorCallEndResult(saved: saved, lines: object["lines"] as? Int ?? 0, reason: object["reason"] as? String)
    }
}
