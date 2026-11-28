import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Rehearsals: the learner prepares one real upcoming conversation (an interview, a meeting, a landlord) in three
// short stages. The server owns everything that matters (who may start one, the free rehearsal, the stored brief, the
// memory of earlier runs); this file reads its answers and holds the pure rules the screens share. It mirrors
// src/lib/rehearsal-api.ts, rehearsal-rules.ts and rehearsal-copy.ts, and the shared contract is
// tests/fixtures/rehearsal-api.json (a byte-for-byte copy sits in this package's test Fixtures, guarded by
// src/lib/rehearsal-native-fixtures.test.ts). There is no score, no star and no readiness number anywhere in it.

// MARK: - Vocabulary

public enum RehearsalEventKind: String, CaseIterable, Sendable, Equatable {
    case interview, meeting, presentation, appointment, housing
    case firstDay = "first_day"
    case other

    public var label: String {
        switch self {
        case .interview: return "Job interview"
        case .meeting: return "Work meeting"
        case .presentation: return "Presentation"
        case .appointment: return "Appointment"
        case .housing: return "Landlord or housing"
        case .firstDay: return "First day at work"
        case .other: return "Something else"
        }
    }

    /// The example in the "Who will you be talking to?" field.
    public var counterpartPlaceholder: String {
        switch self {
        case .interview: return "e.g. a hiring manager at a hospital"
        case .meeting: return "e.g. my team lead and two colleagues"
        case .presentation: return "e.g. a small group of coworkers"
        case .appointment: return "e.g. a receptionist at a bank"
        case .housing: return "e.g. a landlord showing a flat"
        case .firstDay: return "e.g. my new manager and the team"
        case .other: return "e.g. the person I need to speak to"
        }
    }

    /// The event as a short noun ("That was a full interview").
    public var shortNoun: String {
        switch self {
        case .interview: return "interview"
        case .meeting: return "meeting"
        case .presentation: return "presentation"
        case .appointment: return "appointment"
        case .housing: return "meeting with the landlord"
        case .firstDay: return "first day"
        case .other: return "conversation"
        }
    }

    /// The call's title ("Interview rehearsal").
    public var callTitle: String {
        switch self {
        case .interview: return "Interview rehearsal"
        case .meeting: return "Meeting rehearsal"
        case .presentation: return "Presentation rehearsal"
        case .appointment: return "Appointment rehearsal"
        case .housing: return "Housing rehearsal"
        case .firstDay: return "First day rehearsal"
        case .other: return "Rehearsal"
        }
    }

    /// The wire value from a server answer; nil for a kind this build does not know.
    public init?(wire: String) { self.init(rawValue: wire) }
}

public enum RehearsalStage: String, CaseIterable, Sendable, Equatable {
    case warmup
    case conversation
    case hardMoments = "hard_moments"

    public var label: String {
        switch self {
        case .warmup: return "Warm-up"
        case .conversation: return "The real conversation"
        case .hardMoments: return "The hard moments"
        }
    }

    public var blurb: String {
        switch self {
        case .warmup: return "The key phrases, in short exchanges."
        case .conversation: return "The whole conversation, start to finish."
        case .hardMoments: return "The tough question, a misunderstanding, being interrupted."
        }
    }

    /// About how long one run takes, in minutes.
    public var minutes: Int {
        switch self {
        case .warmup: return 5
        case .conversation: return 10
        case .hardMoments: return 8
        }
    }

    /// 1, 2 or 3: "Stage 2 of 3".
    public var number: Int { (Self.allCases.firstIndex(of: self) ?? 0) + 1 }

    /// The fixed line the call opens with (REHEARSAL_OPENERS in src/data/rehearsal-templates.ts). It is a prompt to the
    /// learner, never sent to the server as something the partner said.
    public func opener(course: String) -> String {
        let table: [String: [RehearsalStage: String]] = [
            "en": [
                .warmup: "Let's warm up. Say hello and tell me what you are getting ready for.",
                .conversation: "Start whenever you are ready. Greet me the way you would on the day.",
                .hardMoments: "Let's practise the tricky moments. Start with a greeting and I will take it from there.",
            ],
            "fr": [
                .warmup: "Échauffons-nous. Dis bonjour et explique-moi pour quoi tu te prépares.",
                .conversation: "Commencez quand vous voulez. Saluez-moi comme vous le feriez le jour J.",
                .hardMoments: "Travaillons les moments délicats. Commencez par une salutation, je m'occupe du reste.",
            ],
            "es": [
                .warmup: "Vamos a calentar. Saluda y cuéntame para qué te estás preparando.",
                .conversation: "Empiece cuando quiera. Salúdeme como lo haría el día de la cita.",
                .hardMoments: "Practiquemos los momentos difíciles. Empiece con un saludo y yo sigo.",
            ],
        ]
        return (table[course] ?? table["en"]!)[self] ?? ""
    }
}

/// How long a text answer may be: the learner's own words stay short.
public let rehearsalIntakeTextMax = 200

// MARK: - What the server answers

public struct RehearsalBrief: Decodable, Equatable, Sendable {
    public let setting: String?
}

public struct Rehearsal: Decodable, Equatable, Sendable {
    public let id: String
    public let course: String
    public let eventKind: String
    /// YYYY-MM-DD, or nil for "not sure yet".
    public let eventDate: String?
    public let counterpart: String
    public let worries: String?
    public let brief: RehearsalBrief?
    /// "active", "done" or "cancelled".
    public let status: String
    public let free: Bool
    public let createdAt: String
    public let closedAt: String?

    public var kind: RehearsalEventKind? { RehearsalEventKind(wire: eventKind) }
    /// The event's name for headings; an event kind this build does not know reads as the generic one.
    public var eventLabel: String { kind?.label ?? RehearsalEventKind.other.label }
}

