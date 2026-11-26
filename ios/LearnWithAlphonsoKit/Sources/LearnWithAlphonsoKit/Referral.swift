import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The referral program on iOS, as pure functions (design: docs/superpowers/specs/2026-11-17-referral-design.md; the rules
/// live in the database, 20261120140000_referral_program.sql). This file holds the numbers the screen shows, how the
/// shareable link is built, how a referral code is read from a link or typed text, how a captured code is kept until the
/// account exists, and the counts. It never decides whether anything is granted: the server does, on a first completed
/// lesson, and the client has no way to ask for a reward.
///
/// Mirrored in src/lib/referral.ts and core/logic/Referral.kt; keep the three in step.
public enum ReferralConstants {
    /// Hearts a referral grants (hearts are hard-capped at 5, so a full refill). Same value as the SQL constant.
    public static let rewardHearts = 5
    /// Rewarded referrals per referrer per UTC calendar month. Same value as the SQL constant.
    public static let monthlyCap = 20
    /// Streak freezes a Pro referrer can hold before the freeze reward is skipped. Same value as the SQL constant.
    public static let freezeCap = 3
    /// A captured code is forgotten after this long if the visitor never signs up.
    public static let keepSeconds: TimeInterval = 30 * 24 * 60 * 60
}

public enum ReferralCopy {
    public static let title = "Invite friends"
    public static let explainer =
        "Share your link. When a friend signs up and finishes their first lesson, you both get your hearts back to full. If you have Pro, you get a free streak freeze instead."
    public static let proNote = "Pro already has unlimited hearts, so you get a streak freeze (up to 3 at a time)."
    public static let capReached =
        "Monthly invite reward limit reached. Friends can still join, and rewards start again next month."
    public static let loadError = "Couldn't load your invites. Try again."
    public static let copy = "Copy invite link"
    public static let copied = "Link copied!"
    public static let share = "Share"
    public static let shareText = "Learn with me on Alphonso. English, French and Spanish, one lesson at a time."
    public static let enterTitle = "Got an invite code?"
    public static let enterHint = "If a friend invited you, paste their link or code here. It only works on a new account."
    public static let enterField = "Invite link or code"
    public static let enterButton = "Use code"
    public static let enterDone = "Invite added. You both get a reward when you finish your first lesson."

    /// What the learner is told when a typed code is refused. Every refusal is final; only an error invites a retry.
    public static func refusal(_ reason: ReferralClaimReason) -> String {
        switch reason {
        case .unauthenticated: return "Sign in to use an invite code."
        case .unknownCode: return "That invite code isn't valid. Check it and try again."
        case .selfReferral: return "That's your own invite code. Send it to a friend instead."
        case .alreadyReferred: return "You've already used an invite code."
        case .tooLate: return "Invite codes only work for new accounts, before the first lesson."
        }
    }
    public static let claimError = "Couldn't check that code. Try again."
}

/// Why `claim_referral` refused. The raw words are the database's (`reason` in the RPC's answer).
public enum ReferralClaimReason: String, Sendable, Equatable, CaseIterable {
    case unauthenticated
    case unknownCode = "unknown-code"
    case selfReferral = "self"
    case alreadyReferred = "already-referred"
    case tooLate = "too-late"
}

public enum ReferralClaimResult: Equatable, Sendable {
    case claimed
    case refused(ReferralClaimReason)
    /// Anything unexplained (network, an answer that could not be read): the code is kept to retry.
    case error

    /// Whether the answer ends the attempt: claimed, or refused for a real reason. Only `.error` is retried.
    public var isFinal: Bool { self != .error }
}

public enum ReferralLink {
    /// An invite code is the opaque token from friend_invite_codes. Anything else is ignored. Same shape as the web's.
    static func isValid(_ s: String) -> Bool {
        (4...32).contains(s.count) && s.unicodeScalars.allSatisfy {
            $0.value < 128 && (CharacterSet.alphanumerics.contains($0) || "+/=_-".unicodeScalars.contains($0))
        }
    }

    /// The code from a query value (`?ref=...`), or nil when absent or not shaped like a code.
    public static func code(fromParam raw: String?) -> String? {
        guard let raw else { return nil }
        // A base64 code that lost its "+" to form decoding is put back.
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: " ", with: "+")
        return isValid(code) ? code : nil
    }

    /// The code in a web link: the share link `https://learnwithalphonso.com/r/<code>` (an app link) or the older
    /// `https://learnwithalphonso.com/?ref=<code>`; nil for any other URL.
    public static func code(from url: URL, host: String = FriendInviteLink.host) -> String? {
        let accepted = host == FriendInviteLink.host ? FriendInviteLink.acceptedHosts : [host]
        guard url.scheme == "https", let urlHost = url.host?.lowercased(), accepted.contains(urlHost),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        // The path is read still percent-encoded, so an encoded "/" or "+" in a code is not mistaken for a separator.
        let segments = parts.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: true)
        if segments.count == 2, segments[0] == "r" {
            return code(fromParam: segments[1].removingPercentEncoding.map { $0.replacingOccurrences(of: " ", with: "+") })
        }
        return code(fromParam: parts.queryItems?.first(where: { $0.name == "ref" })?.value)
    }

    /// What a learner typed or pasted in the invite-code field: a bare code, or the whole referral link.
    public static func code(fromEntry text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // A typed entry never contains a space (a query value's "+" may have turned into one; a typed one is a typo).
        guard !trimmed.contains(where: { $0.isWhitespace }) else { return nil }
        if let url = URL(string: trimmed), url.scheme != nil { return code(from: url) }
        return code(fromParam: trimmed)
    }

    /// The shareable link for a code: the site's origin plus `/r/<code>`. Same as the web's `referralLink`.
    public static func link(base: URL, code: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.~")
        let encoded = code.addingPercentEncoding(withAllowedCharacters: allowed) ?? code
        var origin = base.absoluteString
        while origin.hasSuffix("/") { origin.removeLast() }
        return "\(origin)/r/\(encoded)"
    }
}

