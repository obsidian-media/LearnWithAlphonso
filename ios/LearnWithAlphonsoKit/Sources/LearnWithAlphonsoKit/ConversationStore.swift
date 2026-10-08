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

    public init(turns: [ChatMessage] = []) {
        self.turns = turns
        confidenceByTurnIndex = [:]
        sceneIndex = 0
        sceneAnchor = 0
        finished = false
        analyzedTurnCount = 0
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
        let seeded = ConversationSnapshot(turns: opener.map { [ChatMessage(role: "assistant", content: $0)] } ?? [])
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

    public func removeAll() {
        snapshots.removeAll()
    }
}