/// A closed rehearsal in the history list: no brief, no words of the learner's.
public struct RehearsalSummary: Decodable, Equatable, Sendable {
    public let id: String
    public let course: String
    public let eventKind: String
    public let eventDate: String?
    public let status: String
    public let free: Bool
    public let createdAt: String
    public let closedAt: String?
    public let runs: Int
    public let stagesDone: Int
    public let corrections: Int

    public var kind: RehearsalEventKind? { RehearsalEventKind(wire: eventKind) }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        course = try c.decode(String.self, forKey: .course)
        eventKind = try c.decode(String.self, forKey: .eventKind)
        eventDate = try c.decodeIfPresent(String.self, forKey: .eventDate)
        status = try c.decode(String.self, forKey: .status)
        free = try c.decode(Bool.self, forKey: .free)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        closedAt = try c.decodeIfPresent(String.self, forKey: .closedAt)
        // An older server has no counts: they read as zero.
        runs = try c.decodeIfPresent(Int.self, forKey: .runs) ?? 0
        stagesDone = try c.decodeIfPresent(Int.self, forKey: .stagesDone) ?? 0
        corrections = try c.decodeIfPresent(Int.self, forKey: .corrections) ?? 0
    }

    private enum Keys: String, CodingKey {
        case id, course, eventKind, eventDate, status, free, createdAt, closedAt, runs, stagesDone, corrections
    }
}

/// What one finished run taught the tutor: moment labels and corrected forms only, never the learner's own words.
public struct RehearsalRun: Decodable, Equatable, Sendable {
    public let stage: String
    public let finishedAt: String
    public let momentsShown: [String]
    public let wentWell: [String]
    public let corrections: [String]
    /// Who played the partner and whether it was hard mode. A run from before Hector rehearsals has neither: Alphonso,
    /// not hard.
    public let persona: String?
    public let hardMode: Bool?

    public var rehearsalStage: RehearsalStage? { RehearsalStage(rawValue: stage) }
    public var isHardMode: Bool { hardMode == true }
    public var rehearsalPersona: RehearsalPersona { persona.flatMap(RehearsalPersona.init(rawValue:)) ?? .alphonso }
}

public struct RehearsalProgress: Decodable, Equatable, Sendable {
    public let warmup: String
    public let conversation: String
    public let hardMoments: String

    private enum CodingKeys: String, CodingKey {
        case warmup, conversation
        case hardMoments = "hard_moments"
    }

    public func isDone(_ stage: RehearsalStage) -> Bool {
        switch stage {
        case .warmup: return warmup == "done"
        case .conversation: return conversation == "done"
        case .hardMoments: return hardMoments == "done"
        }
    }

    public var doneCount: Int { RehearsalStage.allCases.filter(isDone).count }
}

public struct RehearsalState: Decodable, Equatable, Sendable {
    public let active: Rehearsal?
    public let progress: RehearsalProgress?
    public let nextStageWire: String?
    /// The active rehearsal's finished runs, oldest first.
    public let runs: [RehearsalRun]
    public let history: [RehearsalSummary]
    /// True while the account's one free rehearsal has not been used.
    public let freeAvailable: Bool
    /// Hector (Pro): true is Pro, false is not Pro, nil is "could not tell" (the run's own start decides). An older
    /// server omits it: nil.
    public let hectorAvailable: Bool?
    /// The active rehearsal has a finished hard-mode run ("Hard mode done"). An older server omits it: false.
    public let hardModeDone: Bool

    public var nextStage: RehearsalStage? { nextStageWire.flatMap { RehearsalStage(rawValue: $0) } }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        active = try c.decodeIfPresent(Rehearsal.self, forKey: .active)
        progress = try c.decodeIfPresent(RehearsalProgress.self, forKey: .progress)
        nextStageWire = try c.decodeIfPresent(String.self, forKey: .nextStage)
        // An older server's answer has no runs: an empty list, never an error.
        runs = try c.decodeIfPresent([RehearsalRun].self, forKey: .runs) ?? []
        history = try c.decode([RehearsalSummary].self, forKey: .history)
        freeAvailable = try c.decode(Bool.self, forKey: .freeAvailable)
        // `try?` on purpose: a wrong type is "unknown" / false, never a state the screens cannot read.
        hectorAvailable = (try? c.decodeIfPresent(Bool.self, forKey: .hectorAvailable)) ?? nil
        hardModeDone = ((try? c.decodeIfPresent(Bool.self, forKey: .hardModeDone)) ?? nil) ?? false
    }

    private enum Keys: String, CodingKey {
        case active, progress, nextStage, runs, history, freeAvailable, hectorAvailable, hardModeDone
    }
}

public enum RehearsalDecoding {
    /// Checks the shape the screens read: `active` present (it may be null), `history` a list, `freeAvailable` a
    /// boolean. Anything else is nil, never a half-read state.
    public static func state(from data: Data) -> RehearsalState? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object.keys.contains("active"), object["history"] is [Any],
              object["freeAvailable"] is Bool
        else { return nil }
        return try? JSONDecoder().decode(RehearsalState.self, from: data)
    }

    /// `{ rehearsal }` from create, adjust, cancel and outcome.
    public static func rehearsal(from data: Data) -> Rehearsal? {
        struct Wrapper: Decodable { let rehearsal: Rehearsal }
        return (try? JSONDecoder().decode(Wrapper.self, from: data))?.rehearsal
    }

    /// `{ presets: [...] }` from `GET /api/rehearsal-presets`, in server order. A preset that cannot be read (no id or
    /// no title) is dropped; an answer with no `presets` list is nil, never a half-read list.
    public static func presets(from data: Data) -> [RehearsalPreset]? {
        struct Wrapper: Decodable { let presets: [LossyBox<RehearsalPreset>] }
        guard let wrapper = try? JSONDecoder().decode(Wrapper.self, from: data) else { return nil }
        return wrapper.presets.compactMap(\.value)
    }

    /// `features.rehearsals` in an `/api/app-config` answer. Missing, malformed or false is off.
    public static func rehearsalsEnabled(inAppConfig data: Data) -> Bool {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = object["features"] as? [String: Any],
              let on = features["rehearsals"] as? Bool else { return false }
        return on
    }
}

