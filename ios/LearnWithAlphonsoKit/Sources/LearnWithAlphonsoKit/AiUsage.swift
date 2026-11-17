import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The learner-facing view of `GET /api/ai-usage`, as pure functions. The app holds no limit and no dollar figure: the
/// route sends a state, a percent and a reset instant, and this turns them into words and a meter.
///
/// Fail-safe: anything the route did not promise (unknown state, missing or odd fields, a failed call) is nil, which
/// the screen draws as nothing. Our own read error is never shown to the learner as a scare.
///
/// Mirrored in src/lib/ai-usage-view.ts and core/logic/AiUsage.kt; keep the three in step.
public enum AiUsageState: String, Sendable, Equatable { case ok, warn, capped }

public struct AiUsageView: Equatable, Sendable {
    public let state: AiUsageState
    /// Whole percent, 0 to 100, clamped.
    public let percent: Int
    /// The short state word, shown next to the meter so colour is never the only signal.
    public let label: String
    /// One kind sentence about where they stand.
    public let message: String
    /// Spoken value for the meter ("37 percent used, plenty left").
    public let valueText: String
    /// "Resets on 1 December", or the date-free fallback when the instant cannot be read.
    public let resetLine: String

    /// The note under the meter, as the web joins it: the sentence, "Lessons and review always work." when not ok, the reset.
    public var summary: String {
        [message, state == .ok ? nil : AiUsageCopy.stillWorks, "\(resetLine)."].compactMap { $0 }.joined(separator: " ")
    }
}

public enum AiUsageCopy {
    public static let title = "AI practice this month"
    /// Honest, plain: why a limit exists, that it resets, that normal use is nowhere near it.
    public static let explain =
        "Heavy AI features, like Hector's voice calls and explanations, have a monthly limit that keeps the app sustainable. It resets every month, and normal use never reaches it."
    public static let stillWorks = "Lessons and review always work."
    public static let resetFallback = "Resets at the start of next month"

    static func label(_ s: AiUsageState) -> String {
        switch s {
        case .ok: return "Plenty left"
        case .warn: return "Getting close"
        case .capped: return "Limit reached"
        }
    }

    static func message(_ s: AiUsageState) -> String {
        switch s {
        case .ok: return "You are well within this month's AI practice."
        case .warn: return "You have used most of this month's AI practice."
        case .capped: return "AI practice is paused for now."
        }
    }
}

public enum AiUsage {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private static let months = ["January", "February", "March", "April", "May", "June", "July", "August",
                                 "September", "October", "November", "December"]

    /// "1 December" for the instant, in UTC like the server's month; nil when it cannot be read.
    public static func resetDateLabel(_ resetsAt: String) -> String? {
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: resetsAt) ?? plain.date(from: resetsAt) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.month, .day], from: date)
        guard let day = c.day, let month = c.month, (1...12).contains(month) else { return nil }
        return "\(day) \(months[month - 1])"
    }

    /// Maps the route's answer. Anything unknown or malformed is nil.
    public static func parse(_ raw: Any?) -> AiUsageView? {
        guard let object = raw as? [String: Any],
              let stateWord = object["state"] as? String,
              let state = AiUsageState(rawValue: stateWord),
              let number = object["percentUsed"] as? NSNumber,
              !isBoolean(number) else { return nil }
        let n = number.doubleValue
        guard n.isFinite else { return nil }
        // A capped learner is always at the end of the meter, whatever the number says.
        let percent = state == .capped ? 100 : Int(min(100, max(0, n.rounded(.down))))
        let date = (object["resetsAt"] as? String).flatMap(resetDateLabel)
        let resetLine = date.map { "Resets on \($0)" } ?? AiUsageCopy.resetFallback
        let label = AiUsageCopy.label(state)
        return AiUsageView(
            state: state, percent: percent, label: label, message: AiUsageCopy.message(state),
            valueText: "\(percent) percent used, \(label.lowercased())", resetLine: resetLine)
    }

    /// JSON true/false arrive as NSNumber too; a boolean is not a percent.
    private static func isBoolean(_ n: NSNumber) -> Bool {
        String(cString: n.objCType) == "c"
    }

    public static func parse(data: Data) -> AiUsageView? {
        parse(try? JSONSerialization.jsonObject(with: data))
    }

    /// One read of /api/ai-usage. Never throws: any failure is nil and the card draws nothing. One refresh-and-retry on a 401.
    public static func fetch(
        baseURL: URL,
        accessToken: @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        timeout: TimeInterval = 8,
        requester: Requester = { try await URLSession.shared.data(for: $0) }
    ) async -> AiUsageView? {
        func make(_ token: String) -> URLRequest {
            var request = URLRequest(url: baseURL.appendingPathComponent("api/ai-usage"))
            request.timeoutInterval = timeout
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            return request
        }
        guard var (data, response) = try? await requester(make(accessToken())) else { return nil }
        if (response as? HTTPURLResponse)?.statusCode == 401, let refreshAccessToken,
           let token = await refreshAccessToken() {
            guard let retried = try? await requester(make(token)) else { return nil }
            (data, response) = retried
        }
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return parse(data: data)
    }
}
