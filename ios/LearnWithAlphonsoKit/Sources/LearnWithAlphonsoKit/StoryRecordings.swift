import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Pre-recorded story narration (mirrors src/lib/story-recordings.ts). A story's sentences are recorded once, by
/// scripts/story-audio.ts, into the public podcast-audio bucket under stories/<storyId>/, with a manifest.json that lists
/// each recorded sentence by its text. A reader looks a sentence up BY TEXT, so an edited sentence has no entry (it falls
/// back to live /api/tts speech) and nothing is hashed on the device. With every sentence recorded, narration is a plain
/// file download: no AI call, no AI quota, no AI consent.
public struct StoryRecordings: Equatable, Sendable {
    /// Normalised sentence text -> object path in the bucket.
    public let files: [String: String]

    public init(files: [String: String]) { self.files = files }

    /// The characters JavaScript's `\s` treats as whitespace (so this agrees with the web and the generator): NBSP and
    /// U+202F, common before French punctuation, included; U+0085, which Swift counts but JavaScript does not, excluded.
    private static func isSpace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        default: return false
        }
    }

    /// NFC, whitespace collapsed, trimmed: the same rule as the web and the generator.
    public static func normalize(_ text: String) -> String {
        text.precomposedStringWithCanonicalMapping.unicodeScalars
            .split(whereSeparator: { isSpace($0) })
            .map { String(String.UnicodeScalarView($0)) }
            .joined(separator: " ")
    }

    /// Reads a v1 manifest. Anything else (another version, junk, files outside stories/) is nil or skipped.
    public static func parse(_ data: Data) -> StoryRecordings? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (object["v"] as? Int) == 1,
              let entries = object["entries"] as? [[String: Any]] else { return nil }
        var files: [String: String] = [:]
        for entry in entries {
            guard let text = entry["text"] as? String, let file = entry["file"] as? String,
                  file.hasPrefix("stories/"), !file.contains("..") else { continue }
            files[normalize(text)] = file
        }
        return StoryRecordings(files: files)
    }

    /// The object path of the recording for a sentence, or nil.
    public func path(for text: String) -> String? { files[Self.normalize(text)] }

    /// True when every sentence has a recording (and there is at least one).
    public func allRecorded(_ segments: [String]) -> Bool {
        !segments.isEmpty && segments.allSatisfy { path(for: $0) != nil }
    }

    /// Narration may start when every sentence is recorded (nothing to authorise or pay for), or else when AI speech is
    /// on, which the live fallback needs. A recorded story therefore plays with AI speech off.
    public static func canNarrate(
        segments: [String], recordings: StoryRecordings?, aiConsentGranted: Bool
    ) -> Bool {
        if recordings?.allRecorded(segments) == true { return true }
        return aiConsentGranted
    }

    /// A sentence whose audio downloaded but would not play: a recording falls back to the live voice for that sentence
    /// when AI speech is on (like the web). Without consent, or when the live audio itself would not play, narration
    /// stops as unavailable, so a broken file never spends AI quota without consent.
    public static func speakLiveAfterPlayFailure(wasRecorded: Bool, aiConsentGranted: Bool) -> Bool {
        wasRecorded && aiConsentGranted
    }

    public static func manifestURL(supabaseURL: URL, storyID: String) -> URL? {
        PodcastPlayback.audioURL(supabaseURL: supabaseURL, audioPath: "stories/\(storyID)/manifest.json")
    }

    public static func audioURL(supabaseURL: URL, path: String) -> URL? {
        PodcastPlayback.audioURL(supabaseURL: supabaseURL, audioPath: path)
    }

    /// Loads a story's manifest. Any failure (no file yet, offline, bad JSON) is nil, never a throw.
    public static func load(
        supabaseURL: URL, storyID: String,
        requester: @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) async -> StoryRecordings? {
        guard let url = manifestURL(supabaseURL: supabaseURL, storyID: storyID) else { return nil }
        guard let (data, response) = try? await requester(URLRequest(url: url)),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return parse(data)
    }
}