public struct ReferralRow: Equatable, Sendable {
    public let status: String
    public let capped: Bool
    public let completedAt: Date?
    public init(status: String, capped: Bool, completedAt: Date?) {
        self.status = status; self.capped = capped; self.completedAt = completedAt
    }
}

public struct ReferralSummary: Equatable, Sendable {
    /// Friends who joined with this learner's link and finished a first lesson (even past the cap: they did join).
    public let completed: Int
    /// Friends who joined with the link and have not finished a lesson yet.
    public let pending: Int
    /// Rewarded referrals this UTC month (counts toward the cap).
    public let rewardedThisMonth: Int

    public init(completed: Int, pending: Int, rewardedThisMonth: Int) {
        self.completed = completed; self.pending = pending; self.rewardedThisMonth = rewardedThisMonth
    }

    public var capReached: Bool { rewardedThisMonth >= ReferralConstants.monthlyCap }
    public var rewardsLeft: Int { max(0, ReferralConstants.monthlyCap - rewardedThisMonth) }

    public var countLine: String {
        let done = completed == 0
            ? "No friends have finished a first lesson yet"
            : "\(completed) friend\(completed == 1 ? "" : "s") joined and finished a first lesson"
        return pending > 0 ? "\(done). \(pending) still to start." : "\(done)."
    }

    public var rewardsLeftLine: String { "\(rewardsLeft) of \(ReferralConstants.monthlyCap) rewards left this month." }

    /// Counts from the learner's own referral rows (as referrer); mirrors the database's cap count: completed this UTC
    /// month and not capped.
    public static func summarize(_ rows: [ReferralRow], now: Date = Date()) -> ReferralSummary {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: now)) ?? now
        var completed = 0, pending = 0, rewarded = 0
        for row in rows {
            if row.status == "pending" { pending += 1; continue }
            guard row.status == "completed" else { continue }
            completed += 1
            if !row.capped, let at = row.completedAt, at >= monthStart { rewarded += 1 }
        }
        return ReferralSummary(completed: completed, pending: pending, rewardedThisMonth: rewarded)
    }
}

/// Where a captured code waits between the link opening the app and the account existing.
public protocol ReferralCodeStore: AnyObject, Sendable {
    func load() -> (code: String, at: Date)?
    func save(code: String, at: Date)
    func clear()
}

