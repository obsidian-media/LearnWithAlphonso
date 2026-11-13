import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The learner's daily Hector allowance (BACKLOG 0.0-bq #5), read before Hector greets so a learner who has used it
/// up sees the "out for today" message instead of one more cached greeting.
///
/// There is no status endpoint: `consume_ai_quota` keeps one `ai_usage` row per user, day and kind, and the learner
/// may read their own rows. The day is the UTC date (the function keys on `current_date` on a UTC database), and the
/// call that would take the count past the limit is the one refused, so the allowance is used up once the count has
/// reached it. Fails open: a failed read leaves the greeting as before, because the server still refuses the turn.
///
/// The limit is NOT a constant here: the server says it (`GET /api/app-config`, `limits.hectorDaily`) and no client holds
/// a copy. With no limit known the allowance is never "used up" (fail open).
///
/// Mirrored in src/lib/hector-allowance.ts and core/logic/HectorAllowance.kt; keep the three in step.
public enum HectorAllowance {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    /// The limit in an `/api/app-config` answer: a positive whole number, or nil.
    public static func limit(from data: Data) -> Int? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let limits = object["limits"] as? [String: Any],
              let number = limits["hectorDaily"] as? NSNumber else { return nil }
        let d = number.doubleValue
        return d.rounded() == d && d > 0 && d < Double(Int.max) ? Int(d) : nil
    }

    /// Asks the server for the limit. Never throws: any failure is nil (fail open).
    public static func fetchLimit(
        baseURL: URL,
        timeout: TimeInterval = 5,
        requester: Requester = { try await URLSession.shared.data(for: $0) }
    ) async -> Int? {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/app-config"))
        request.timeoutInterval = timeout
        guard let (data, response) = try? await requester(request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return limit(from: data)
    }

    /// The words the server's own quota refusal shows (TutorError.quotaExceeded carries the same).
    public static let outForToday = "You've reached today's AI practice limit. Try again tomorrow."

    /// consume_ai_quota keys on the UTC date.
    public static func utcDay(_ now: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// True when any of today's counts has reached the limit; no row, or no known limit, never locks the learner out.
    public static func isUsedUp(counts: [Int], limit: Int?) -> Bool {
        guard let limit else { return false }
        return counts.contains { $0 >= limit }
    }
}
