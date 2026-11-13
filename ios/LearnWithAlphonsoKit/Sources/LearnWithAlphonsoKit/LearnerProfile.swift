import Foundation

/// The learner's first-run answers (visual round 6, part 3), the same contract as the web's src/lib/learner-profile.ts:
/// kept on the account in auth `user_metadata.learner_profile`, written only through the server's checked save
/// (/api/learner-profile), read back field by field so one bad value drops only itself.
///
/// Privacy rules (same as the web): an age RANGE only, never a birth date; there is no under-13 range here at all (the
/// age screen's block stays on the device, see FirstRun.swift). The lists below must match the web's exactly
/// (src/lib/learner-profile-native-parity.test.ts compares them).
public enum LearnerProfileLists {
    public static let metadataKey = "learner_profile"

    public static let ageRanges = ["13-17", "18-24", "25-34", "35-54", "55+"]
    public static let goals = ["travel", "work", "school", "family", "exam", "fun"]
    public static let levels = ["new", "some", "confident"]
    public static let dailyMinutes = [5, 10, 15, 20]
    public static let interests = ["food", "travel", "sport", "music", "movies", "business", "tech", "nature", "art", "family"]
    public static let heardFrom = ["app_store", "search", "youtube", "social", "friend", "podcast"]
    public static let courses = ["en", "fr", "es"]

    /// ISO 639-1 codes for the "I speak" picker; names come from the system (Locale).
    public static let nativeLanguages = [
        "en", "es", "fr", "pt", "de", "it", "nl", "ar", "fa", "tr", "ru", "uk", "pl", "ro",
        "el", "he", "hi", "bn", "ur", "pa", "ta", "te", "mr", "gu", "zh", "ja", "ko", "vi",
        "th", "id", "ms", "tl", "sw", "am", "yo", "ha", "ig", "zu", "sv", "no", "da", "fi",
        "cs", "sk", "hu", "bg", "sr", "hr", "ca", "eu", "gl", "ku", "ps", "ne", "si", "km",
        "my", "so",
    ]

    /// ISO 3166-1 alpha-2, the same two letters profiles.country requires.
    public static let countries = [
        "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW",
        "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN",
        "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG",
        "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
        "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI",
        "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
        "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR",
        "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
        "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA",
        "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
        "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU",
        "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
        "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR",
        "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD",
        "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
        "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
        "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE",
        "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
    ]
}

/// The answers, on the device (the first-run draft) or read back from the account. Every field is optional; the
/// draft keeps whatever the learner has answered so far.
public struct LearnerAnswers: Codable, Equatable, Sendable {
    public var name: String?
    public var course: String?
    public var nativeLanguage: String?
    public var country: String?
    public var showFlag: Bool?
    public var goal: String?
    public var level: String?
    public var dailyMinutes: Int?
    public var ageRange: String?
    public var interests: [String]?
    public var heardFrom: String?
    /// "Explain in my language" (Settings): nil means never chosen, which behaves as tap to explain.
    public var explainMode: ExplainMode?

    public init(
        name: String? = nil, course: String? = nil, nativeLanguage: String? = nil, country: String? = nil,
        showFlag: Bool? = nil, goal: String? = nil, level: String? = nil, dailyMinutes: Int? = nil,
        ageRange: String? = nil, interests: [String]? = nil, heardFrom: String? = nil,
        explainMode: ExplainMode? = nil
    ) {
        self.name = name
        self.course = course
        self.nativeLanguage = nativeLanguage
        self.country = country
        self.showFlag = showFlag
        self.goal = goal
        self.level = level
        self.dailyMinutes = dailyMinutes
        self.ageRange = ageRange
        self.interests = interests
        self.heardFrom = heardFrom
        self.explainMode = explainMode
    }

