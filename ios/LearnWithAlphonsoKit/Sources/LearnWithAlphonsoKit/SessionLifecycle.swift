import Foundation

/// Account-scoped cleanup that must run whenever the signed-in account goes away from this
/// device: on sign-out and after the server has deleted the account. Stores register a
/// handler once at launch (`AccountDataCleanup.register` for the core ones; other features
/// add their own). `Session` runs them.
///
/// Handlers run one at a time, in registration order. They are non-throwing by signature,
/// so one handler's failure cannot stop the next: each handler catches its own errors.
/// Cancellation of the calling task is ignored on purpose, because a half-run cleanup is
/// exactly the state this type exists to prevent.
@MainActor
public final class SessionLifecycle {
    public enum Event: Sendable, Equatable {
        case signedOut
        case accountDeleted
    }

    private var handlers: [(id: String, run: @MainActor (Event) async -> Void)] = []

    public init() {}

    /// Registering an id that already exists replaces that handler and keeps its position,
    /// so a store re-created by SwiftUI cannot register its cleanup twice.
    public func register(_ id: String, _ handler: @escaping @MainActor (Event) async -> Void) {
        if let index = handlers.firstIndex(where: { $0.id == id }) {
            handlers[index] = (id, handler)
        } else {
            handlers.append((id, handler))
        }
    }

    public var registeredIDs: [String] { handlers.map(\.id) }

    public func run(_ event: Event) async {
        for handler in handlers {
            await handler.run(event)
        }
    }
}

/// A durable "account cleanup still owed" marker. `Session` marks it synchronously when a
/// session ends and clears it once the handlers finished, so a process kill in between
/// cannot leave the previous account's data for the next one: the next launch finishes it.
public struct PendingCleanupStore {
    private static let key = "sessionCleanupPending"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var pending: SessionLifecycle.Event? {
        switch defaults.string(forKey: Self.key) {
        case "signedOut": return .signedOut
        case "accountDeleted": return .accountDeleted
        default: return nil
        }
    }

    public func mark(_ event: SessionLifecycle.Event) {
        defaults.set(event == .signedOut ? "signedOut" : "accountDeleted", forKey: Self.key)
    }

    public func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}

extension SessionLifecycle {
    /// Launch-time recovery: if the last run never finished (the process was killed), run it
    /// now. Call only when no cleanup is in flight.
    public func resumePending(_ store: PendingCleanupStore) async {
        guard let event = store.pending else { return }
        await run(event)
        store.clear()
    }
}
