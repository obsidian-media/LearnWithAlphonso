import Foundation

/// Decides whether a system-appearance reading should be applied to the theme. It applies only real
/// changes, and after `maxChanges` changes inside `window` seconds it stops (trips) until `rearm()`.
/// Why: build 38 hung at launch because an appearance read fed back into `.preferredColorScheme` and
/// flipped every render (FRONTBOARD watchdog kill). The app listens for live changes, so a
/// future loop must end after a handful of flips instead of spinning.
public struct AppearanceChangeGate: Sendable {
    public enum Appearance: Sendable, Equatable { case light, dark }

    public private(set) var current: Appearance?
    public private(set) var isTripped = false
    private var recentChanges: [Date] = []
    private let maxChanges: Int
    private let window: TimeInterval

    public init(maxChanges: Int = 4, window: TimeInterval = 2) {
        self.maxChanges = maxChanges
        self.window = window
    }

    /// True when the reading should be applied.
    public mutating func offer(_ reading: Appearance, at now: Date) -> Bool {
        if isTripped || reading == current { return false }
        guard current != nil else {
            current = reading
            return true
        }
        recentChanges = recentChanges.filter { now.timeIntervalSince($0) < window }
        guard recentChanges.count < maxChanges else {
            isTripped = true
            return false
        }
        recentChanges.append(now)
        current = reading
        return true
    }

    /// Clears a trip (called when the app returns to the foreground).
    public mutating func rearm() {
        isTripped = false
        recentChanges = []
    }
}
