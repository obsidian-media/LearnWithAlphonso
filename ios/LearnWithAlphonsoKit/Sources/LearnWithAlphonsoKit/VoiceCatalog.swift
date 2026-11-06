import Foundation

/// Mirror of src/lib/voice-catalog.ts: the Deepgram Aura-2 voices a learner may choose for Alphonso and for Hector,
/// per course, and each character's default. The server re-checks every voice against its own copy, so this list
/// only decides what the Settings picker offers. src/lib/voice-catalog-parity.test.ts fails when the two drift.
public enum VoiceCharacter: String, CaseIterable, Sendable, Identifiable {
    case alphonso
    case hector
    public var id: String { rawValue }
    public var settingsLabel: String {
        switch self {
        case .alphonso: return "Alphonso's voice"
        case .hector: return "Hector's voice"
        }
    }
}

public enum VoiceGender: String, CaseIterable, Sendable {
    case male
    case female
    public var groupLabel: String { self == .male ? "Male" : "Female" }
}

public struct VoiceOption: Equatable, Sendable, Identifiable {
    public let id: String
    public let course: String
    public let name: String
    public let gender: VoiceGender
    public let accent: String
    public let descriptor: String

    public init(id: String, course: String, name: String, gender: VoiceGender, accent: String, descriptor: String) {
        self.id = id
        self.course = course
        self.name = name
        self.gender = gender
        self.accent = accent
        self.descriptor = descriptor
    }
}

public enum VoiceCatalog {
    public static let courses = ["en", "fr", "es"]

    /// Defaults per character and course (owner, 2026-11-06). Keep in step with DEFAULT_VOICES on the web.
    public static let defaults: [VoiceCharacter: [String: String]] = [
        .alphonso: ["en": "aura-2-saturn-en", "es": "aura-2-javier-es", "fr": "aura-2-hector-fr"],
        .hector: ["en": "aura-2-hermes-en", "es": "aura-2-alvaro-es", "fr": "aura-2-hector-fr"],
    ]

