import Foundation

/// Speaks a scene's opening line when a Practice call or a campaign scene starts.
///
/// The opener is our own fixed text, seeded into the transcript locally, so it never passes through the reply path
/// that synthesizes and plays a model reply. Before this existed, build 59 showed the opener and stayed silent until
/// the learner's first turn. The screens call `speak` with `ConversationSnapshot.pendingOpener`; the steps are here,
/// in the Kit, so they are tested on any platform.
@MainActor
public enum OpenerPlayback {
    /// - Parameters:
    ///   - opener: the line to say; nil (the learner has already answered it) does nothing.
    ///   - begin: claims the voice session (`VoiceSessionController.beginOpener`); nil when it is busy or hidden.
    ///   - audio: the opener's speech in the learner's chosen voice (normally through `OpenerSpeechCache`).
    ///   - play: plays it for the generation `begin` returned, exactly like a reply.
    ///   - withoutAudio: ends the opener without a voice (the speech could not be fetched).
    /// - Returns: true when playback started.
    @discardableResult
    public static func speak(
        _ opener: String?,
        begin: () -> Int?,
        audio: (String) async throws -> Data,
        play: (Data, Int) -> Bool,
        withoutAudio: (Int) -> Void
    ) async -> Bool {
        guard let opener, let generation = begin() else { return false }
        do {
            let speech = try await audio(opener)
            return play(speech, generation)
        } catch {
            // The line is already on screen; a missing voice must not leave the call stuck "thinking".
            withoutAudio(generation)
            return false
        }
    }
}

/// The spoken openers already fetched this session. A scenario's opener is static text, so returning to the call
/// (a tab switch, "New conversation", "Restart scene") replays the same bytes instead of asking /api/tts, and its
/// voice budget, again. Concurrent requests for the same line share one fetch. Keyed by text, voice and course, so
/// a voice changed in Settings fetches the new voice.
@MainActor
public final class OpenerSpeechCache {
    public static let shared = OpenerSpeechCache()

    private let capacity: Int
    private var entries: [String: Data] = [:]
    /// Oldest first, for eviction.
    private var order: [String] = []
    private var inFlight: [String: Task<Data, Error>] = [:]

    public init(capacity: Int = 12) {
        self.capacity = max(1, capacity)
    }

    public var count: Int { entries.count }

    public func audio(
        text: String, voice: String?, course: String?,
        synthesize: @escaping () async throws -> Data
    ) async throws -> Data {
        let key = [course ?? "", voice ?? "", text].joined(separator: "\u{1F}")
        if let cached = entries[key] { return cached }
        if let pending = inFlight[key] { return try await pending.value }
        let task = Task { try await synthesize() }
        inFlight[key] = task
        do {
            let data = try await task.value
            inFlight[key] = nil
            store(data, for: key)
            return data
        } catch {
            // A failure is not cached: the next call tries again.
            inFlight[key] = nil
            throw error
        }
    }

    public func removeAll() {
        entries = [:]
        order = []
    }

    private func store(_ data: Data, for key: String) {
        if entries[key] == nil { order.append(key) }
        entries[key] = data
        while order.count > capacity {
            entries[order.removeFirst()] = nil
        }
    }
}
