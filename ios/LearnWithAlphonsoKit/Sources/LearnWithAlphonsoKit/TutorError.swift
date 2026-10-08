import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The one error type Hector, Practice, Campaigns and speaking questions
/// classify every AI failure into, so each failure gets copy matching its real
/// cause and no screen guesses from a raw status code.
///
/// `.signedOut` only after the 401-retry-with-refresh has also failed (both
/// clients retry once). `.notEntitled` opens the paywall. `.aiConsentRequired`
/// is the consent gate. `.server(message)` keeps the server's text for
/// diagnostics only; it is never shown, and it is the response's `detail` text
/// only, never a machine code from the `error` field. A `consent-check-failed` 503 is a
/// `.server` error: the consent state could not be read, which is not the same
/// as consent being missing.
public enum TutorError: Error, Equatable, Sendable {
    case signedOut
    case notEntitled
    case aiConsentRequired
    case quotaExceeded(resetsAt: Date?)
    case network
    case server(message: String?)

    /// The machine code in a response body's `error` field, if any.
    public static func errorCode(in body: Data) -> String? {
        let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        return nonEmpty(object?["error"] as? String)
    }

    /// Classifies a non-2xx response. Reads the stable `error` code first, then
    /// the status. Only `detail` (the legacy human-readable text) is kept as the
    /// server message; a machine code is never carried as a message.
    public static func from(status: Int, body: Data) -> TutorError {
        let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        let code = nonEmpty(object?["error"] as? String)
        let detail = nonEmpty(object?["detail"] as? String)

        switch code {
        case "not-entitled": return .notEntitled
        case "ai-consent-required": return .aiConsentRequired
        case "quota-exceeded": return .quotaExceeded(resetsAt: parseDate(object?["resetsAt"] as? String))
        default: break
        }
        if status == 401 { return .signedOut }
        // A 429 without the quota code is an upstream rate limit (NVIDIA or
        // Deepgram), not the learner's daily cap.
        return .server(message: detail)
    }

    /// Classifies a thrown error: transport failures are `.network`.
    public static func from(_ error: Error) -> TutorError {
        if let tutorError = error as? TutorError { return tutorError }
        if error is URLError { return .network }
        return .server(message: nil)
    }

    public func userMessage(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        switch self {
        case .signedOut:
            return "You've been signed out. Please sign in again."
        case .notEntitled:
            return "Hector is part of Alphonso Pro."
        case .aiConsentRequired:
            return "Turn on AI features to practise speaking with a tutor."
        case let .quotaExceeded(resetsAt):
            guard let resetsAt else {
                return "You've reached today's AI practice limit. Try again tomorrow."
            }
            if resetsAt.timeIntervalSince(now) <= 120 {
                return "Too many requests. Wait a minute and try again."
            }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = timeZone
            formatter.dateFormat = "h:mm a"
            return "You've reached today's AI practice limit. It resets at \(formatter.string(from: resetsAt))."
        case .network:
            return Copy.connectionFailure
        case .server:
            return "Something went wrong on our side. Try again."
        }
    }

    /// Copy for a lesson card (speaking question) rather than a tutor conversation: a withdrawn consent there
    /// means "type the phrase", not "turn on AI to practise with a tutor".
    public func cardMessage(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        if self == .aiConsentRequired {
            return "Voice answers are turned off. Type the phrase instead."
        }
        return userMessage(now: now, timeZone: timeZone)
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private static func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }
}
