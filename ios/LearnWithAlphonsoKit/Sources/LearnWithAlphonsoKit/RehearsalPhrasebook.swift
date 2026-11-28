import Foundation

// Rehearsals: "Your phrases for this {event}". The brief's key phrases, each with its meaning line when there is one, to
// hear again on the day. Mirrors src/lib/rehearsal-phrases.ts and the web's Phrasebook. Everything the screen decides
// (which rows, whether the entry shows, which voice, what the hint says) is pure and lives here; the view only lays it out.

/// One row of the phrasebook.
public struct RehearsalPhraseRow: Codable, Equatable, Sendable {
    public let text: String
    public let meaning: String?

    public init(text: String, meaning: String?) {
        self.text = text
        self.meaning = meaning
    }
}

public enum RehearsalPhrasebook {
    /// The brief's phrases as rows. Meanings exist only on a hand-written quick-start brief and are index-aligned with the
    /// phrases; a list that does not line up (a different length, or any blank entry) is ignored whole, so a phrase is
    /// never shown beside another phrase's meaning. A blank phrase is dropped.
    public static func rows(keyPhrases: [String], meanings: [String]?) -> [RehearsalPhraseRow] {
        let aligned: Bool = {
            guard let meanings, meanings.count == keyPhrases.count else { return false }
            return meanings.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }()
        var rows: [RehearsalPhraseRow] = []
        for (i, raw) in keyPhrases.enumerated() {
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }
            rows.append(RehearsalPhraseRow(text: text, meaning: aligned ? meanings?[i].trimmingCharacters(in: .whitespacesAndNewlines) : nil))
        }
        return rows
    }

    public static func rows(brief: RehearsalBrief?) -> [RehearsalPhraseRow] {
        guard let brief else { return [] }
        return rows(keyPhrases: brief.keyPhrases, meanings: brief.keyPhraseMeanings)
    }

    /// The plan's entry shows once the warm-up (stage 1) is done and there is at least one phrase.
    public static func isOffered(progress: RehearsalProgress?, rows: [RehearsalPhraseRow]) -> Bool {
        progress?.isDone(.warmup) == true && !rows.isEmpty
    }

    public static let entryTitle = "Your phrases"

    public static func entrySubtitle(count: Int) -> String { "\(count) phrases \u{00B7} tap to hear, say them" }

    /// "Your phrases for this job interview".
    public static func title(kind: RehearsalEventKind?) -> String {
        "Your phrases for this \((kind ?? .other).label.lowercased())"
    }

    public static let backLabel = "Back to the plan"

    public static func hearLabel(_ phrase: String) -> String { "Hear \(phrase)" }

    /// The line under the title. With the device voice it never claims to be Alphonso.
    public static func hint(deviceVoice: Bool) -> String {
        deviceVoice ? "Tap play to hear it." : "Tap play to hear Alphonso say it."
    }

    public enum Voice: Equatable, Sendable { case model, device }

    public enum HearStep: Equatable, Sendable { case stop, deviceVoice }

    /// What to do after the model voice was tried. A cancelled tap (a newer tap or leaving the screen) never falls back to
    /// the device voice, and a clip that played needs nothing more; only a real failure does.
    public static func afterModel(played: Bool, cancelled: Bool) -> HearStep {
        (cancelled || played) ? .stop : .deviceVoice
    }

    /// Shown when the device has no voice for the course language and the model voice is not available.
    public static let noDeviceVoiceNote = "This device has no voice for this language, so the phrase cannot be played."

    /// Which voice says a phrase: Alphonso's (/api/tts) when the account allows AI speech, the device is online and the
    /// request has not just failed; otherwise the device's own voice in the course language.
    public static func voice(hasAIConsent: Bool, isOnline: Bool, modelFailed: Bool) -> Voice {
        hasAIConsent && isOnline && !modelFailed ? .model : .device
    }
}

/// The audio of phrases already fetched from /api/tts, kept in memory so a replay does not ask again.
public final class RehearsalPhraseAudioCache {
    private var clips: [String: Data] = [:]

    public init() {}

    public func clip(for phrase: String) -> Data? { clips[phrase] }

    public func store(_ audio: Data, for phrase: String) {
        guard !audio.isEmpty else { return }
        clips[phrase] = audio
    }
}

/// The last loaded rehearsal's phrases, kept on the device so the phrasebook still opens with no connection.
public struct RehearsalPhraseSnapshot: Codable, Equatable, Sendable {
    public let rehearsalId: String
    public let course: String
    public let eventKind: String
    public let rows: [RehearsalPhraseRow]
    /// Whether the warm-up (stage 1) was done when this was saved: the offline entry keeps the plan's gate.
    public let warmupDone: Bool

    public init(rehearsalId: String, course: String, eventKind: String, rows: [RehearsalPhraseRow], warmupDone: Bool) {
        self.rehearsalId = rehearsalId
        self.course = course
        self.eventKind = eventKind
        self.rows = rows
        self.warmupDone = warmupDone
    }

    public init?(rehearsal: Rehearsal, progress: RehearsalProgress?) {
        let rows = RehearsalPhrasebook.rows(brief: rehearsal.brief)
        guard !rows.isEmpty else { return nil }
        self.init(rehearsalId: rehearsal.id, course: rehearsal.course, eventKind: rehearsal.eventKind, rows: rows,
                  warmupDone: progress?.isDone(.warmup) == true)
    }

    /// The same gate as the plan's entry.
    public var isOffered: Bool { warmupDone && !rows.isEmpty }

    public var kind: RehearsalEventKind? { RehearsalEventKind(wire: eventKind) }
}

public struct RehearsalPhraseStore {
    public static let key = "rehearsalPhrases.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// Keeps the active rehearsal's phrases; with none (no active rehearsal, or a brief with no phrases) the old copy is dropped.
    public func save(active: Rehearsal?, progress: RehearsalProgress?) {
        guard let active, let snapshot = RehearsalPhraseSnapshot(rehearsal: active, progress: progress),
              let data = try? JSONEncoder().encode(snapshot) else {
            defaults.removeObject(forKey: Self.key)
            return
        }
        defaults.set(data, forKey: Self.key)
    }

    /// The saved phrases for a course; nil when none, unreadable, or saved for another course.
    public func load(course: String) -> RehearsalPhraseSnapshot? {
        guard let data = defaults.data(forKey: Self.key),
              let snapshot = try? JSONDecoder().decode(RehearsalPhraseSnapshot.self, from: data),
              snapshot.course == course, !snapshot.rows.isEmpty else { return nil }
        return snapshot
    }
}
