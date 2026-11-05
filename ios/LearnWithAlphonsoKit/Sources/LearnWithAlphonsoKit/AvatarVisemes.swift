import Foundation

/// A mouth shape of the 2D Alphonso avatar. `closed` draws no mouth layer (the base art already shows the closed
/// mouth); every other case is one `mouth-*.webp` layer.
public enum AvatarViseme: String, CaseIterable, Sendable {
    case closed, half, talk, ah, oh, ee, fv
}

/// Letters to mouth shapes, per course language. Deliberately rough: a cartoon mouth that opens on vowels, closes on
/// m/b/p and bites on f/v reads as speech without any phoneme model.
public enum AvatarVisemes {
    /// The shapes for one word, in order, never the same shape twice in a row. Anything that is not a letter is
    /// ignored, so punctuation and digits produce nothing.
    public static func sequence(for word: String, course: Course) -> [AvatarViseme] {
        var letters = Array(word.lowercased()).filter { $0.isLetter }
        // A final "e" after a consonant is silent in English and (mostly) French: "face", "être".
        if course != .spanish, letters.count > 3, letters.last == "e", let before = letters.dropLast().last,
           !isVowel(before) {
            letters.removeLast()
        }
        var out: [AvatarViseme] = []
        func add(_ shape: AvatarViseme) {
            if out.last != shape { out.append(shape) }
        }
        var i = 0
        while i < letters.count {
            let c = letters[i]
            let next: Character? = i + 1 < letters.count ? letters[i + 1] : nil
            let afterNext: Character? = i + 2 < letters.count ? letters[i + 2] : nil
            if c == "o", next == "u" {
                add(.oh); i += 2; continue
            }
            if c == "o", next == "o", course == .english {
                add(.oh); i += 2; continue
            }
            if c == "p", next == "h", course != .spanish {
                add(.fv); i += 2; continue
            }
            // "que", "qui" (and Spanish "gue", "gui"): the u is silent.
            if next == "u", let afterNext, "eéèêií".contains(afterNext),
               (c == "q" && course != .english) || (c == "g" && course == .spanish) {
                add(.half); i += 2; continue
            }
            if c == "h", course != .english {
                i += 1; continue
            }
            add(shape(for: c))
            i += 1
        }
        return out
    }

    private static func isVowel(_ c: Character) -> Bool {
        switch shape(for: c) {
        case .ah, .ee, .oh: return true
        default: return false
        }
    }

    private static func shape(for c: Character) -> AvatarViseme {
        switch c {
        case "a", "á", "à", "â", "ä", "ã": return .ah
        case "e", "é", "è", "ê", "ë", "i", "í", "ì", "î", "ï", "y": return .ee
        case "o", "ó", "ò", "ô", "ö", "u", "ú", "ù", "û", "ü": return .oh
        case "f", "v": return .fv
        case "m", "b", "p": return .closed
        case "t", "d", "n", "l", "s", "z", "r": return .talk
        default: return .half
        }
    }
}
