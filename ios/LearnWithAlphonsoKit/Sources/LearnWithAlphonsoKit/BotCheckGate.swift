import Foundation

/// The bot check on the email forms: what the native-captcha page (src/routes/native-captcha.tsx) has said, and
/// whether an email request may go now.
///
/// - `.waiting`: the page has not handed over a token yet, or the last one was spent or expired. Sending waits.
/// - `.ready`: a fresh single-use token; `spend()` hands it to one request and goes back to waiting.
/// - `.unavailable`: no bot check is configured, or the page never answered (offline, an old server). Requests go
///   without a token, exactly as before; the auth server only requires one once its captcha setting is on.
///
/// Same rules as Android (core/.../auth/BotCheckGate.kt).
public struct BotCheckGate: Sendable, Equatable {
    public enum State: Sendable, Equatable {
        case waiting
        case ready(String)
        case unavailable
    }

    public private(set) var state: State = .waiting
    /// True once the page has said anything; after that a slow token never turns into "send without one".
    public private(set) var heardFromPage = false

    public init() {}

    /// Seconds without any word from the page before requests go without a token.
    public static let pageTimeout: TimeInterval = 10

    public var canSend: Bool { state != .waiting }

    /// One message from the page: `{ type: "token", token }`, `{ type: "expired" }` or `{ type: "unavailable" }`.
    public mutating func receive(_ message: Any) {
        guard let object = message as? [String: Any], let type = object["type"] as? String else { return }
        switch type {
        case "token":
            guard let token = object["token"] as? String, !token.isEmpty else { return }
            heardFromPage = true
            state = .ready(token)
        case "expired":
            heardFromPage = true
            if state != .unavailable { state = .waiting }
        case "unavailable":
            heardFromPage = true
            state = .unavailable
        default:
            return
        }
    }

    /// The page never answered: send without a token rather than block email sign-in.
    public mutating func pageTimedOut() {
        if !heardFromPage, state == .waiting { state = .unavailable }
    }

    /// The token for one request (nil when there is no bot check). A spent token is never handed out twice.
    public mutating func spend() -> String? {
        switch state {
        case .ready(let token):
            state = .waiting
            return token
        case .waiting, .unavailable:
            return nil
        }
    }
}