    /// Field by field against the server's lists: a value off a list is dropped, the rest kept (parseLearnerProfile).
    /// `showFlag` is kept only when it was a boolean. Names are trimmed and 1 to 40 characters.
    public static func parse(_ raw: Any?) -> LearnerAnswers {
        let v = raw as? [String: Any] ?? [:]
        var out = LearnerAnswers()
        func pick(_ key: String, _ list: [String]) -> String? {
            guard let s = v[key] as? String, list.contains(s) else { return nil }
            return s
        }
        if let name = (v["name"] as? String).flatMap(cleanName) { out.name = name }
        out.course = pick("course", LearnerProfileLists.courses)
        out.nativeLanguage = pick("nativeLanguage", LearnerProfileLists.nativeLanguages)
        out.country = pick("country", LearnerProfileLists.countries)
        if let flag = v["showFlag"] as? Bool { out.showFlag = flag }
        out.goal = pick("goal", LearnerProfileLists.goals)
        out.level = pick("level", LearnerProfileLists.levels)
        if let minutes = v["dailyMinutes"] as? Int, LearnerProfileLists.dailyMinutes.contains(minutes) {
            out.dailyMinutes = minutes
        }
        out.ageRange = pick("ageRange", LearnerProfileLists.ageRanges)
        if let list = v["interests"] as? [Any] {
            out.interests = list.compactMap { $0 as? String }.filter { LearnerProfileLists.interests.contains($0) }
        }
        out.heardFrom = pick("heardFrom", LearnerProfileLists.heardFrom)
        // An unknown value is dropped (nil), exactly like the web's explainModeOf falling back to tap.
        if let raw = v["explainMode"] as? String { out.explainMode = ExplainMode(rawValue: raw) }
        return out
    }

    /// Trimmed, 1 to 40 characters, or nil (the server's nameSchema).
    public static func cleanName(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 40 else { return nil }
        return trimmed
    }

    /// The JSON patch the server accepts: only the keys that are set, so an unknown or empty one is never sent.
    public var jsonPatch: [String: Any] {
        var out: [String: Any] = [:]
        if let name { out["name"] = name }
        if let course { out["course"] = course }
        if let nativeLanguage { out["nativeLanguage"] = nativeLanguage }
        if let country { out["country"] = country }
        if let showFlag { out["showFlag"] = showFlag }
        if let goal { out["goal"] = goal }
        if let level { out["level"] = level }
        if let dailyMinutes { out["dailyMinutes"] = dailyMinutes }
        if let ageRange { out["ageRange"] = ageRange }
        if let interests { out["interests"] = interests }
        if let heardFrom { out["heardFrom"] = heardFrom }
        if let explainMode { out["explainMode"] = explainMode.rawValue }
        return out
    }

    /// What the screens use: the saved choice, or tap to explain when nothing is saved.
    public var effectiveExplainMode: ExplainMode { explainMode ?? .default }

    public var isEmpty: Bool { jsonPatch.isEmpty }
}

/// The answers on the account, with the one-time flow's marks.
public struct LearnerProfile: Equatable, Sendable {
    public var answers: LearnerAnswers
    public var completedAt: String?
    public var dismissedAt: String?

    public init(answers: LearnerAnswers = LearnerAnswers(), completedAt: String? = nil, dismissedAt: String? = nil) {
        self.answers = answers
        self.completedAt = completedAt
        self.dismissedAt = dismissedAt
    }

    public static func parse(_ raw: Any?) -> LearnerProfile {
        let v = raw as? [String: Any] ?? [:]
        var answers = LearnerAnswers.parse(v)
        // On the account the flag is a plain yes/no: anything but true is off (the web's showFlag: v.showFlag === true).
        answers.showFlag = (v["showFlag"] as? Bool) == true
        func time(_ key: String) -> String? {
            guard let s = v[key] as? String, s.count <= 40, ISO8601DateFormatter.lenient(s) != nil else { return nil }
            return s
        }
        return LearnerProfile(answers: answers, completedAt: time("completedAt"), dismissedAt: time("dismissedAt"))
    }

    /// "Complete your profile" shows once: until the learner finishes it or says Not now.
    public var needsCompleteProfile: Bool { completedAt == nil && dismissedAt == nil }
}

extension ISO8601DateFormatter {
    /// With or without fractional seconds, the two shapes the server writes.
    static func lenient(_ s: String) -> Date? {
        let plain = ISO8601DateFormatter()
        if let d = plain.date(from: s) { return d }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: s)
    }
}
