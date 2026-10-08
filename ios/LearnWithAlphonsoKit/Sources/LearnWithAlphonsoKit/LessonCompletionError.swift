import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Why a lesson completion failed, decided once, so the player and the sync queue treat each cause by its real
/// meaning. Before this, every failure was "queue it and say offline", so a rejected payload sat in the queue
/// forever and a 4xx read as "you're offline".
public enum LessonCompletionError: Error, Equatable, Sendable {
    case offline
    case unauthorized
    /// Only built for 5xx and 429: transient server trouble.
    case server(status: Int)
    /// Every other 4xx. `code` is the server's stable `{error}` code, or nil when it sent prose.
    case rejected(code: String?)
    case timeout
    /// A completion payload that fails the local trust-boundary check (see `validateLessonCompletion`).
    case invalidPayload

    /// True for offline, server and timeout. Rejected payloads are never queued (no retry can fix them);
    /// unauthorized is resolved by a token refresh, not by waiting.
    public var shouldQueue: Bool {
        switch self {
        case .offline, .server, .timeout: return true
        case .unauthorized, .rejected, .invalidPayload: return false
        }
    }

    public static func classify(_ error: Error) -> LessonCompletionError {
        if let classified = error as? LessonCompletionError { return classified }
        if let urlError = error as? URLError {
            return urlError.code == .timedOut ? .timeout : .offline
        }
        switch error as? ProgressSyncError {
        case .outOfHearts?: return .rejected(code: "out-of-hearts")
        case let .server(status, message)?: return classify(status: status, code: message)
        // A 2xx we could not read: the server may have recorded it, and complete-lesson is replay-safe.
        case .badResponse?, .invalidPayload?: return .server(status: 502)
        case nil: return .server(status: 500)
        }
    }

    public static func classify(status: Int, code: String?) -> LessonCompletionError {
        switch status {
        case 401: return .unauthorized
        case 408: return .timeout
        case 429, 500...599: return .server(status: status)
        default: return .rejected(code: stableCode(code))
        }
    }

    /// The edge functions' `{error: "<code>"}` codes are lowercase-hyphenated. Anything else (a sentence) is
    /// not a code and must never be matched or shown as one.
    static func stableCode(_ raw: String?) -> String? {
        guard let raw, raw.range(of: "^[a-z][a-z0-9-]*$", options: .regularExpression) != nil else { return nil }
        return raw
    }

    public var userMessage: String {
        switch self {
        case .offline:
            return Copy.savedOffline
        case .timeout:
            return "The server took too long to answer. Your lesson is saved and will sync automatically."
        case .server:
            return "Our server had a problem. Your lesson is saved and will sync automatically."
        case .unauthorized:
            return "You've been signed out, so this lesson couldn't be saved. Sign in to keep learning."
        case .rejected(code: "lesson-version-mismatch"):
            return "This lesson changed since you started it, so this attempt can't be saved. Update the app, then try the lesson again."
        case .rejected(code: "out-of-hearts"):
            return "You're out of hearts, so this lesson can't be saved right now."
        case .rejected, .invalidPayload:
            return "We couldn't save this lesson."
        }
    }

    /// The support path for failures the learner cannot fix by waiting.
    public var supportLine: String? {
        switch self {
        case .rejected, .invalidPayload: break
        default: return nil
        }
        return "If this keeps happening, email support@alphonsoecosystem.app."
    }

    /// Stable reason for dead-letter rows and logs. Never shown to the learner.
    public var reasonCode: String {
        switch self {
        case .offline: return "offline"
        case .unauthorized: return "unauthorized"
        case let .server(status): return "server-\(status)"
        case let .rejected(code): return code ?? "rejected"
        case .timeout: return "timeout"
        case .invalidPayload: return "invalid-payload"
        }
    }
}
