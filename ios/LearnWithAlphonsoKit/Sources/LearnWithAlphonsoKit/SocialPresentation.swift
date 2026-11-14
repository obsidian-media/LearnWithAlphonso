import Foundation

/// The state mapping behind the redesigned social screens (Duels, Friends, League, Teams). The views only lay
/// these results out; the choices of what to say and which tone to use live here so they are tested.

/// What the Duels screen says about a list of duels.
public enum DuelsPresentation {
    /// "1 pending · 1 active · 3 finished": only the parts that are not zero, nil when every part is.
    public static func summary(pending: Int, active: Int, finished: Int) -> String? {
        let parts = [
            pending > 0 ? "\(pending) pending" : nil,
            active > 0 ? "\(active) active" : nil,
            finished > 0 ? "\(finished) finished" : nil,
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " \u{00B7} ")
    }

    /// The learner's share of the XP earned in a duel so far, 0 to 1; an even split (0.5) when neither has earned any.
    public static func share(mine: Int, theirs: Int) -> Double {
        let m = max(0, mine)
        let t = max(0, theirs)
        guard m + t > 0 else { return 0.5 }
        return Double(m) / Double(m + t)
    }

    public enum ResultTone: Equatable, Sendable { case won, lost, tied, declined }

    /// A finished duel's result for this learner: "Declined", "You won", "You lost" or "Tied".
    public static func result(status: String, winnerID: String?, myID: String?) -> (label: String, tone: ResultTone) {
        if status == "declined" { return ("Declined", .declined) }
        if let winnerID {
            return winnerID == myID ? ("You won", .won) : ("You lost", .lost)
        }
        return ("Tied", .tied)
    }
}

/// What the League screen shows above the board.
public enum LeaguePresentation {
    public enum Medal: Equatable, Sendable { case gold, silver, bronze }

    /// The top three ranks get a medal; every other rank is a plain number.
    public static func medal(rank: Int) -> Medal? {
        switch rank {
        case 1: return .gold
        case 2: return .silver
        case 3: return .bronze
        default: return nil
        }
    }

    /// "Treetop league": the learner's tier by its display name. Nil when no tier is known yet (nothing cached), so
    /// the screen shows no league line rather than a made-up one.
    public static func tierTitle(tier: String?) -> String? {
        guard let tier, !tier.isEmpty else { return nil }
        return "\(LeagueTierCopy.label(for: tier)) league"
    }

    /// The learner's own XP on the board being shown, nil when they are not on it (an empty board, another scope).
    public static func myXP(rows: [(userID: String, xp: Int)], myID: String?) -> Int? {
        guard let myID else { return nil }
        return rows.first { $0.userID == myID }?.xp
    }
}

/// The Teams screen's small decisions.
public enum TeamsPresentation {
    /// Join by code is possible once something is typed (blank space is not a code).
    public static func canJoin(code: String) -> Bool {
        !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Create team is possible once the name has a letter in it.
    public static func canCreate(name: String) -> Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
