import Foundation

/// One conversation per (scenario, course).
/// A course switch therefore always finds a different key, so it can only
/// start a fresh conversation in the new language. It can never continue the
/// old one in a mix of two.
public struct ConversationKey: Hashable, Sendable {
    public let scenarioId: String
    public let course: Course

    public init(scenarioId: String, course: Course) {
        self.scenarioId = scenarioId
        self.course = course
    }

    public static func scenario(_ id: String, course: Course) -> ConversationKey {
        ConversationKey(scenarioId: id, course: course)
    }

    public static func campaign(_ id: String, course: Course) -> ConversationKey {
        ConversationKey(scenarioId: "campaign:\(id)", course: course)
    }

    public static func hector(course: Course) -> ConversationKey {
        ConversationKey(scenarioId: "hector", course: course)
    }
}

public struct ConversationSnapshot: Equatable, Sendable {
    public var turns: [ChatMessage]
    /// Deepgram's utterance confidence per user turn index (V3 3a clarity label).
    public var confidenceByTurnIndex: [Int: Double]
    /// Campaign only: the current scene, and the index of its opener.
    public var sceneIndex: Int
    public var sceneAnchor: Int
    public var finished: Bool
    /// How many turns /api/analyze-weaknesses has already seen, so a
    /// conversation that survives tab switches is not re-analyzed on each one.
    public var analyzedTurnCount: Int
    /// Indices of turns we wrote ourselves (a conversation's or scene's fixed opening line), as opposed to model
    /// replies. Tracked by position, so a model reply that repeats an opener's words is still a model reply.
    public var openerIndices: Set<Int>

    /// At most this many of the latest turns are sent to the model; a long conversation does not grow every request.
    public static let maxTurnsSent = 40

    public init(turns: [ChatMessage] = [], openerIndices: Set<Int> = []) {
        self.turns = turns
        self.openerIndices = openerIndices
        confidenceByTurnIndex = [:]
        sceneIndex = 0
        sceneAnchor = 0
        finished = false
        analyzedTurnCount = 0
    }

    /// The turns to send to the model.
    public var recentTurns: [ChatMessage] { Array(turns.suffix(Self.maxTurnsSent)) }

    /// Adds one of our own opening lines (a campaign's next scene) as the latest turn.
    public mutating func appendOpener(_ text: String) {
        turns.append(ChatMessage(role: "assistant", content: text))
        openerIndices.insert(turns.count - 1)
    }

    /// Restarts the current scene: back to its opening line.
    public mutating func restartScene() {
        guard sceneAnchor < turns.count else { return }
        turns = Array(turns[0...sceneAnchor])
        confidenceByTurnIndex = confidenceByTurnIndex.filter { $0.key <= sceneAnchor }
        openerIndices = openerIndices.filter { $0 <= sceneAnchor }
        analyzedTurnCount = min(analyzedTurnCount, turns.count)
    }
}

/// In-memory, owned once by RootView above the tabs, so conversations survive
/// tab switches. It is cleared when the signed-in account changes. A
/// "New conversation" action builds on `reset(_:)`. Used only from the main
/// actor (SwiftUI views).
public final class ConversationStore {
    private var snapshots: [ConversationKey: ConversationSnapshot] = [:]

    public init() {}

    public func snapshot(for key: ConversationKey) -> ConversationSnapshot? {
        snapshots[key]
    }

    /// The existing conversation, or a new one opened with `opener` (an
    /// assistant turn). Never overwrites an existing conversation.
    public func snapshot(for key: ConversationKey, seededWith opener: String?) -> ConversationSnapshot {
        if let existing = snapshots[key] { return existing }
        let seeded = ConversationSnapshot(
            turns: opener.map { [ChatMessage(role: "assistant", content: $0)] } ?? [],
            openerIndices: opener == nil ? [] : [0])
        snapshots[key] = seeded
        return seeded
    }

    @discardableResult
    public func update(_ key: ConversationKey, _ body: (inout ConversationSnapshot) -> Void) -> ConversationSnapshot {
        var snapshot = snapshots[key] ?? ConversationSnapshot()
        body(&snapshot)
        snapshots[key] = snapshot
        return snapshot
    }

    @discardableResult
    public func append(_ message: ChatMessage, confidence: Double? = nil, to key: ConversationKey) -> ConversationSnapshot {
        update(key) { snapshot in
            if let confidence { snapshot.confidenceByTurnIndex[snapshot.turns.count] = confidence }
            snapshot.turns.append(message)
        }
    }

    public func reset(_ key: ConversationKey) {
        snapshots[key] = nil
    }

    /// "New conversation": clears this (scenario, course) only and re-opens it with `opener`. A conversation
    /// otherwise persists across tab switches until this.
    @discardableResult
    public func startNew(_ key: ConversationKey, opener: String?) -> ConversationSnapshot {
        reset(key)
        return snapshot(for: key, seededWith: opener)
    }

    public func removeAll() {
        snapshots.removeAll()
    }
}
