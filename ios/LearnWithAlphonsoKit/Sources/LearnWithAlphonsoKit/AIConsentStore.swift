import Foundation
#if canImport(Combine)
import Combine
#endif

public enum AIConsentError: Error, Equatable {
    case signedOut
    case unexpectedResponse
}

/// What the learner's AI setting is, as far as this device can tell. A failed read is `.unavailable` and offers a
/// retry; it is NEVER `.denied`, because a database blip must not tell someone who consented that AI is off.
public enum AIConsentStatus: Equatable, Sendable {
    case loading
    case granted
    case denied
    case unavailable
}

/// A server refusal for lack of consent (403 `ai-consent-required`), announced by the network clients so the store
/// can follow the account without any screen having to forward it.
public enum AIConsentSignal {
    public static let requiredNotification = Notification.Name("LearnWithAlphonso.aiConsentRequired")

    /// Posts the signal for a 403 whose body says `ai-consent-required`; ignores everything else (a 503
    /// `consent-check-failed` is not a consent problem).
    public static func noteIfConsentRequired(status: Int, message: String?) {
        guard status == 403, message == "ai-consent-required" else { return }
        NotificationCenter.default.post(name: requiredNotification, object: nil)
    }
}

/// Where the account's consent lives. The app conforms with `SessionAIConsentBackend` (RPCs via
/// `ProgressSyncClient+AIConsent`); tests use a fake.
@MainActor
public protocol AIConsentBackend: AnyObject {
    func currentUserID() -> String?
    func fetchConsent() async throws -> Date?
    func setConsent(_ granted: Bool) async throws -> Date?
}

/// The learner's AI consent, from the ACCOUNT (`profiles.ai_consent_at`), so a choice made on the web counts on iOS
/// and a withdrawal anywhere counts everywhere. UserDefaults is only a per-account cache used when the server cannot
/// be reached.
///
/// Two more jobs:
/// - One-time sync: a pre-update "Allow" stored on this device (`AIDisclosureGate.acknowledgedDefaultsKey`) is sent
///   to the first account that signs in after the update, once, and never to another account.
/// - Device mirror: after that sync the same key mirrors the current account's consent, so screens that still read
///   `AIDisclosureGate.isAcknowledged()` follow the account.
///
/// Not `@Published`: Kit tests run on Windows without Combine. Where Combine exists the store is an
/// `ObservableObject` and `willSet` sends `objectWillChange`.
@MainActor
public final class AIConsentStore {
    public static let legacySyncedKey = "aiConsent.legacySynced.v1"
    static let cachePrefix = "aiConsent.grantedAt."
    static let deniedMarker = "none"

    public private(set) var grantedAt: Date? { willSet { notifyWillChange() } }
    public private(set) var isResolved = false { willSet { notifyWillChange() } }
    public private(set) var lastRefreshFailed = false { willSet { notifyWillChange() } }
    /// False whenever what is held belongs to another account (or to nobody), even before the next read lands.
    public var isGranted: Bool { grantedAt != nil && isCurrentAccountLoaded }

    /// `.granted` (also from the per-account cache while offline), `.unavailable` after a failed read of an account
    /// that is not known to be granted, `.denied` only after the server itself said no consent, else `.loading`.
    public var status: AIConsentStatus {
        guard isCurrentAccountLoaded else { return .loading }
        if isGranted { return .granted }
        if lastRefreshFailed { return .unavailable }
        return isResolved ? .denied : .loading
    }

    private let backend: any AIConsentBackend
    private let defaults: UserDefaults
    private var loadedUserID: String?
    /// Bumped by every local decision (a `set`, a server refusal). A read that began before one is out of date and
    /// must not overwrite it, neither with its value nor with its failure.
    private var writeGeneration = 0

    private var isCurrentAccountLoaded: Bool { loadedUserID == backend.currentUserID() }

