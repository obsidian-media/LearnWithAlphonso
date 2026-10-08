import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Why the last send or verify did not work, in words a learner can act on (never "offline" for a server
/// error, never a raw code).
public enum CodeFailure: Equatable, Sendable {
    case invalidEmail, invalidCode, expiredCode, tooManyRequests, connection, other

    public var message: String {
        switch self {
        case .invalidEmail: return AuthCopy.invalidEmail
        case .invalidCode: return AuthCopy.invalidCode
        case .expiredCode: return AuthCopy.expiredCode
        case .tooManyRequests: return AuthCopy.tooManyRequests
        case .connection: return Copy.connectionFailure
        case .other: return AuthCopy.generic
        }
    }
}

/// The email sign-in steps (the code step used to be a dead end). Pure, so the rules a reviewer depends on are
/// tested on any platform:
/// - "Use a different email" goes back with the address kept;
/// - "Resend code" waits 60 s after each send, or longer if the server says so;
/// - only ASCII digits are kept, at most six, and the sixth digit submits on its own;
/// - a rejected code is "invalid" or "expired" by age. GoTrue answers both with the same 403
///   ("Token has expired or is invalid"), so the client is the only place that can tell them apart.
public struct EmailCodeFlow: Equatable, Sendable {
    public enum Phase: Equatable, Sendable { case enteringEmail, enteringCode }

    public static let codeLength = 6
    public static let resendCooldown: TimeInterval = 60
    /// GoTrue's email OTP lifetime (Dashboard: Authentication > Email > Email OTP Expiration). 3600 s is the
    /// Supabase default; the owner confirms the live value.
    public static let codeLifetime: TimeInterval = 3600

    public var email: String
    public private(set) var phase: Phase = .enteringEmail
    public private(set) var code = ""
    public private(set) var codeSentAt: Date?
    public private(set) var failure: CodeFailure?
    public private(set) var notice: String?
    public private(set) var resendAvailableAt: Date?

    public init(email: String = "") {
        self.email = email
    }

    public var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    public var canSendCode: Bool {
        let parts = trimmedEmail.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty else { return false }
        let domain = parts[1]
        return domain.contains(".") && !domain.hasPrefix(".") && !domain.hasSuffix(".")
    }

    public var isCodeComplete: Bool { code.count == Self.codeLength }

    /// A new sign-in attempt by another route (Apple, Google) starts clean: a stale email error must never hide
    /// that attempt's own error.
    public mutating func clearFailure() {
        failure = nil
        notice = nil
    }

    public mutating func markInvalidEmail() {
        failure = .invalidEmail
        notice = nil
    }

    public mutating func codeSent(at date: Date) {
        phase = .enteringCode
        code = ""
        failure = nil
        notice = nil
        codeSentAt = date
        resendAvailableAt = date.addingTimeInterval(Self.resendCooldown)
    }

    public mutating func useDifferentEmail() {
        phase = .enteringEmail
        code = ""
        failure = nil
        notice = nil
        codeSentAt = nil
        resendAvailableAt = nil
    }

    public func resendSecondsRemaining(now: Date) -> Int {
        guard let resendAvailableAt else { return 0 }
        return max(0, Int(resendAvailableAt.timeIntervalSince(now).rounded(.up)))
    }

    public func canResend(now: Date) -> Bool {
        phase == .enteringCode && resendSecondsRemaining(now: now) == 0
    }

    public mutating func codeResent(at date: Date) {
        codeSent(at: date)
        notice = AuthCopy.codeResent(to: trimmedEmail)
    }

    /// Keeps ASCII digits only (a pasted "123 456" or an autofilled code both work), at most six. Returns true
    /// exactly when this edit completed the code: that is when the screen submits it without a tap.
    @discardableResult
    public mutating func enterCode(_ raw: String) -> Bool {
        let wasComplete = isCodeComplete
        let previous = code
        code = String(raw.filter { $0.isASCII && $0.isNumber }.prefix(Self.codeLength))
        if code != previous {
            failure = nil
            notice = nil
        }
        return !wasComplete && isCodeComplete
    }

    public mutating func verificationFailed(_ error: Error, now: Date) {
        notice = nil
        if error is URLError {
            failure = .connection
            return
        }
        switch error as? SupabaseAuthError {
        case .server(let status, _)? where status == 429:
            failure = .tooManyRequests
        case .server(let status, _)? where [400, 401, 403, 422].contains(status):
            if let codeSentAt, now.timeIntervalSince(codeSentAt) >= Self.codeLifetime {
                failure = .expiredCode
            } else {
                failure = .invalidCode
            }
        case .badResponse?:
            failure = .connection
        default:
            failure = .other
        }
    }

    /// A failed first send (email step) or resend (code step).
    public mutating func sendFailed(_ error: Error, now: Date) {
        notice = nil
        if error is URLError {
            failure = .connection
            return
        }
        switch error as? SupabaseAuthError {
        case .server(let status, let message)? where status == 429:
            failure = .tooManyRequests
            if let seconds = Self.retryAfterSeconds(in: message) {
                resendAvailableAt = now.addingTimeInterval(TimeInterval(seconds))
            }
        case .server(let status, _)? where (400..<500).contains(status):
            failure = phase == .enteringEmail ? .invalidEmail : .other
        case .badResponse?:
            failure = .connection
        default:
            failure = .other
        }
    }

    /// GoTrue's rate-limit text: "For security purposes, you can only request this after 42 seconds."
    static func retryAfterSeconds(in message: String?) -> Int? {
        guard let message,
              let range = message.range(of: #"after (\d+) seconds?"#, options: .regularExpression) else { return nil }
        return Int(message[range].filter(\.isNumber))
    }
}
