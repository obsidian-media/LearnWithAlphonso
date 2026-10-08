import Foundation

/// Everything the out-of-hearts sheet shows, so the view only renders. Mirrors the web's HeartsModal copy and
/// its M:SS countdown (src/hooks/use-countdown.ts: ceil to the second).
public struct OutOfHeartsModel: Sendable, Equatable, Identifiable {
    public let refillAt: Date?
    public var id: Date? { refillAt }

    public init(refillAt: Date?) { self.refillAt = refillAt }

    public static let title = "Out of hearts"
    public static let buyTitle = "Use \(HeartsEconomy.xpHeartCost) XP for a heart"
    public static let practiceInsteadTitle = "Practice or review instead"

    public func countdown(now: Date) -> String? {
        guard let refillAt else { return nil }
        let remaining = refillAt.timeIntervalSince(now)
        guard remaining > 0 else { return nil }
        let total = Int(remaining.rounded(.up))
        return "\(total / 60):\(String(format: "%02d", total % 60))"
    }

    public func isRefillDue(now: Date) -> Bool {
        guard let refillAt else { return false }
        return now >= refillAt
    }

    public func message(now: Date) -> String {
        if let countdown = countdown(now: now) {
            return "You've used all your hearts for now. They refill automatically in \(countdown)."
        }
        return "You've used all your hearts for now. They'll refill again shortly."
    }

    /// Buying needs the server. Review and practice never cost hearts, so that path is always offered.
    public func showsBuy(isOnline: Bool) -> Bool { isOnline }

    public static func buyFailureMessage(_ result: BuyHeartResult) -> String? {
        switch result {
        case .ok: return nil
        case .heartsFull: return "Hearts already full."
        case let .insufficientXp(xp):
            guard let xp else { return "Not enough XP for a heart." }
            return "Not enough XP for a heart. You have \(xp) XP in this course."
        }
    }
}