// MARK: - Quick-starts (presets)

/// One stage of a quick-start: the server's key (`warmup`, `conversation`, `hard_moments`) and its goal line.
public struct RehearsalPresetStage: Decodable, Equatable, Sendable {
    public let key: String
    public let goal: String

    public var stage: RehearsalStage? { RehearsalStage(rawValue: key) }
}

public struct RehearsalKeyPhrase: Decodable, Equatable, Sendable {
    public let text: String
    public let meaning: String?
}

/// One quick-start card as `GET /api/rehearsal-presets` sends it. The app holds none of this text: the server owns the
/// ids, the titles, the blurbs and the phrases. Unknown fields are ignored.
public struct RehearsalPreset: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let eventKind: String
    public let title: String
    public let blurb: String
    public let counterpart: String
    public let stages: [RehearsalPresetStage]
    public let keyPhrases: [RehearsalKeyPhrase]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        eventKind = try c.decodeIfPresent(String.self, forKey: .eventKind) ?? "other"
        title = try c.decode(String.self, forKey: .title)
        blurb = try c.decodeIfPresent(String.self, forKey: .blurb) ?? ""
        counterpart = try c.decodeIfPresent(String.self, forKey: .counterpart) ?? ""
        stages = (try? c.decode([LossyBox<RehearsalPresetStage>].self, forKey: .stages))?.compactMap(\.value) ?? []
        keyPhrases = (try? c.decode([LossyBox<RehearsalKeyPhrase>].self, forKey: .keyPhrases))?.compactMap(\.value) ?? []
    }

    private enum Keys: String, CodingKey { case id, eventKind, title, blurb, counterpart, stages, keyPhrases }

    /// "Talking to: a hiring manager".
    public var counterpartLine: String { "Talking to: \(counterpart)" }
}

/// One bad element in a list becomes nil instead of failing the whole list.
private struct LossyBox<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

public enum RehearsalPresetCopy {
    public static let title = "What is coming up?"
    public static let subtitle = "Pick one to start right away, or describe your own."
    public static let somethingElse = "Something else"
    public static let somethingElseHint = "Tell Alphonso about your own conversation"
    public static let addDate = "Add a date"
    public static let removeDate = "Remove the date"
    public static let startNow = "Start now"
    public static let personalise = "Personalise"
    public static let personaliseHint = "Change who you will talk to and what worries you"
    public static let loadFailed = "We could not load the quick-starts."
    public static let retry = "Try again"
}

// MARK: - Errors

/// What a refused request means to the learner; the screens turn each into words.
public enum RehearsalError: String, Error, Equatable, Sendable {
    case paywall, retry
    case blockedText = "blocked_text"
    case activeExists = "active_exists"
    case closed
    case notFound = "not_found"
    case notEnabled = "not_enabled"
    case invalid, consent, failed
    case invalidPreset = "invalid_preset"

    /// The same mapping the web's errorOf makes, from the status and the body's `error` code.
    public static func from(status: Int, code: String?) -> RehearsalError {
        switch status {
        case 402: return .paywall
        case 503: return .retry
        case 409: return code == "closed" ? .closed : .activeExists
        case 404: return code == "not_enabled" ? .notEnabled : .notFound
        case 403: return .consent
        case 400:
            if code == "blocked_text" { return .blockedText }
            return code == "invalid_preset" ? .invalidPreset : .invalid
        default: return .failed
        }
    }

    public var userMessage: String {
        switch self {
        case .paywall:
            return "You have used your free rehearsal. More rehearsals are part of Alphonso Pro, and your first one stays here to look back on."
        case .retry: return "We could not check your plan just now. Please try again in a moment."
        case .blockedText: return "Some of those words can't be used here. Please rephrase and try again."
        case .activeExists: return "You already have a rehearsal going for this course."
        case .closed: return "This rehearsal is already finished."
        case .notFound: return "We could not find that rehearsal."
        case .notEnabled: return "Rehearsals are not available yet."
        case .invalid: return "Please check your answers and try again."
        case .invalidPreset: return "That quick-start is not available any more. Pick another, or choose Something else."
        case .consent: return "Turn on AI features to prepare a rehearsal."
        case .failed: return "Something went wrong. Please try again."
        }
    }
}

// MARK: - Intake

/// The four intake answers as a request carries them.
public struct RehearsalIntake: Equatable, Sendable {
    public let course: String
    public let eventKind: RehearsalEventKind
    /// YYYY-MM-DD, or nil for "not sure yet".
    public let eventDate: String?
    public let counterpart: String
    public let worries: String?

    var body: [String: Any] {
        [
            "course": course,
            "eventKind": eventKind.rawValue,
            "eventDate": eventDate.map { $0 as Any } ?? NSNull(),
            "counterpart": counterpart,
            "worries": worries.map { $0 as Any } ?? NSNull(),
        ]
    }
}

/// The learner's answers while they are still typing them, and the rules that decide what may go on.
public struct RehearsalIntakeDraft: Equatable, Sendable {
    public var kind: RehearsalEventKind?
    /// YYYY-MM-DD; nil is "not sure yet" (the date is optional).
    public var eventDate: String?
    public var counterpart = ""
    public var worries = ""

    public init(kind: RehearsalEventKind? = nil, eventDate: String? = nil, counterpart: String = "", worries: String = "") {
        self.kind = kind
        self.eventDate = eventDate
        self.counterpart = counterpart
        self.worries = worries
    }

    public enum Issue: Error, Equatable, Sendable {
        case kindMissing, dateInvalid, counterpartMissing, counterpartTooLong, worriesTooLong
    }

    public static let stepCount = 4

