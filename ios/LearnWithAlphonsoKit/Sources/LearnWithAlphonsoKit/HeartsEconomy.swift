import Foundation

/// Direct port of src/lib/hearts.ts -- pure hearts-economy math. Keep this
/// in sync with that file (and supabase/functions/complete-lesson/hearts.ts,
/// the Deno port).
///
/// 2026-09-18 comprehensive audit, finding H2: the hearts-regeneration fix
/// that TypeScript file carries (heartsRefillAt was being set but nothing
/// ever resolved it, so hearts stayed at 0 forever once a user ran out) was
/// never ported here -- this file didn't exist before. It's added now as a
/// pure, additive port, matching the pattern ProgressMath.swift/SRSEngine.swift
/// already established. It is deliberately NOT wired into
/// ProgressSyncClient.swift's loseHeart (or any other write path) in this
/// pass -- that file's direct-write design is in-flight, owned by a
/// concurrent session, and wiring this in requires a decision about how
/// ProgressSyncClient should call it (locally, to mirror the server's
/// resolution before writing? via a new RPC round trip instead of a direct
/// table write, once the web-side RPC conversion lands?) that isn't mine to
/// make unilaterally. This file exists so that decision has a
/// ready-to-use, already-correct implementation to wire in, without
/// re-deriving the logic from scratch.
public enum HeartsEconomy {
    public static let maxHearts = 5
    public static let heartRefillSeconds: TimeInterval = 30 * 60
    public static let streakHeartMilestoneDays = 7
    public static let xpHeartCost = 50

    public struct HeartsState: Sendable, Equatable {
        public let hearts: Int
        public let heartsRefillAt: Date?

        public init(hearts: Int, heartsRefillAt: Date?) {
            self.hearts = hearts
            self.heartsRefillAt = heartsRefillAt
        }
    }

    public static func resolveHeartsRefill(hearts: Int, heartsRefillAt: Date?, now: Date) -> HeartsState {
        if let refillAt = heartsRefillAt, now >= refillAt {
            return HeartsState(hearts: maxHearts, heartsRefillAt: nil)
        }
        return HeartsState(hearts: hearts, heartsRefillAt: heartsRefillAt)
    }

    public static func gainHearts(hearts: Int, amount: Int) -> HeartsState {
        HeartsState(hearts: min(maxHearts, hearts + amount), heartsRefillAt: nil)
    }

    public static func perfectLessonBonusEarned(correct: Int, total: Int) -> Bool {
        total > 0 && correct == total
    }

    public static func streakHeartMilestoneReached(oldStreak: Int, newStreak: Int) -> Bool {
        newStreak > oldStreak && newStreak % streakHeartMilestoneDays == 0
    }

    public enum XpPurchaseResult: Sendable, Equatable {
        case ok(hearts: Int, xp: Int)
        case heartsFull
        case insufficientXp
    }

    /// Spend XP to buy back a heart -- an XP sink that gives impatient
    /// users agency instead of just waiting out the timer.
    public static func buyHeartWithXp(hearts: Int, xp: Int, cost: Int = xpHeartCost) -> XpPurchaseResult {
        if hearts >= maxHearts { return .heartsFull }
        if xp < cost { return .insufficientXp }
        return .ok(hearts: hearts + 1, xp: xp - cost)
    }
}
