import Foundation

/// Direct port of src/lib/hearts.ts -- pure hearts-economy math. Keep this
/// in sync with that file (and supabase/functions/_shared/hearts.ts,
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

    /// One heart comes back every `heartRefillSeconds` while hearts are below `maxHearts`, counted from the moment the
    /// learner first dropped below the cap (or from the last refill). `heartsRefillAt` is when the NEXT heart arrives
    /// and is nil exactly when hearts are full. Every heart that has come due is added (two hours away = four), capped
    /// at `maxHearts`, and the leftover time carries into the next one. A row below the cap with no timer starts the
    /// clock now rather than staying stuck. Same rule as src/lib/hearts.ts and the SQL hearts_refill_resolve.
    public static func resolveHeartsRefill(hearts: Int, heartsRefillAt: Date?, now: Date) -> HeartsState {
        if hearts >= maxHearts { return HeartsState(hearts: maxHearts, heartsRefillAt: nil) }
        guard let refillAt = heartsRefillAt else {
            return HeartsState(hearts: hearts, heartsRefillAt: now.addingTimeInterval(heartRefillSeconds))
        }
        if now < refillAt { return HeartsState(hearts: hearts, heartsRefillAt: refillAt) }
        let due = 1 + Int((now.timeIntervalSince(refillAt) / heartRefillSeconds).rounded(.down))
        let next = min(maxHearts, hearts + due)
        if next >= maxHearts { return HeartsState(hearts: maxHearts, heartsRefillAt: nil) }
        return HeartsState(hearts: next, heartsRefillAt: refillAt.addingTimeInterval(Double(due) * heartRefillSeconds))
    }

    /// Adds hearts (a bonus or a purchase), capped at `maxHearts`. A refill already running keeps its clock; the
    /// timer clears only once hearts are full.
    public static func gainHearts(hearts: Int, amount: Int, heartsRefillAt: Date?, now: Date) -> HeartsState {
        let cur = resolveHeartsRefill(hearts: hearts, heartsRefillAt: heartsRefillAt, now: now)
        return resolveHeartsRefill(hearts: min(maxHearts, cur.hearts + amount), heartsRefillAt: cur.heartsRefillAt, now: now)
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

    /// The same rule as src/lib/hearts.ts's heartsGate and the start-lesson-session edge function. The app uses
    /// it only OFFLINE, against the cached progress; online the server's 409 is the rule.
    public enum GateDecision: Sendable, Equatable {
        case open
        case outOfHearts(refillAt: Date?)
    }

    /// Alphonso Pro has unlimited hearts: never out of hearts, and a wrong answer costs nothing. The server agrees
    /// (lose_heart and the lesson settlement skip Pro), so `unlimited` only keeps the app's own display in step.
    public static func gate(hearts: Int, heartsRefillAt: Date?, now: Date, unlimited: Bool = false) -> GateDecision {
        if unlimited { return .open }
        let resolved = resolveHeartsRefill(hearts: hearts, heartsRefillAt: heartsRefillAt, now: now)
        return resolved.hearts > 0 ? .open : .outOfHearts(refillAt: resolved.heartsRefillAt)
    }

    /// "M:SS" until the next heart comes back (ceil to the second, like the web's useCountdown), or nil when hearts
    /// are full, no clock is running, or the heart is already due. Drives the "+1 in 12:34" hint next to the counter.
    public static func nextHeartCountdown(hearts: Int, heartsRefillAt: Date?, now: Date) -> String? {
        guard hearts < maxHearts, let refillAt = heartsRefillAt else { return nil }
        let remaining = refillAt.timeIntervalSince(now)
        guard remaining > 0 else { return nil }
        let total = Int(remaining.rounded(.up))
        return "\(total / 60):\(String(format: "%02d", total % 60))"
    }

    /// Whether a wrong answer costs a heart. False for Alphonso Pro (unlimited hearts).
    public static func wrongAnswerCostsHeart(unlimited: Bool) -> Bool { !unlimited }

    /// The cached state after a wrong answer costs a heart (the server does the same in lose_heart). Due refills are
    /// settled first; a refill already pending keeps its clock (losing a heart does not reset the wait); from full
    /// hearts a new 30-minute clock starts now, so the offline gate and the header can show a countdown.
    public static func afterLosingHeart(hearts: Int, heartsRefillAt: Date?, now: Date) -> HeartsState {
        let cur = resolveHeartsRefill(hearts: hearts, heartsRefillAt: heartsRefillAt, now: now)
        return HeartsState(
            hearts: max(0, cur.hearts - 1),
            heartsRefillAt: cur.heartsRefillAt ?? now.addingTimeInterval(heartRefillSeconds))
    }
}
