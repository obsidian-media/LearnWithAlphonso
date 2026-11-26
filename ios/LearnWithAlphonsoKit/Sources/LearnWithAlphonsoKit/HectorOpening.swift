import Foundation

/// POST /api/hector-greeting's answer: Hector's memory-aware opening line (Pro only; the server makes no AI call).
public struct HectorGreetingReply: Equatable, Sendable {
    public let greeting: String
    public let topic: String?
    /// 0...2: which phrasing was used, sent back as `lastVariant` so the next call words it differently.
    public let variant: Int
    public let remembered: Bool

    public init(greeting: String, topic: String?, variant: Int, remembered: Bool) {
        self.greeting = greeting
        self.topic = topic
        self.variant = variant
        self.remembered = remembered
    }

    public static func parse(_ data: Data) -> HectorGreetingReply? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let greeting = (object["greeting"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !greeting.isEmpty else { return nil }
        return HectorGreetingReply(
            greeting: greeting, topic: object["topic"] as? String,
            variant: object["variant"] as? Int ?? 0, remembered: object["remembered"] as? Bool ?? false)
    }
}

/// The last greeting variant used, per course, so the server can vary the next one. Storage is injected (the app
/// passes UserDefaults, tests a dictionary).
public struct HectorGreetingVariants {
    private let read: (String) -> Int?
    private let write: (String, Int) -> Void

    public init(read: @escaping (String) -> Int?, write: @escaping (String, Int) -> Void) {
        self.read = read
        self.write = write
    }

    /// Backed by UserDefaults.
    public static func userDefaults(_ defaults: UserDefaults = .standard) -> HectorGreetingVariants {
        HectorGreetingVariants(
            read: { key in defaults.object(forKey: key) as? Int },
            write: { key, value in defaults.set(value, forKey: key) })
    }

    private func key(_ course: Course) -> String { "hector.greetingVariant.\(course.wireCode)" }

    public func last(for course: Course) -> Int? { read(key(course)) }
    public func save(_ variant: Int, for course: Course) { write(key(course), variant) }
}

/// What Hector opens a call with, and where it came from.
public struct HectorOpening: Equatable, Sendable {
    public let text: String
    public let fromServer: Bool
    /// Why the server line was not used (consent, quota, auth, network, server); nil when it was.
    public let fallbackReason: String?

    public init(text: String, fromServer: Bool, fallbackReason: String?) {
        self.text = text
        self.fromServer = fromServer
        self.fallbackReason = fallbackReason
    }

    /// A slow greeting request gives way to the local template after this long.
    public static let greetingTimeout: TimeInterval = 5

    /// The server's memory-aware line, or the local template when the request fails, is offline, or answers with an
    /// empty line. The server's variant is remembered per course and sent back next time.
    public static func resolve(
        course: Course, variants: HectorGreetingVariants, localFallback: String,
        timeout: TimeInterval = greetingTimeout,
        fetch: @escaping @Sendable (_ lastVariant: Int?) async throws -> HectorGreetingReply
    ) async -> HectorOpening {
        let last = variants.last(for: course)
        do {
            let reply = try await withThrowingTaskGroup(of: HectorGreetingReply.self) { group in
                group.addTask { try await fetch(last) }
                group.addTask {
                    try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                    throw TutorError.network
                }
                defer { group.cancelAll() }
                guard let first = try await group.next() else { throw TutorError.network }
                return first
            }
            let text = reply.greeting.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                return HectorOpening(text: localFallback, fromServer: false, fallbackReason: "server")
            }
            variants.save(reply.variant, for: course)
            return HectorOpening(text: text, fromServer: true, fallbackReason: nil)
        } catch {
            return HectorOpening(text: localFallback, fromServer: false, fallbackReason: HectorCall.failureReason(error))
        }
    }
}