    public static let all: [VoiceOption] = [
        VoiceOption(id: "aura-2-andromeda-en", course: "en", name: "Andromeda", gender: .female, accent: "American", descriptor: "Casual, expressive"),
        VoiceOption(id: "aura-2-apollo-en", course: "en", name: "Apollo", gender: .male, accent: "American", descriptor: "Confident, comfortable"),
        VoiceOption(id: "aura-2-arcas-en", course: "en", name: "Arcas", gender: .male, accent: "American", descriptor: "Natural, smooth"),
        VoiceOption(id: "aura-2-aries-en", course: "en", name: "Aries", gender: .male, accent: "American", descriptor: "Warm, energetic"),
        VoiceOption(id: "aura-2-asteria-en", course: "en", name: "Asteria", gender: .female, accent: "American", descriptor: "Clear, confident"),
        VoiceOption(id: "aura-2-athena-en", course: "en", name: "Athena", gender: .female, accent: "American", descriptor: "Calm, smooth"),
        VoiceOption(id: "aura-2-atlas-en", course: "en", name: "Atlas", gender: .male, accent: "American", descriptor: "Enthusiastic, confident"),
        VoiceOption(id: "aura-2-aurora-en", course: "en", name: "Aurora", gender: .female, accent: "American", descriptor: "Cheerful, expressive"),
        VoiceOption(id: "aura-2-callista-en", course: "en", name: "Callista", gender: .female, accent: "American", descriptor: "Clear, energetic"),
        VoiceOption(id: "aura-2-cora-en", course: "en", name: "Cora", gender: .female, accent: "American", descriptor: "Smooth, melodic"),
        VoiceOption(id: "aura-2-cordelia-en", course: "en", name: "Cordelia", gender: .female, accent: "American", descriptor: "Approachable, warm"),
        VoiceOption(id: "aura-2-delia-en", course: "en", name: "Delia", gender: .female, accent: "American", descriptor: "Casual, friendly"),
        VoiceOption(id: "aura-2-draco-en", course: "en", name: "Draco", gender: .male, accent: "British", descriptor: "Warm, approachable"),
        VoiceOption(id: "aura-2-electra-en", course: "en", name: "Electra", gender: .female, accent: "American", descriptor: "Professional, engaging"),
        VoiceOption(id: "aura-2-helena-en", course: "en", name: "Helena", gender: .female, accent: "American", descriptor: "Caring, natural"),
        VoiceOption(id: "aura-2-hera-en", course: "en", name: "Hera", gender: .female, accent: "American", descriptor: "Smooth, warm"),
        VoiceOption(id: "aura-2-hermes-en", course: "en", name: "Hermes", gender: .male, accent: "American", descriptor: "Expressive, engaging"),
        VoiceOption(id: "aura-2-hyperion-en", course: "en", name: "Hyperion", gender: .male, accent: "Australian", descriptor: "Caring, warm"),
        VoiceOption(id: "aura-2-iris-en", course: "en", name: "Iris", gender: .female, accent: "American", descriptor: "Cheerful, positive"),
        VoiceOption(id: "aura-2-juno-en", course: "en", name: "Juno", gender: .female, accent: "American", descriptor: "Natural, engaging"),
        VoiceOption(id: "aura-2-jupiter-en", course: "en", name: "Jupiter", gender: .male, accent: "American", descriptor: "Expressive, knowledgeable"),
        VoiceOption(id: "aura-2-luna-en", course: "en", name: "Luna", gender: .female, accent: "American", descriptor: "Friendly, natural"),
        VoiceOption(id: "aura-2-mars-en", course: "en", name: "Mars", gender: .male, accent: "American", descriptor: "Smooth, patient"),
        VoiceOption(id: "aura-2-neptune-en", course: "en", name: "Neptune", gender: .male, accent: "American", descriptor: "Professional, patient"),
        VoiceOption(id: "aura-2-orpheus-en", course: "en", name: "Orpheus", gender: .male, accent: "American", descriptor: "Professional, clear"),
        VoiceOption(id: "aura-2-pandora-en", course: "en", name: "Pandora", gender: .female, accent: "British", descriptor: "Smooth, calm"),
        VoiceOption(id: "aura-2-phoebe-en", course: "en", name: "Phoebe", gender: .female, accent: "American", descriptor: "Energetic, warm"),
        VoiceOption(id: "aura-2-pluto-en", course: "en", name: "Pluto", gender: .male, accent: "American", descriptor: "Smooth, calm"),
        VoiceOption(id: "aura-2-saturn-en", course: "en", name: "Saturn", gender: .male, accent: "American", descriptor: "Knowledgeable, confident"),
        VoiceOption(id: "aura-2-selene-en", course: "en", name: "Selene", gender: .female, accent: "American", descriptor: "Expressive, engaging"),
        VoiceOption(id: "aura-2-thalia-en", course: "en", name: "Thalia", gender: .female, accent: "American", descriptor: "Clear, confident"),
        VoiceOption(id: "aura-2-vesta-en", course: "en", name: "Vesta", gender: .female, accent: "American", descriptor: "Natural, expressive"),
        VoiceOption(id: "aura-2-agustina-es", course: "es", name: "Agustina", gender: .female, accent: "Spain", descriptor: "Calm, clear"),
        VoiceOption(id: "aura-2-alvaro-es", course: "es", name: "Alvaro", gender: .male, accent: "Spain", descriptor: "Calm, professional"),
        VoiceOption(id: "aura-2-antonia-es", course: "es", name: "Antonia", gender: .female, accent: "Argentine", descriptor: "Approachable, enthusiastic"),
        VoiceOption(id: "aura-2-aquila-es", course: "es", name: "Aquila", gender: .male, accent: "Latin American", descriptor: "Casual, comfortable"),
        VoiceOption(id: "aura-2-carina-es", course: "es", name: "Carina", gender: .female, accent: "Spain", descriptor: "Professional, raspy"),
        VoiceOption(id: "aura-2-celeste-es", course: "es", name: "Celeste", gender: .female, accent: "Colombian", descriptor: "Clear, energetic"),
        VoiceOption(id: "aura-2-diana-es", course: "es", name: "Diana", gender: .female, accent: "Spain", descriptor: "Professional, confident"),
        VoiceOption(id: "aura-2-gloria-es", course: "es", name: "Gloria", gender: .female, accent: "Colombian", descriptor: "Casual, clear"),
        VoiceOption(id: "aura-2-javier-es", course: "es", name: "Javier", gender: .male, accent: "Latin American", descriptor: "Approachable, calm"),
        VoiceOption(id: "aura-2-nestor-es", course: "es", name: "Nestor", gender: .male, accent: "Spain", descriptor: "Calm, professional"),
        VoiceOption(id: "aura-2-olivia-es", course: "es", name: "Olivia", gender: .female, accent: "Mexican", descriptor: "Breathy, calm"),
        VoiceOption(id: "aura-2-selena-es", course: "es", name: "Selena", gender: .female, accent: "Latin American", descriptor: "Approachable, calm"),
        VoiceOption(id: "aura-2-silvia-es", course: "es", name: "Silvia", gender: .female, accent: "Spain", descriptor: "Charismatic, clear"),
        VoiceOption(id: "aura-2-sirio-es", course: "es", name: "Sirio", gender: .male, accent: "Mexican", descriptor: "Breathy, confident"),
        VoiceOption(id: "aura-2-valerio-es", course: "es", name: "Valerio", gender: .male, accent: "Mexican", descriptor: "Deep, knowledgeable"),
        VoiceOption(id: "aura-2-agathe-fr", course: "fr", name: "Agathe", gender: .female, accent: "French", descriptor: "Charismatic, cheerful"),
        VoiceOption(id: "aura-2-hector-fr", course: "fr", name: "Hector", gender: .male, accent: "French", descriptor: "Confident, empathetic"),
    ]