    /// May the learner go on from this step (1...4)? Step 1 needs a kind; 2 is always fine unless the date is
    /// malformed; 3 needs the counterpart; 4 (the optional one) only needs the worries to fit.
    public func canContinue(step: Int) -> Bool {
        switch step {
        case 1: return kind != nil
        case 2: return eventDate == nil || RehearsalDates.isCalendarDate(eventDate!)
        case 3:
            let n = counterpart.trimmingCharacters(in: .whitespacesAndNewlines).count
            return n >= 1 && n <= rehearsalIntakeTextMax
        case 4: return worries.trimmingCharacters(in: .whitespacesAndNewlines).count <= rehearsalIntakeTextMax
        default: return false
        }
    }

    /// Checks and trims the answers the way the server's validateIntake does. The date is optional; the worries are
    /// optional and an empty one is nil.
    public func validate(course: String) -> Result<RehearsalIntake, Issue> {
        guard let kind else { return .failure(.kindMissing) }
        if let eventDate, !RehearsalDates.isCalendarDate(eventDate) { return .failure(.dateInvalid) }
        let who = counterpart.trimmingCharacters(in: .whitespacesAndNewlines)
        if who.isEmpty { return .failure(.counterpartMissing) }
        if who.count > rehearsalIntakeTextMax { return .failure(.counterpartTooLong) }
        let w = worries.trimmingCharacters(in: .whitespacesAndNewlines)
        if w.count > rehearsalIntakeTextMax { return .failure(.worriesTooLong) }
        return .success(RehearsalIntake(
            course: course, eventKind: kind, eventDate: eventDate, counterpart: who, worries: w.isEmpty ? nil : w))
    }

    public var counterpartPlaceholder: String {
        kind?.counterpartPlaceholder ?? "e.g. a hiring manager at a hospital"
    }
}

public enum RehearsalIntakeCopy {
    public static let noNames = "No need for real names. Say \u{201C}my manager\u{201D} or \u{201C}the landlord\u{201D}. What you write here is only used to build your rehearsal, and you can delete it any time."
    public static func stepLabel(_ step: Int) -> String { "Step \(step) of \(RehearsalIntakeDraft.stepCount)" }
    public static let titles = ["What is coming up?", "When is it?", "Who will you be talking to?", "What worries you most?"]
    public static let notSureYet = "Not sure yet"
    public static let notSureNote = "If you are not sure, the plan still works. Alphonso offers a stage every other day."
    public static let worriesNote = "Optional. Up to 200 characters."
    public static let worriesExample = "For example: a type of question, understanding fast speech, your accent."
    public static let makePlan = "Make my plan"
}

// MARK: - Dates

/// Calendar days as YYYY-MM-DD strings, worked out in plain Gregorian arithmetic: the same day on every device and in
/// every time zone, so a test never depends on the machine's.
public enum RehearsalDates {
    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private static var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private static func parts(_ s: String) -> (y: Int, m: Int, d: Int)? {
        let bits = s.split(separator: "-", omittingEmptySubsequences: false)
        guard bits.count == 3, bits[0].count == 4, bits[1].count == 2, bits[2].count == 2,
              let y = Int(bits[0]), let m = Int(bits[1]), let d = Int(bits[2]) else { return nil }
        return (y, m, d)
    }

    private static func date(_ s: String) -> Date? {
        guard let p = parts(s) else { return nil }
        guard let made = utc.date(from: DateComponents(year: p.y, month: p.m, day: p.d, hour: 12)) else { return nil }
        let back = utc.dateComponents([.year, .month, .day], from: made)
        return back.year == p.y && back.month == p.m && back.day == p.d ? made : nil
    }

    /// True for a real calendar day written YYYY-MM-DD ("2026-02-30" is not).
    public static func isCalendarDate(_ s: String) -> Bool { date(s) != nil }

    /// The learner's local calendar day, YYYY-MM-DD.
    public static func string(from date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    /// A noon on that local day, for a date picker's value.
    public static func noon(of s: String, calendar: Calendar = .current) -> Date? {
        guard let p = parts(s), isCalendarDate(s) else { return nil }
        return calendar.date(from: DateComponents(year: p.y, month: p.m, day: p.d, hour: 12))
    }

    /// Whole days from `today` to `eventDate` (negative once past); nil when either is not a date.
    public static func daysToGo(eventDate: String, today: String) -> Int? {
        guard let a = date(today), let b = date(eventDate) else { return nil }
        return utc.dateComponents([.day], from: a, to: b).day
    }

    /// "Tue 1 Dec".
    public static func short(_ s: String) -> String? {
        guard let d = date(s), let p = parts(s) else { return nil }
        let weekday = weekdays[utc.component(.weekday, from: d) - 1]
        return "\(weekday) \(p.d) \(months[p.m - 1])"
    }

    /// "1 Dec", for "Move my rehearsal to 1 Dec".
    public static func dayMonth(_ s: String) -> String? {
        guard let p = parts(s), isCalendarDate(s) else { return nil }
        return "\(p.d) \(months[p.m - 1])"
    }

    /// "5 days to go", as the web's daysToGoText says it.
    public static func daysToGoText(eventDate: String, today: String) -> String {
        guard let n = daysToGo(eventDate: eventDate, today: today) else { return "" }
        switch n {
        case 0: return "Today"
        case 1: return "1 day to go"
        case 2...: return "\(n) days to go"
        case -1: return "It was yesterday"
        default: return "\(-n) days ago"
        }
    }

    /// "Wednesday 2 December", for "How did it go?".
    public static func long(_ s: String) -> String? {
        guard let d = date(s), let p = parts(s) else { return nil }
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let full = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        return "\(names[utc.component(.weekday, from: d) - 1]) \(p.d) \(full[p.m - 1])"
    }

    /// "Tue 1 Dec \u{00B7} 5 days to go"; no date reads "Date not set yet".
    public static func line(eventDate: String?, today: String) -> String {
        guard let eventDate, let shortText = Self.short(eventDate) else { return "Date not set yet" }
        let words = daysToGoText(eventDate: eventDate, today: today)
        return words.isEmpty ? shortText : "\(shortText) \u{00B7} \(words)"
    }
}

// MARK: - The plan

public enum RehearsalPlan {
    public enum StageRow: Equatable, Sendable {
        /// "Done · you can repeat it", with a quiet Repeat.
        case done
        /// The one to do next: a primary "Next".
        case next
        /// Not yet: a quiet "Start".
        case todo
    }

