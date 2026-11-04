import Foundation

/// Everything the Learn screen's "buy a streak freeze" row shows, so the view only renders. The price is the server's
/// (`buy_streak_freeze_with_xp` charges 75 and takes no cost parameter; web's XP_STREAK_FREEZE_COST is the same), so
/// the number here is display only and must change together with the migration.
public enum StreakFreezeShop {
    public static let xpCost = 75
    public static let buyTitle = "Buy a freeze (\(xpCost) XP)"

    /// "2 streak freezes" / "1 streak freeze".
    public static func ownedText(_ freezes: Int) -> String {
        "\(freezes) streak freeze\(freezes == 1 ? "" : "s")"
    }

    /// Why Buy is switched off, or nil when it is available. The server stays the authority on XP; this only
    /// avoids a pointless request while offline, mid-purchase, or when the cached balance already says no.
    public static func disabledReason(isOnline: Bool, xp: Int, buying: Bool) -> String? {
        if buying { return "Buying a streak freeze" }
        if !isOnline { return "Go online to buy a streak freeze." }
        if xp < xpCost { return "You need \(xpCost) XP for a streak freeze. You have \(xp)." }
        return nil
    }

    /// A message for every outcome: a confirmation for success, the reason for a refusal.
    public static func message(for result: BuyStreakFreezeResult) -> String {
        switch result {
        case let .ok(freezes, _): return "Streak freeze bought. You have \(freezes)."
        case .insufficientXp: return "Not enough XP. A streak freeze costs \(xpCost) XP."
        }
    }

    public static func isSuccess(_ result: BuyStreakFreezeResult) -> Bool {
        if case .ok = result { return true }
        return false
    }

    /// The cached progress after a CONFIRMED purchase; any other outcome leaves it untouched (no optimistic spend).
    public static func progress(after result: BuyStreakFreezeResult, from p: LessonCompletionProgress) -> LessonCompletionProgress {
        guard case let .ok(freezes, xp) = result else { return p }
        return LessonCompletionProgress(
            xp: xp, streak: p.streak, longestStreak: p.longestStreak, lastActiveDate: p.lastActiveDate,
            hearts: p.hearts, heartsRefillAt: p.heartsRefillAt, streakFreezes: freezes, leagueTier: p.leagueTier
        )
    }

    public static func accessibilityLabel(freezes: Int, xp: Int) -> String {
        "\(ownedText(freezes)). \(xp) XP. A freeze keeps your streak if you miss a day."
    }
}
