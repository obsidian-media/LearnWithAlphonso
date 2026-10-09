import Foundation

/// What learners read for each league tier. The keys are the database's `league_tier`
/// values and never change (progress math, RPCs and stored rows use them); only the display names do.
/// src/lib/league-tier-copy.ts holds the same names; a vitest parity test keeps them identical.
public enum LeagueTierCopy {
    public static let labels: [String: String] = [
        "bronze": "Sprout",
        "silver": "Sapling",
        "sapphire": "Grove",
        "ruby": "Treetop",
        "diamond": "Summit",
    ]

    /// The display name for a tier key. An unknown key (never sent by the server) shows capitalised as-is.
    public static func label(for tier: String) -> String {
        labels[tier] ?? tier.capitalized
    }
}