    /// The three rows of the plan screen: done stages are done, the server's next stage is next, the rest are todo.
    public static func rows(progress: RehearsalProgress?, nextStage: RehearsalStage?) -> [(stage: RehearsalStage, row: StageRow)] {
        RehearsalStage.allCases.map { stage in
            if progress?.isDone(stage) == true { return (stage, .done) }
            if stage == nextStage { return (stage, .next) }
            return (stage, .todo)
        }
    }

    /// The stage after a run: the first one with no finished run, else the weakest (the most corrections in its latest
    /// run, a tie going to the earlier stage). Independent of the order `runs` is given in.
    public static func nextStage(runs: [RehearsalRun]) -> RehearsalStage {
        // A hard-mode run is its own thing: it never marks a stage done and never counts as its stage's latest run.
        let done = Set(runs.filter { !$0.isHardMode }.compactMap(\.rehearsalStage))
        if let open = RehearsalStage.allCases.first(where: { !done.contains($0) }) { return open }
        var weakest = RehearsalStage.allCases[0]
        var most = -1
        for stage in RehearsalStage.allCases {
            let count = latestRun(runs, stage: stage)?.corrections.count ?? 0
            if count > most { most = count; weakest = stage }
        }
        return weakest
    }

    /// The run with the latest `finishedAt` for a stage (ISO timestamps order as text). Normal runs only unless
    /// `hardMode` is true, which looks at hard-mode runs only (the debrief of a hard-mode call reads those).
    public static func latestRun(_ runs: [RehearsalRun], stage: RehearsalStage, hardMode: Bool = false) -> RehearsalRun? {
        runs.filter { $0.rehearsalStage == stage && $0.isHardMode == hardMode }.max { $0.finishedAt < $1.finishedAt }
    }

    /// "Hard mode done" under the last stage's row, from the server's `hardModeDone`.
    public static let hardModeDoneLabel = "Hard mode done"
    public static func showsHardModeDone(stage: RehearsalStage, state: RehearsalState?) -> Bool {
        stage == .hardMoments && state?.hardModeDone == true
    }

    public static let footer = "Alphonso is an AI. He remembers what happened on each run and opens the next one with it. There is no readiness score."
    public static let title = "Your rehearsal plan"
    public static func nextButton(_ stage: RehearsalStage) -> String { "Next: \(stage.label)" }
    public static let deleteLabel = "Delete this rehearsal"
    public static let adjustLabel = "Adjust"
}

// MARK: - The partner

/// Who plays the other side of a rehearsal call. Alphonso is the default and is free; Hector is Pro.
public enum RehearsalPersona: String, CaseIterable, Sendable, Equatable {
    case alphonso, hector

    public var displayName: String { self == .hector ? "Hector" : "Alphonso" }

    /// The voice the call speaks with: `/api/tts` gets `character: "hector"` for him (the app's own voice selection).
    public var voiceCharacter: VoiceCharacter { self == .hector ? .hector : .alphonso }
}

/// The sheet at the start of each stage (the owner's pick 5B): "Start with Alphonso" is the main button; Hector is the
/// second choice, with a Pro badge for a learner who is not Pro; on the last stage a Hector run can be hard mode.
/// Mirrors the web's StagePartnerSheet.
public enum RehearsalPartner {
    /// What a tap on Hector does, from `hectorAvailable` (true Pro, false not Pro, nil could not tell).
    public enum HectorDoor: Equatable, Sendable {
        /// Start the call with him.
        case start
        /// Open the existing paywall; no call starts.
        case paywall
    }

    public static func hectorDoor(hectorAvailable: Bool?) -> HectorDoor { hectorAvailable == false ? .paywall : .start }

    /// The Pro badge shows only when the server said the learner is not Pro. `nil` lets them try; the server decides.
    public static func showsProBadge(hectorAvailable: Bool?) -> Bool { hectorAvailable == false }

    /// The "Hard mode" switch exists only for Hector, on the last stage, and not for a learner who is known not to be Pro.
    public static func offersHardMode(stage: RehearsalStage, hectorAvailable: Bool?) -> Bool {
        stage == .hardMoments && hectorAvailable != false
    }

    /// The call source for a choice. Hard mode survives only where it is offered; Alphonso never carries it.
    public static func source(
        rehearsalId: String, stage: RehearsalStage, persona: RehearsalPersona, hardMode: Bool
    ) -> CallSource {
        let hard = persona == .hector && stage == .hardMoments && hardMode
        return .rehearsal(id: rehearsalId, stage: stage, persona: persona, hardMode: hard)
    }

    public static let title = "Who do you want to practise with?"
    public static let alphonsoButton = "Start with Alphonso"
    public static let hectorBlurb = "A tougher, more realistic partner, and a longer debrief at the end."
    public static let hardModeTitle = "Hard mode"
    public static let hardModeBody = "Faster, with interruptions and surprise questions. Still inside your plan, and still kind."
    public static let notNow = "Not now"
    public static let proBadge = "Pro"

    public static func hectorButton(hectorAvailable: Bool?, hardMode: Bool) -> String {
        if hectorDoor(hectorAvailable: hectorAvailable) == .paywall { return "Start with Hector (Pro)" }
        return hardMode ? "Start hard mode with Hector" : "Start with Hector"
    }