/// The device's copy: one opaque code and the moment it was captured, nothing else.
public final class UserDefaultsReferralStore: ReferralCodeStore, @unchecked Sendable {
    public static let key = "lwa.ref.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public func load() -> (code: String, at: Date)? {
        guard let dict = defaults.dictionary(forKey: Self.key),
              let code = dict["code"] as? String, let at = dict["at"] as? Double else { return nil }
        return (code, Date(timeIntervalSince1970: at))
    }

    public func save(code: String, at: Date) {
        defaults.set(["code": code, "at": at.timeIntervalSince1970], forKey: Self.key)
    }

    public func clear() { defaults.removeObject(forKey: Self.key) }
}

public enum ReferralPending {
    public enum Outcome: Equatable, Sendable { case none, claimed, refused, retryLater }

    /// Remembers a code from the opening link. The FIRST code wins (a later link never replaces it).
    public static func capture(_ code: String?, store: ReferralCodeStore, now: Date = Date()) {
        guard let code = ReferralLink.code(fromParam: code), read(store: store, now: now) == nil else { return }
        store.save(code: code, at: now)
    }

    /// The kept code, or nil when there is none, it is older than 30 days, or the clock went backwards.
    public static func read(store: ReferralCodeStore, now: Date = Date()) -> String? {
        guard let kept = store.load() else { return nil }
        let age = now.timeIntervalSince(kept.at)
        if age > ReferralConstants.keepSeconds || age < -60 { store.clear(); return nil }
        return ReferralLink.isValid(kept.code) ? kept.code : nil
    }

    /// Sends the kept code once the learner is signed in. The stored code is cleared on every FINAL answer (claimed, or
    /// refused for a real reason) and kept only for an unexplained error, so a flaky network does not lose the referral.
    public static func claimPending(
        store: ReferralCodeStore,
        claim: (String) async -> ReferralClaimResult,
        now: Date = Date()
    ) async -> Outcome {
        guard let code = read(store: store, now: now) else { return .none }
        let result = await claim(code)
        guard result.isFinal else { return .retryLater }
        store.clear()
        return result == .claimed ? .claimed : .refused
    }

    /// A code the learner typed or pasted. A final answer also clears any captured code (it has been used or is moot),
    /// so the automatic path never claims a second time.
    public static func claimManual(
        _ entry: String,
        store: ReferralCodeStore,
        claim: (String) async -> ReferralClaimResult
    ) async -> ReferralClaimResult {
        guard let code = ReferralLink.code(fromEntry: entry) else { return .refused(.unknownCode) }
        let result = await claim(code)
        if result.isFinal { store.clear() }
        return result
    }
}

extension ProgressSyncClient {
    /// `claim_referral` (SECURITY DEFINER): the caller is the database's auth.uid(); self-referral, a second referral and
    /// a retroactive claim (account over 2 days old, or a completed lesson) are refused there. Never throws: a failed
    /// call or an answer that cannot be read is `.error`.
    public func claimReferral(code: String) async -> ReferralClaimResult {
        do {
            var request = URLRequest(url: supabaseURL.appendingPathComponent("rest/v1/rpc/claim_referral"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["_code": code])
            let (data, response) = try await requester(request)
            try Self.requireSuccess(data: data, response: response)
            guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let row = rows.first, let ok = row["ok"] as? Bool else { return .error }
            if ok { return .claimed }
            guard let reason = (row["reason"] as? String).flatMap(ReferralClaimReason.init(rawValue:)) else { return .error }
            return .refused(reason)
        } catch {
            return .error
        }
    }

    /// The learner's own referrals as referrer (RLS also shows rows where they are the referee, so the filter is needed).
    public func fetchReferralRows(referrerID: String) async throws -> [ReferralRow] {
        var request = restRequest(path: "referrals", query: [
            URLQueryItem(name: "select", value: "status,capped,completed_at"),
            URLQueryItem(name: "referrer_id", value: "eq.\(referrerID)"),
        ])
        request.httpMethod = "GET"
        let (data, response) = try await requester(request)
        try Self.requireSuccess(data: data, response: response)
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw ProgressSyncError.invalidPayload
        }
        return rows.compactMap { row in
            guard let status = row["status"] as? String else { return nil }
            return ReferralRow(
                status: status,
                capped: row["capped"] as? Bool ?? false,
                completedAt: (row["completed_at"] as? String).flatMap(Self.parsePostgresTimestamp))
        }
    }
}
