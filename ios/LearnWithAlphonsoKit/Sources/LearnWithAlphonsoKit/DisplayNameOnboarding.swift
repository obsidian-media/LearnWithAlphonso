import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Shared with the web prompt word for word (src/lib/name-onboarding.fixtures.json).
public enum NameOnboardingCopy {
    public static let title = "What should other learners call you?"
    public static let publicNote =
        "This name is public. Other learners see it on leaderboards, teams and buddy cards. You can change it later in Settings."
    public static let fieldLabel = "Display name"
    public static let save = "Save name"
    public static let skip = "Skip for now"
    public static let checking = "Checking…"
    public static let looksGood = "Looks good."

    public static func skipNote(currentName: String) -> String {
        DisplayNameOnboarding.isLearnerHandle(currentName)
            ? "If you skip, you'll appear as \(currentName)."
            : "If you skip, you'll appear as a learner name like Learner-4F2A."
    }
}

/// Names from the auth record's user_metadata (Google: given_name may be absent, full_name and name are
/// present; Apple: given_name only if this app saved it on the first authorization).
public struct AuthUserNames: Equatable, Sendable {
    public let givenName: String?
    public let fullName: String?
    public let name: String?

    public init(givenName: String?, fullName: String?, name: String?) {
        self.givenName = givenName
        self.fullName = fullName
        self.name = name
    }
}

/// The one-time public-name prompt. Pure state: the view asks the server through display_name_problem for live
/// checks and confirm_display_name / skip_display_name_prompt to finish. A generation number per edit discards
/// answers for text the learner has already changed.
public struct DisplayNameOnboarding: Equatable, Sendable {
    public enum Check: Equatable, Sendable {
        case idle
        case checking(generation: Int)
        case ok
        case problem(code: String)
        /// The filter could not be reached. Saving is allowed: confirm_display_name checks again.
        case unverified
    }

    public static let minLength = 2
    public static let maxLength = 40

    public private(set) var name: String
    public let currentName: String
    public private(set) var check: Check = .idle
    public private(set) var isSubmitting = false
    public private(set) var submitError: String?
    private var generation = 0

    public init(prefill: String, currentName: String) {
        self.name = prefill
        self.currentName = currentName
        _ = edit(prefill)
    }

    // MARK: - Rules shared with the web (fixture-pinned)

    public static func needsPrompt(nameConfirmedAt: Date?) -> Bool { nameConfirmedAt == nil }

    public static func normalized(_ raw: String) -> String {
        raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// The server's length rule (2 to 40 after cleaning), counted in Unicode scalars like Postgres char_length.
    public static func localProblem(_ raw: String) -> String? {
        let count = normalized(raw).unicodeScalars.count
        return (count < minLength || count > maxLength) ? "invalid-name" : nil
    }

    public static func isLearnerHandle(_ name: String) -> Bool {
        name.range(of: #"^Learner-[0-9A-F]{4}$"#, options: .regularExpression) != nil
    }

    /// Apple's given name saved on the first authorization, else Google's given_name, else the first word of
    /// full_name or name, else the current stored name (a handle for new email users).
    public static func prefill(appleGivenName: String?, names: AuthUserNames?, currentName: String) -> String {
        let candidates = [appleGivenName, names?.givenName, firstWord(names?.fullName), firstWord(names?.name)]
        for candidate in candidates {
            guard let candidate else { continue }
            let clean = normalized(candidate)
            if !clean.isEmpty, !clean.contains("@"), localProblem(clean) == nil { return clean }
        }
        return currentName
    }

    private static func firstWord(_ text: String?) -> String? {
        guard let text else { return nil }
        return normalized(text).split(separator: " ").first.map(String.init)
    }

    // MARK: - Editing and live checks

    /// The generation the view should check against the server, or nil when the length rule already decided.
    @discardableResult
    public mutating func edit(_ text: String) -> Int? {
        name = text
        submitError = nil
        generation += 1
        if let code = Self.localProblem(text) {
            check = .problem(code: code)
            return nil
        }
        check = .checking(generation: generation)
        return generation
    }

    public var pendingCheck: Int? {
        if case .checking(let generation) = check { return generation }
        return nil
    }

    public mutating func applyCheck(problem code: String?, generation: Int) {
        guard generation == self.generation else { return }
        check = code.map { .problem(code: $0) } ?? .ok
    }

    public mutating func checkFailed(generation: Int) {
        guard generation == self.generation else { return }
        check = .unverified
    }

    public var isProblem: Bool {
        if submitError != nil { return true }
        if case .problem = check { return true }
        return false
    }

    public var message: String? {
        if let submitError { return submitError }
        switch check {
        case .problem(let code): return SocialReasonCopy.message(for: code)
        case .checking: return NameOnboardingCopy.checking
        case .ok: return NameOnboardingCopy.looksGood
        case .idle, .unverified: return nil
        }
    }

    public var canSave: Bool {
        guard !isSubmitting else { return false }
        switch check {
        case .ok, .unverified: return true
        case .idle, .checking, .problem: return false
        }
    }

    public var canSkip: Bool { !isSubmitting }

    // MARK: - Save or skip

    public mutating func beginSubmit() -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        submitError = nil
        return true
    }

    public mutating func submitFailed(_ error: Error) {
        isSubmitting = false
        if case .server(_, let code?)? = error as? ProgressSyncError, code == "blocked-content" || code == "invalid-name" {
            check = .problem(code: code)
            return
        }
        submitError = SocialReasonCopy.nameSaveMessage(for: error)
    }

    public mutating func submitSucceeded() {
        isSubmitting = false
    }
}
