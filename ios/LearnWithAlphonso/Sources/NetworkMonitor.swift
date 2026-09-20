import Foundation
import Network

/// Wraps `NWPathMonitor` (Network framework, no new dependency) as an
/// observable connectivity signal. `isConnected` starts optimistically
/// `true` -- `NWPathMonitor` reports its first real path shortly after
/// `start()`, and assuming online until proven otherwise is the safer
/// default (a false "online" briefly just means one write attempt fails
/// and falls back to queuing, rather than everything being needlessly
/// queued at cold launch before the monitor has reported anything).
@Observable
@MainActor
final class NetworkMonitor {
    private(set) var isConnected = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.obsidianmedia.learnwithalphonso.NetworkMonitor")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            Task { @MainActor in
                self?.isConnected = connected
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
