import Foundation

/// Everything the Learn screen's "buy a streak freeze" row shows, so the view only renders. The price is the server's
/// (`buy_streak_freeze_with_xp` charges 75 and takes no cost parameter; web's XP_STREAK_FREEZE_COST is the same), so
/// the number here is display only and must change together with the migration.
///
/// XP is per course and the purchase is charged to the ACTIVE course, so the balance shown and checked here is that
/// course's (`StreakFreezeStatus`), never the header cache's, which holds whichever course was updated last.
public enum StreakFreezeShop {
    public static let xpCost = 75
    public static let buyTitle = "Buy a freeze (\(xpCost) XP)"

    /// "2 streak freezes" / "1 streak freeze".
    public static func ownedText(_ freezes: Int) -> String {
        "\(freezes) streak freeze\(freezes == 1 ? "" : "s")"
    }

    /// Why Buy is switched off, or nil when it is available. `xp` is the active course's balance, nil until loaded.
    /// The server stays the authority; this avoids a pointless request while busy, offline or short of XP.
    public static func disabledReason(isOnline: Bool, xp: Int?, buying: Bool) -> String? {
        if buying { return "Buying a streak freeze" }
        if !isOnline { return "Go online to buy a streak freeze." }
        guard let xp else { return "Checking your XP for this course." }
        if xp < xpCost { return "You need \(xpCost) XP in this course for a streak freeze. You have \(xp)." }
        return nil
    }

    /// A message for every outcome: a confirmation for success, the reason for a refusal.
    public static func message(for result: BuyStreakFreezeResult) -> String {
        switch result {
        case let .ok(freezes, _): return "Streak freeze bought. You have \(freezes)."
        case .insufficientXp: return "Not enough XP. A streak freeze costs \(xpCost) XP."
        case .signedOut: return TutorError.signedOut.userMessage()
        }
    }

    public static func isSuccess(_ result: BuyStreakFreezeResult) -> Bool {
        if case .ok = result { return true }
        return false
    }

    /// The status after a purchase outcome. Only a server answer changes it: `ok` carries the new balance and count,
    /// a refusal carries the real balance (so Buy disables), and a sign-out changes nothing.
    public static func status(after result: BuyStreakFreezeResult, from s: StreakFreezeStatus) -> StreakFreezeStatus {
        switch result {
        case let .ok(freezes, xp): return StreakFreezeStatus(xp: xp, streakFreezes: freezes)
        case let .insufficientXp(freezes, xp):
            return StreakFreezeStatus(xp: xp ?? s.xp, streakFreezes: freezes ?? s.streakFreezes)
        case .signedOut: return s
        }
    }

    /// The shared header cache after a purchase: ONLY the account-wide freeze count. Its `xp` belongs to whichever
    /// course was updated last, so another course's balance must never be written over it.
    public static func cachedProgress(freezes: Int, from p: LessonCompletionProgress) -> LessonCompletionProgress {
        LessonCompletionProgress(
            xp: p.xp, streak: p.streak, longestStreak: p.longestStreak, lastActiveDate: p.lastActiveDate,
            hearts: p.hearts, heartsRefillAt: p.heartsRefillAt, streakFreezes: freezes, leagueTier: p.leagueTier
        )
    }

    /// The request failed with no answer (lost response, timeout). After re-reading the server: a higher count means
    /// the purchase did commit, so say so instead of inviting a second tap.
    public static func recoveryMessage(before: Int, after: StreakFreezeStatus?) -> String {
        if let after, after.streakFreezes > before { return "Streak freeze bought. You have \(after.streakFreezes)." }
        return "Could not reach the server. Check your connection and try again."
    }

    public static func accessibilityLabel(freezes: Int, xp: Int?) -> String {
        let balance = xp.map { ". \($0) XP in this course" } ?? ""
        return "\(ownedText(freezes))\(balance). A freeze keeps your streak if you miss a day."
    }
}