    /// What VoiceOver says for the Hector option.
    public static func hectorAccessibilityLabel(hectorAvailable: Bool?, hardMode: Bool) -> String {
        let name = hectorButton(hectorAvailable: hectorAvailable, hardMode: hardMode)
        return showsProBadge(hectorAvailable: hectorAvailable)
            ? "\(name). Hector is an AI. Needs Alphonso Pro." : "\(name). Hector is an AI."
    }
}

// MARK: - The call

/// Where a call's conversation partner comes from. A scenario sends its own system prompt. A rehearsal sends only its id
/// and stage: the server builds the prompt from the learner's stored brief and the memory of earlier runs, so the app
/// never holds or sends prompt text for it. Mirrors src/lib/call-source.ts.
public enum CallSource: Equatable, Sendable {
    case scenario
    /// `persona` and `hardMode` are the learner's choice at the start of the stage. They are fixed for the whole call: the
    /// server binds them to the call on its first turn, so every turn must send the same values.
    case rehearsal(id: String, stage: RehearsalStage, persona: RehearsalPersona = .alphonso, hardMode: Bool = false)

    /// The `/api/chat` body for one reply of a call.
    public func chatBody(
        systemPrompt: String?, cefrLevel: String?, course: String?, callId: String?, messages: [ChatMessage]
    ) -> [String: Any] {
        var payload: [String: Any] = ["messages": messages.map { ["role": $0.role, "content": $0.content] }]
        switch self {
        case .scenario:
            if let systemPrompt { payload["systemPrompt"] = systemPrompt }
            if let course { payload["course"] = course }
        case let .rehearsal(id, stage, persona, hardMode):
            // No systemPrompt and no course: the stored rehearsal says both.
            var rehearsal: [String: Any] = ["id": id, "stage": stage.rawValue]
            // Alphonso's body is exactly what it was before Hector rehearsals. For Hector the persona is sent on every
            // turn, and `hardMode: true` with it (Hector on the last stage only; anything else is not sent).
            if persona == .hector {
                rehearsal["persona"] = persona.rawValue
                if hardMode && stage == .hardMoments { rehearsal["hardMode"] = true }
            }
            payload["rehearsal"] = rehearsal
        }
        if let cefrLevel { payload["cefrLevel"] = cefrLevel }
        if let callId { payload["callId"] = callId }
        return payload
    }

    /// The turns to send: a rehearsal's fixed opening line is a prompt to the learner, not something the partner said,
    /// so it never goes to the server.
    public func sendableTurns(_ snapshot: ConversationSnapshot) -> [ChatMessage] {
        switch self {
        case .scenario: return snapshot.recentTurns
        case .rehearsal:
            let kept = snapshot.turns.enumerated().filter { !snapshot.openerIndices.contains($0.offset) }.map(\.element)
            return Array(kept.suffix(ConversationSnapshot.maxTurnsSent))
        }
    }
}

public enum RehearsalCallHeader {
    /// "Alphonso · Stage 2 of 3: The real conversation".
    public static func subline(stage: RehearsalStage, persona: RehearsalPersona = .alphonso, hardMode: Bool = false) -> String {
        let base = "\(persona.displayName) \u{00B7} Stage \(stage.number) of \(RehearsalStage.allCases.count): \(stage.label)"
        return hardMode ? base + " \u{00B7} Hard mode" : base
    }

    /// The three-segment bar: how many segments are filled (the stage the learner is on, and those before it).
    public static func filledSegments(stage: RehearsalStage) -> Int { stage.number }
}

// MARK: - The debrief

public struct RehearsalDebrief: Equatable, Sendable {
    public let heading: String
    public let headline: String
    public let stats: String
    public let wentWell: [String]
    public let tryAgain: [String]
    /// "2 items. They will come back in Review and in a short lesson." only when the recap really kept some.
    public let fixLine: String?
    public let nextStage: RehearsalStage
    public static let footer = "Written by Alphonso, an AI, from this conversation. It can be wrong. Nothing here is a score."
    /// The same line for Hector's runs, naming who wrote it.
    public static func footer(persona: RehearsalPersona) -> String {
        persona == .alphonso ? footer : footer.replacingOccurrences(of: "Alphonso", with: persona.displayName)
    }
    public static let fixTitle = "Added to Fix before it sticks"
    public static let againLabel = "Run this stage again"

    /// The card's headline, as the web's debriefTitle says it.
    public static func headline(stage: RehearsalStage, kind: RehearsalEventKind?) -> String {
        switch stage {
        case .conversation: return "That was a full \(kind?.shortNoun ?? RehearsalEventKind.other.shortNoun)"
        case .warmup: return "That was your warm-up"
        case .hardMoments: return "That was the hard moments"
        }
    }

    /// At most this many "try again" lines, so the debrief never turns into a wall of corrections.
    public static let maxTryAgain = 2

    public enum Outcome: Equatable, Sendable {
        case debrief(RehearsalDebrief)
        /// The run was too short to count (the server wrote none): say so and offer the same stage again.
        case noRun
    }

    /// The debrief for the run just finished: the stage's latest run in `runs`, when it is newer than `previousFinishedAt`
    /// (the latest one before this call). No newer run means the server did not count it.
    public static func make(
        stage: RehearsalStage, kind: RehearsalEventKind?, runs: [RehearsalRun], previousFinishedAt: String?,
        seconds: Int, turns: Int, addedToFix: Int, hardMode: Bool = false
    ) -> Outcome {
        guard let run = RehearsalPlan.latestRun(runs, stage: stage, hardMode: hardMode),
              previousFinishedAt == nil || run.finishedAt > previousFinishedAt! else { return .noRun }
        let minutes = max(1, Int((Double(seconds) / 60).rounded()))
        let items = addedToFix == 1 ? "1 item" : "\(addedToFix) items"
        return .debrief(RehearsalDebrief(
            heading: "Stage \(stage.number) \u{00B7} \(stage.label)",
            headline: headline(stage: stage, kind: kind),
            stats: "\(minutes) \(minutes == 1 ? "minute" : "minutes") \u{00B7} \(turns) \(turns == 1 ? "turn" : "turns")",
            wentWell: run.wentWell,
            tryAgain: Array(run.corrections.prefix(maxTryAgain)),
            fixLine: addedToFix > 0 ? "\(items). They will come back in Review and in a short lesson." : nil,
            nextStage: RehearsalPlan.nextStage(runs: runs)))
    }
}

// MARK: - How did it go?

public enum RehearsalOutcomeChoice: String, CaseIterable, Sendable, Equatable {
    case well, ok, hard
    /// "It didn't happen / moved": opens the date picker (and the way to close the rehearsal).
    case moved