    public init(backend: any AIConsentBackend, defaults: UserDefaults = .standard) {
        self.backend = backend
        self.defaults = defaults
        if let userID = backend.currentUserID() {
            loadedUserID = userID
            let cached = cachedConsent(for: userID)
            grantedAt = cached.date
            isResolved = cached.known
        }
        // A 403 `ai-consent-required` from any AI call means the server has no consent for this account: close the
        // gate at once, then read the truth. Weak, so a store that goes away is simply not notified.
        NotificationCenter.default.addObserver(
            forName: AIConsentSignal.requiredNotification, object: nil, queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.serverRefusedForLackOfConsent()
            }
        }
    }

    public func refresh() async {
        guard let userID = backend.currentUserID() else {
            loadedUserID = nil
            grantedAt = nil
            isResolved = true
            lastRefreshFailed = false
            writeMirror(false)
            return
        }
        if userID != loadedUserID {
            loadedUserID = userID
            let cached = cachedConsent(for: userID)
            grantedAt = cached.date
            isResolved = cached.known
            lastRefreshFailed = false
        }
        let generation = writeGeneration
        do {
            var server = try await backend.fetchConsent()
            guard backend.currentUserID() == userID, generation == writeGeneration else { return }
            if server == nil && hasUnsyncedLegacyAcknowledgement {
                server = try await backend.setConsent(true)
                guard server != nil else { throw AIConsentError.unexpectedResponse }
            }
            guard backend.currentUserID() == userID, generation == writeGeneration else { return }
            defaults.set(true, forKey: Self.legacySyncedKey)
            apply(server, for: userID)
            lastRefreshFailed = false
        } catch is CancellationError {
            return
        } catch let error as URLError where error.code == .cancelled {
            return
        } catch {
            // A failure of a read that is out of date (the learner decided meanwhile, or the account changed) says
            // nothing about the current state.
            guard backend.currentUserID() == userID, generation == writeGeneration else { return }
            lastRefreshFailed = true
        }
    }

    public func set(_ granted: Bool) async throws {
        guard let userID = backend.currentUserID() else { throw AIConsentError.signedOut }
        // Bumped only once the write succeeded: any read that began before it finished is out of date, while a write
        // that fails (offline) must not discard a read that is still in flight.
        let stamp = try await backend.setConsent(granted)
        writeGeneration += 1
        if granted && stamp == nil { throw AIConsentError.unexpectedResponse }
        defaults.set(true, forKey: Self.legacySyncedKey)
        guard backend.currentUserID() == userID else {
            // Another account is signed in now: keep the answer for the account it was made for, show nothing.
            cache(granted ? stamp : nil, for: userID)
            return
        }
        apply(granted ? stamp : nil, for: userID)
        lastRefreshFailed = false
    }

    private func serverRefusedForLackOfConsent() async {
        writeGeneration += 1
        if let userID = backend.currentUserID() {
            defaults.set(true, forKey: Self.legacySyncedKey)
            apply(nil, for: userID)
            lastRefreshFailed = false
        }
        await refresh()
    }

    private var hasUnsyncedLegacyAcknowledgement: Bool {
        !defaults.bool(forKey: Self.legacySyncedKey) && AIDisclosureGate.isAcknowledged(in: defaults)
    }

    private func apply(_ date: Date?, for userID: String) {
        loadedUserID = userID
        grantedAt = date
        isResolved = true
        cache(date, for: userID)
        writeMirror(date != nil)
    }

    private func cache(_ date: Date?, for userID: String) {
        defaults.set(
            date.map { String($0.timeIntervalSince1970) } ?? Self.deniedMarker, forKey: Self.cachePrefix + userID)
    }

    /// Before the one-time sync this key still holds a pre-update acknowledgement; never overwrite it then.
    private func writeMirror(_ granted: Bool) {
        guard defaults.bool(forKey: Self.legacySyncedKey) else { return }
        defaults.set(granted, forKey: AIDisclosureGate.acknowledgedDefaultsKey)
    }

    private func cachedConsent(for userID: String) -> (known: Bool, date: Date?) {
        guard let raw = defaults.string(forKey: Self.cachePrefix + userID) else { return (false, nil) }
        if raw == Self.deniedMarker { return (true, nil) }
        guard let seconds = Double(raw) else { return (false, nil) }
        return (true, Date(timeIntervalSince1970: seconds))
    }

    private func notifyWillChange() {
        #if canImport(Combine)
        objectWillChange.send()
        #endif
    }
}

#if canImport(Combine)
extension AIConsentStore: ObservableObject {}
#endif
