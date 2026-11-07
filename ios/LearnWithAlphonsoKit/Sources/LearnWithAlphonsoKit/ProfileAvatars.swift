import Foundation

/// The 16 preset profile pictures (the web's src/lib/profile-avatars.ts): animal friends of Alphonso, painted in the
/// kit style. Presets only, no uploads, so there is nothing to moderate. The choice is stored in profiles.avatar_seed as
/// "animal:<id>", the column friends, leaderboards and study buddies already read. Any other seed (the old random
/// colour seeds) shows initials, which stay the fallback. The art is `<id>.webp` in the app's ProfileAvatars folder.
public enum ProfileAvatars {
    public struct Avatar: Equatable, Sendable {
        public let id: String
        public let label: String
    }

    public static let all: [Avatar] = [
        Avatar(id: "llama-rose", label: "Rose llama"),
        Avatar(id: "llama-cocoa", label: "Cocoa llama"),
        Avatar(id: "alpaca", label: "Alpaca"),
        Avatar(id: "fox", label: "Fox"),
        Avatar(id: "owl", label: "Owl"),
        Avatar(id: "cat", label: "Cat"),
        Avatar(id: "panda", label: "Panda"),
        Avatar(id: "bear", label: "Bear"),
        Avatar(id: "rabbit", label: "Rabbit"),
        Avatar(id: "penguin", label: "Penguin"),
        Avatar(id: "parrot", label: "Parrot"),
        Avatar(id: "koala", label: "Koala"),
        Avatar(id: "lion", label: "Lion"),
        Avatar(id: "hedgehog", label: "Hedgehog"),
        Avatar(id: "corgi", label: "Corgi"),
        Avatar(id: "deer", label: "Deer"),
    ]

    static let prefix = "animal:"

    public static func seed(for id: String) -> String { prefix + id }

    /// The animal a seed names, or nil (initials) for any other seed, including an unknown animal.
    public static func animal(fromSeed seed: String?) -> Avatar? {
        guard let seed, seed.hasPrefix(prefix) else { return nil }
        let id = String(seed.dropFirst(prefix.count))
        return all.first { $0.id == id }
    }

    /// What may be written to avatar_seed: an animal from the list, or a plain colour seed (letters and digits).
    public static func isAllowedSeed(_ seed: String) -> Bool {
        if seed.hasPrefix(prefix) { return animal(fromSeed: seed) != nil }
        guard (1...32).contains(seed.count) else { return false }
        return seed.unicodeScalars.allSatisfy { ("a"..."z").contains($0) || ("A"..."Z").contains($0) || ("0"..."9").contains($0) }
    }

    /// The seed "My initial" writes: the learner's old colour seed when they have one, so their colour stays.
    public static func initialsSeed(current seed: String?) -> String {
        guard let seed, !seed.isEmpty, animal(fromSeed: seed) == nil, isAllowedSeed(seed) else { return "a" }
        return seed
    }

    public static func initial(of name: String?) -> String {
        let first = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(1).uppercased()
        return first.isEmpty ? "?" : first
    }
}