    public var title: String {
        switch self {
        case .well: return "Went well"
        case .ok: return "OK"
        case .hard: return "It was hard"
        case .moved: return "It didn\u{2019}t happen / moved"
        }
    }

    public var hint: String? {
        switch self {
        case .hard: return "Alphonso can help you practise those parts"
        case .moved: return "You can set a new date"
        default: return nil
        }
    }

    public static let footer = "Just a tap. No words are stored. You can delete this rehearsal any time."
    public static let movedTitle = "When is it now?"
    public static func moveButton(_ date: String?) -> String {
        date.flatMap(RehearsalDates.short).map { "Move my rehearsal to \($0)" } ?? "Pick the new day"
    }
    public static let closeButton = "It didn\u{2019}t happen, close the rehearsal"
}

// MARK: - The free rehearsal and the paywall

/// What the app knows about the learner's Pro state. Unknown (no entitlement source yet) is its own answer, never "free".
public enum RehearsalProStatus: Equatable, Sendable {
    case pro, free, unknown
}

public enum RehearsalEntry: Equatable, Sendable {
    /// No rehearsal going and one may be made: the intake.
    case intake
    /// A rehearsal is going: its plan.
    case plan
    /// The free rehearsal is used and the learner is not Pro: the sheet "Rehearsals are part of Pro".
    case paywall(RehearsalPaywallCopy)
    /// The Pro state is not known, so neither the sheet nor the intake is safe to show: say so and offer a retry.
    case unavailable

    /// What a tap on the Learn entry does. An active rehearsal always opens its plan; a learner who is not Pro with the
    /// free one used and nothing going meets the sheet; everyone else starts the intake (the server still decides).
    /// `pro` unknown never shows the sheet (a Pro learner must not see it): with the free rehearsal used it is `.unavailable`.
    public static func decide(state: RehearsalState, pro: RehearsalProStatus) -> RehearsalEntry {
        if state.active != nil { return .plan }
        if state.freeAvailable { return .intake }
        switch pro {
        case .pro: return .intake
        case .free: return .paywall(RehearsalPaywallCopy.make(history: state.history))
        case .unknown: return .unavailable
        }
    }
}

/// The paywall sheet's words: it names what the learner already did, from their latest closed rehearsal.
public struct RehearsalPaywallCopy: Equatable, Sendable {
    public let title: String
    public let subtitle: String
    public let body: String
    public let stays: [String]
    public let primary: String
    public let secondary: String
    public let note: String

    /// The paragraph, as the web's paywallSummary says it: numbers only, what is zero left out. `history` is read the
    /// way the web does, its first (newest) row.
    public static func summary(of done: RehearsalSummary?) -> String {
        guard let done, done.runs > 0 else {
            return "You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro."
        }
        func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
        let stages = done.stagesDone >= 3 ? "all 3 stages" : "\(done.stagesDone) of 3 stages"
        var parts = [stages, plural(done.runs, "run", "runs")]
        if done.corrections > 0 { parts.append("\(plural(done.corrections, "mistake", "mistakes")) sent to Fix before it sticks") }
        let list = parts.count == 3 ? "\(parts[0]), \(parts[1]), and \(parts[2])" : "\(parts[0]) and \(parts[1])"
        let what = done.kind?.shortNoun ?? RehearsalEventKind.other.shortNoun
        return "You rehearsed your \(what) with Alphonso (AI): \(list). A new rehearsal, for a meeting, a landlord or a first day, needs Pro."
    }

    public static func make(history: [RehearsalSummary]) -> RehearsalPaywallCopy {
        let did = summary(of: history.first)
        return RehearsalPaywallCopy(
            title: "Rehearsals are part of Pro",
            subtitle: "You have used your free rehearsal",
            body: did,
            stays: ["Your plan and run history stay readable.", "Recaps and Alphonso\u{2019}s memory stay free."],
            primary: "See Pro",
            secondary: "Not now",
            note: "The price is shown by the store before you pay. You can cancel any time in your store settings.")
    }
}

// MARK: - The Learn entry

public enum RehearsalLearnEntry {
    /// The rail card: "Rehearse / a real talk", or "Rehearsal / <Event> · <date>" while one is going.
    public static func card(state: RehearsalState?) -> (title: String, value: String) {
        guard let active = state?.active else { return ("Rehearse", "a real talk") }
        let when = active.eventDate.flatMap(RehearsalDates.short)
        let event = active.eventLabel
        return ("Rehearsal", when.map { "\(event) \u{00B7} \($0)" } ?? event)
    }

    /// The Learn hero on the event day, from the path's pinned item.
    public static func heroTitle(kind: RehearsalEventKind?) -> String {
        let noun = kind?.shortNoun ?? "event"
        return "\(noun.prefix(1).uppercased())\(noun.dropFirst()) today"
    }
    public static let heroSubtitle = "2-minute warm-up"
    public static let heroLine = "Say the key phrases once more before you go"
    public static let heroButton = "Start 2 minutes"
}

// MARK: - The client

/// Calls this repo's own `/api/rehearsal`, the same route the web screens use. Same auth as the other clients here (the
/// user's access token as a Bearer header, one refresh-and-retry on a 401).
public final class RehearsalClient: Sendable {
    public typealias Requester = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let accessToken: @Sendable () -> String
    private let refreshAccessToken: (@Sendable () async -> String?)?
    private let requester: Requester

    public init(
        baseURL: URL,
        accessToken: @escaping @Sendable () -> String,
        refreshAccessToken: (@Sendable () async -> String?)? = nil,
        requester: @escaping Requester = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.refreshAccessToken = refreshAccessToken
        self.requester = requester
    }