    public static func voices(for course: String) -> [VoiceOption] {
        all.filter { $0.course == course }
    }

    public static func find(_ id: String) -> VoiceOption? {
        all.first { $0.id == id }
    }

    public static func isAllowed(_ id: String?, course: String) -> Bool {
        guard let id else { return false }
        return all.contains { $0.id == id && $0.course == course }
    }

    public static func defaultVoice(_ character: VoiceCharacter, course: String) -> String {
        defaults[character]?[course] ?? defaults[character]?["en"] ?? "aura-2-saturn-en"
    }

    /// The static preview clip the web app serves (public/voices/). Previews never call TTS.
    public static func previewURL(for id: String, base: URL) -> URL {
        base.appendingPathComponent("voices").appendingPathComponent("\(id).mp3")
    }
}

/// The learner's choices, per character and course, as stored on the account in auth `user_metadata.voices`
/// (`{"alphonso": {"en": "aura-2-..."}, "hector": {...}}`). Missing entries mean "the default".
public struct VoicePrefs: Equatable, Sendable {
    public static let metadataKey = "voices"

    public private(set) var choices: [VoiceCharacter: [String: String]]

    public init(choices: [VoiceCharacter: [String: String]] = [:]) {
        self.choices = [:]
        for (character, perCourse) in choices {
            for (course, id) in perCourse where VoiceCatalog.isAllowed(id, course: course) {
                self.choices[character, default: [:]][course] = id
            }
        }
    }

    /// Reads untrusted JSON (the metadata value), keeping only allow-listed voices for the right course.
    public init(json: Any?) {
        var parsed: [VoiceCharacter: [String: String]] = [:]
        if let object = json as? [String: Any] {
            for character in VoiceCharacter.allCases {
                guard let perCourse = object[character.rawValue] as? [String: Any] else { continue }
                for (course, value) in perCourse {
                    if let id = value as? String { parsed[character, default: [:]][course] = id }
                }
            }
        }
        self.init(choices: parsed)
    }

    public func voice(_ character: VoiceCharacter, course: String) -> String {
        if let id = choices[character]?[course], VoiceCatalog.isAllowed(id, course: course) { return id }
        return VoiceCatalog.defaultVoice(character, course: course)
    }

    /// Choosing the default removes the entry; a voice off the list changes nothing.
    public func with(_ character: VoiceCharacter, course: String, voice id: String) -> VoicePrefs {
        guard VoiceCatalog.isAllowed(id, course: course) else { return self }
        var next = self
        if id == VoiceCatalog.defaultVoice(character, course: course) {
            next.choices[character]?[course] = nil
            if next.choices[character]?.isEmpty == true { next.choices[character] = nil }
        } else {
            next.choices[character, default: [:]][course] = id
        }
        return next
    }

    /// The JSON value saved under `user_metadata.voices`; both characters are always present.
    public var jsonObject: [String: Any] {
        var object: [String: Any] = [:]
        for character in VoiceCharacter.allCases {
            object[character.rawValue] = choices[character] ?? [:]
        }
        return object
    }
}

/// The device's cached copy of the account's choices, so a call picks its voice without waiting on the network.
/// Account-scoped: AccountCacheKeys lists its key, so sign-out clears it.
public struct VoicePrefsCache {
    public static let key = "voicePrefs.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func load() -> VoicePrefs {
        guard let data = defaults.data(forKey: Self.key),
              let object = try? JSONSerialization.jsonObject(with: data) else { return VoicePrefs() }
        return VoicePrefs(json: object)
    }

    public func save(_ prefs: VoicePrefs) {
        if let data = try? JSONSerialization.data(withJSONObject: prefs.jsonObject, options: [.sortedKeys]) {
            defaults.set(data, forKey: Self.key)
        }
    }

    public func voice(_ character: VoiceCharacter, course: String) -> String {
        load().voice(character, course: course)
    }
}