    public func state(course: String) async -> Result<RehearsalState, RehearsalError> {
        var parts = URLComponents(url: baseURL.appendingPathComponent("api/rehearsal"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "course", value: course)]
        var request = URLRequest(url: parts.url!)
        request.httpMethod = "GET"
        switch await send(request) {
        case .failure(let e): return .failure(e)
        case .success(let data):
            guard let state = RehearsalDecoding.state(from: data) else { return .failure(.failed) }
            return .success(state)
        }
    }

    public func create(_ intake: RehearsalIntake) async -> Result<Rehearsal, RehearsalError> {
        await rehearsal(RehearsalRequests.create(intake))
    }

    /// The quick-start cards for a course. An empty list is a failure too: the screen falls back to "Something else".
    public func presets(course: String) async -> Result<[RehearsalPreset], RehearsalError> {
        var parts = URLComponents(url: baseURL.appendingPathComponent("api/rehearsal-presets"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "course", value: course)]
        var request = URLRequest(url: parts.url!)
        request.httpMethod = "GET"
        switch await send(request) {
        case .failure(let e): return .failure(e)
        case .success(let data):
            guard let list = RehearsalDecoding.presets(from: data), !list.isEmpty else { return .failure(.failed) }
            return .success(list)
        }
    }

    /// Creates the rehearsal from a quick-start. `eventDate` is YYYY-MM-DD or nil.
    public func create(course: String, preset: String, eventDate: String?) async -> Result<Rehearsal, RehearsalError> {
        await rehearsal(RehearsalRequests.create(course: course, preset: preset, eventDate: eventDate))
    }

    public func adjust(id: String, _ intake: RehearsalIntake) async -> Result<Rehearsal, RehearsalError> {
        await rehearsal(RehearsalRequests.adjust(id: id, intake))
    }

    public func cancel(id: String) async -> Result<Rehearsal, RehearsalError> {
        await rehearsal(RehearsalRequests.cancel(id: id))
    }

    /// "How did it go?": taps only. `moved` carries the new date (YYYY-MM-DD); the others close the rehearsal.
    public func outcome(id: String, choice: RehearsalOutcomeChoice, newDate: String? = nil) async -> Result<Rehearsal, RehearsalError> {
        await rehearsal(RehearsalRequests.outcome(id: id, choice: choice, newDate: newDate))
    }

    public func delete(id: String) async -> Result<Void, RehearsalError> {
        switch await post(RehearsalRequests.delete(id: id)) {
        case .failure(let e): return .failure(e)
        case .success: return .success(())
        }
    }

    private func rehearsal(_ body: [String: Any]) async -> Result<Rehearsal, RehearsalError> {
        switch await post(body) {
        case .failure(let e): return .failure(e)
        case .success(let data):
            guard let made = RehearsalDecoding.rehearsal(from: data) else { return .failure(.failed) }
            return .success(made)
        }
    }

    private func post(_ body: [String: Any]) async -> Result<Data, RehearsalError> {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/rehearsal"))
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return await send(request)
    }

    private func send(_ request: URLRequest) async -> Result<Data, RehearsalError> {
        var request = request
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken())", forHTTPHeaderField: "Authorization")
        do {
            var (data, response) = try await requester(request)
            if (response as? HTTPURLResponse)?.statusCode == 401, let refreshAccessToken, let token = await refreshAccessToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                (data, response) = try await requester(request)
            }
            guard let http = response as? HTTPURLResponse else { return .failure(.failed) }
            guard (200...299).contains(http.statusCode) else {
                let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                return .failure(RehearsalError.from(status: http.statusCode, code: object?["error"] as? String))
            }
            return .success(data)
        } catch {
            return .failure(.failed)
        }
    }
}

/// The POST bodies, as plain dictionaries so a test reads exactly what is sent.
public enum RehearsalRequests {
    public static func create(_ intake: RehearsalIntake) -> [String: Any] {
        var body = intake.body
        body["action"] = "create"
        return body
    }

    /// A quick-start create: the preset id and the date (null when the learner added none, as the shared fixture's
    /// `createFromPreset` has it). No intake text travels.
    public static func create(course: String, preset: String, eventDate: String?) -> [String: Any] {
        ["action": "create", "course": course, "preset": preset, "eventDate": eventDate.map { $0 as Any } ?? NSNull()]
    }

    /// "Add a date" on an existing rehearsal: `adjust` with only the id and the date (null clears it).
    public static func addDate(id: String, eventDate: String?) -> [String: Any] {
        ["action": "adjust", "id": id, "eventDate": eventDate.map { $0 as Any } ?? NSNull()]
    }

    public static func adjust(id: String, _ intake: RehearsalIntake) -> [String: Any] {
        var body = intake.body
        body["action"] = "adjust"
        body["id"] = id
        return body
    }

    public static func cancel(id: String) -> [String: Any] { ["action": "cancel", "id": id] }
    public static func delete(id: String) -> [String: Any] { ["action": "delete", "id": id] }

    public static func outcome(id: String, choice: RehearsalOutcomeChoice, newDate: String?) -> [String: Any] {
        var body: [String: Any] = ["action": "outcome", "id": id, "choice": choice.rawValue]
        // Only "moved" carries a date.
        if choice == .moved, let newDate { body["newDate"] = newDate }
        return body
    }
}

/// `features.rehearsals` from `GET /api/app-config`; the feature is hidden unless it is true. Never throws: any failure
/// is off.
public enum RehearsalFeature {
    public static func isEnabled(
        baseURL: URL,
        timeout: TimeInterval = 5,
        requester: RehearsalClient.Requester = { try await URLSession.shared.data(for: $0) }
    ) async -> Bool {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/app-config"))
        request.timeoutInterval = timeout
        guard let (data, response) = try? await requester(request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
        return RehearsalDecoding.rehearsalsEnabled(inAppConfig: data)
    }
}
