import Foundation

/// The first run (visual round 6, part 3), the same as the web's src/lib/first-run.ts: Alphonso asks eight questions,
/// gives a two-question taste and a plan, and only then asks the learner to sign in. Until then every answer stays on
/// this device.
///
/// Under 13: the age screen is neutral (every range looks the same, none is picked). Choosing "Under 13" ends the
/// first run on this device: the answers are wiped, a flag is kept so going back, relaunching or picking an older
/// range does not get through, no account can be made here, and nothing is ever sent.

/// Where the store keeps its two values. The app passes UserDefaults for the draft and the Keychain for the block.
public protocol FirstRunKeyValue: AnyObject {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
}

/// A store that keeps values in memory only (tests, previews).
public final class InMemoryFirstRunKeyValue: FirstRunKeyValue, @unchecked Sendable {
    private var values: [String: String] = [:]
    private let lock = NSLock()
    public init(_ values: [String: String] = [:]) { self.values = values }
    public func string(forKey key: String) -> String? { lock.withLock { values[key] } }
    public func set(_ value: String?, forKey key: String) { lock.withLock { values[key] = value } }
}

public final class FirstRunStore: @unchecked Sendable {
    public static let draftKey = "lwa.firstRun.v1"
    public static let under13Key = "lwa.under13.v1"

    private let draftStorage: FirstRunKeyValue?
    private let blockStorage: FirstRunKeyValue?
    /// Kept in memory as well, so the block holds for this launch even if the storage write failed.
    private var blockedThisLaunch = false
    private let lock = NSLock()

    public init(draftStorage: FirstRunKeyValue?, blockStorage: FirstRunKeyValue?) {
        self.draftStorage = draftStorage
        self.blockStorage = blockStorage
    }

    public func readDraft() -> LearnerAnswers {
        if isBlocked() { return LearnerAnswers() }
        guard let raw = draftStorage?.string(forKey: Self.draftKey), let data = raw.data(using: .utf8),
              let draft = try? JSONDecoder().decode(LearnerAnswers.self, from: data) else { return LearnerAnswers() }
        return draft
    }

    public func writeDraft(_ draft: LearnerAnswers) {
        if isBlocked() { return }
        guard let data = try? JSONEncoder().encode(draft), let raw = String(data: data, encoding: .utf8) else { return }
        draftStorage?.set(raw, forKey: Self.draftKey)
    }

    public func clearDraft() {
        draftStorage?.set(nil, forKey: Self.draftKey)
    }

    public func isBlocked() -> Bool {
        if lock.withLock({ blockedThisLaunch }) { return true }
        return blockStorage?.string(forKey: Self.under13Key) == "1"
    }

    public func blockUnder13() {
        lock.withLock { blockedThisLaunch = true }
        blockStorage?.set("1", forKey: Self.under13Key)
        clearDraft()
    }
}

// MARK: - Age

public enum AgeChoice: String, CaseIterable, Sendable {
    case under13 = "under-13"
    case teen = "13-17"
    case youngAdult = "18-24"
    case adult = "25-34"
    case midAdult = "35-54"
    case mature = "55+"

    /// The big figure on the card.
    public var big: String {
        switch self {
        case .under13: return "<13"
        case .teen: return "13\u{2013}17"
        case .youngAdult: return "18\u{2013}24"
        case .adult: return "25\u{2013}34"
        case .midAdult: return "35\u{2013}54"
        case .mature: return "55+"
        }
    }

    public var small: String {
        switch self {
        case .under13: return "Under 13"
        case .teen: return "Teen"
        case .youngAdult: return "Young adult"
        case .adult: return "Adult"
        case .midAdult: return "Mid-life"
        case .mature: return "Mature"
        }
    }

    /// What VoiceOver/TalkBack reads: plain words, no symbols.
    public var accessibilityLabel: String {
        switch self {
        case .under13: return "Under 13"
        case .mature: return "55 or over, Mature"
        default: return "\(rawValue.replacingOccurrences(of: "-", with: " to ")), \(small)"
        }
    }
}

public enum AgeOutcome: Equatable, Sendable { case ok, blocked }

public enum FirstRun {
    /// The age screen's Continue. A device that ever chose Under 13 stays blocked, whatever is picked now.
    public static func chooseAge(_ store: FirstRunStore, _ choice: AgeChoice) -> AgeOutcome {
        if store.isBlocked() { return .blocked }
        if choice == .under13 {
            store.blockUnder13()
            return .blocked
        }
        var draft = store.readDraft()
        draft.ageRange = choice.rawValue
        store.writeDraft(draft)
        return .ok
    }

    /// A draft cleaned to the server's lists (anything else dropped); nil when nothing is left.
    public static func cleanAnswers(_ draft: LearnerAnswers) -> LearnerAnswers? {
        let cleaned = LearnerAnswers.parse(draft.jsonPatch)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// The answers to save after sign-in; nil when this device is blocked or nothing was answered.
    public static func answersToSend(_ store: FirstRunStore) -> LearnerAnswers? {
        if store.isBlocked() { return nil }
        return cleanAnswers(store.readDraft())
    }

    // MARK: Steps

    public enum Mode: Sendable { case new, complete }

    public enum QuestionStep: String, CaseIterable, Sendable {
        case name, course, about, goal, level, time, age, interests
    }

    /// The counted questions ("Question 3 of 8"). Complete your profile skips the course (and sign-in).
    public static func questionSteps(_ mode: Mode) -> [QuestionStep] {
        mode == .new ? QuestionStep.allCases : QuestionStep.allCases.filter { $0 != .course }
    }

    // MARK: The room

    private static let courseRooms = ["es": "coffee", "fr": "restaurant", "en": "smalltalk"]
    private static let goalRooms = [
        "travel": "airport", "work": "office", "school": "classroom", "family": "apartment", "exam": "library",
        "fun": "gallery",
    ]

    /// Answers change the room: the course picks its room, then the goal moves him (Travel: the airport).
    public static func room(course: String?, goal: String?) -> String {
        if let goal, let room = goalRooms[goal] { return room }
        if let course, let room = courseRooms[course] { return room }
        return "room-light"
    }

    public static let courseNames = ["en": "English", "fr": "French", "es": "Spanish"]

    public static func courseName(_ course: String) -> String { courseNames[course] ?? "English" }

    public static func greeting(course: String, name: String?) -> String {
        let n = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        switch course {
        case "es": return n.isEmpty ? "\u{A1}Hola!" : "\u{A1}Hola, \(n)!"
        case "fr": return n.isEmpty ? "Bonjour !" : "Bonjour, \(n) !"
        default: return n.isEmpty ? "Hello!" : "Hello, \(n)!"
        }
    }

    /// "Food, travel and music" from interest labels.
    public static func listInWords(_ items: [String]) -> String {
        if items.count <= 1 { return items.joined() }
        return items.dropLast().joined(separator: ", ") + " and " + items[items.count - 1]
    }

    // MARK: Choices (the web's FirstRunFlow / AfterSignIn tables)

    public struct Choice: Equatable, Sendable {
        public let id: String
        public let label: String
        /// A semantic icon name (the web's FirstRunIcons); each app maps it to its own icon.
        public let icon: String
        public let sub: String?
        public init(id: String, label: String, icon: String, sub: String? = nil) {
            self.id = id
            self.label = label
            self.icon = icon
            self.sub = sub
        }
    }

    public static let goalChoices: [Choice] = [
        Choice(id: "travel", label: "Travel", icon: "plane", sub: "Travel mode"),
        Choice(id: "work", label: "Work", icon: "brief", sub: "Work mode"),
        Choice(id: "school", label: "School", icon: "cap", sub: "School mode"),
        Choice(id: "family", label: "Family", icon: "home", sub: "Family mode"),
        Choice(id: "exam", label: "An exam", icon: "medal", sub: "Exam mode"),
        Choice(id: "fun", label: "Just for fun", icon: "smile", sub: "Fun mode"),
    ]

    public static let levelChoices: [Choice] = [
        Choice(id: "new", label: "I'm brand new", icon: "seed", sub: "Start from the very beginning"),
        Choice(id: "some", label: "I know some", icon: "sprout", sub: "Words and simple sentences"),
        Choice(id: "confident", label: "I'm fairly confident", icon: "tree", sub: "I can hold a conversation"),
    ]

    public static let timeChoices: [(minutes: Int, sub: String)] = [
        (5, "Casual"), (10, "Regular"), (15, "Serious"), (20, "Intense"),
    ]

    public static let interestChoices: [Choice] = [
        Choice(id: "food", label: "Food", icon: "food"),
        Choice(id: "travel", label: "Travel", icon: "plane"),
        Choice(id: "sport", label: "Sport", icon: "ball"),
        Choice(id: "music", label: "Music", icon: "music"),
        Choice(id: "movies", label: "Movies & TV", icon: "film"),
        Choice(id: "business", label: "Business", icon: "brief"),
        Choice(id: "tech", label: "Tech", icon: "chip"),
        Choice(id: "nature", label: "Nature", icon: "leaf"),
        Choice(id: "art", label: "Art", icon: "brush"),
        Choice(id: "family", label: "Family", icon: "people"),
    ]

    public static let heardChoices: [Choice] = [
        Choice(id: "app_store", label: "App Store", icon: "store"),
        Choice(id: "search", label: "Search", icon: "search"),
        Choice(id: "youtube", label: "YouTube", icon: "film"),
        Choice(id: "social", label: "Instagram or TikTok", icon: "share"),
        Choice(id: "friend", label: "A friend", icon: "people"),
        Choice(id: "podcast", label: "Podcast", icon: "pod"),
    ]

    public static let courseOrder = ["en", "fr", "es"]

    /// The placement hint under the level choices (only for "some" and "confident").
    public static func levelHint(level: String?, mode: Mode) -> String? {
        guard level == "some" || level == "confident" else { return nil }
        return mode == .new
            ? "After you sign in, a 3-minute placement test can find your exact starting point."
            : "At the end, a 3-minute placement test can find your exact starting point."
    }

    /// The plan card on the sign-in screen: "Spanish for travel · I know some", "10 minutes a day", interests.
    public static func planSummary(_ draft: LearnerAnswers, course: String) -> [String] {
        let goal = goalChoices.first { $0.id == draft.goal }?.label.lowercased()
        let level = levelChoices.first { $0.id == draft.level }?.label
        let head = [courseName(course) + (goal.map { " for \($0)" } ?? ""), level].compactMap { $0 }
        var lines = [head.joined(separator: " \u{B7} "), "\(draft.dailyMinutes ?? 10) minutes a day"]
        let interests = (draft.interests ?? []).compactMap { id in interestChoices.first { $0.id == id }?.label.lowercased() }
        if !interests.isEmpty {
            let words = listInWords(interests)
            lines.append(words.prefix(1).uppercased() + words.dropFirst())
        }
        return lines
    }

    /// Meet Hector's first benefit line: up to three interests, then "your week".
    public static func hectorTopics(_ interests: [String]) -> String {
        let topics = interests.compactMap { id in interestChoices.first { $0.id == id }?.label.lowercased() }.prefix(3)
        return topics.isEmpty ? "About anything you like" : "About " + listInWords(Array(topics) + ["your week"])
    }

    // MARK: First taste

    public struct MiniQuestion: Equatable, Sendable {
        public let prompt: String
        public let choices: [String]
        public let answer: Int
        public let why: String
        /// Read aloud for the speaker button, in the course's language.
        public let say: String
    }

    /// Two real questions per course, answered on the device before any account.
    public static let miniLessons: [String: [MiniQuestion]] = [
        "es": [
            MiniQuestion(
                prompt: "Let's try one! How do you say \u{201C}good morning\u{201D}?",
                choices: ["Buenas noches", "Buenos d\u{ED}as", "Hasta luego"], answer: 1,
                why: "\u{201C}Buenos d\u{ED}as\u{201D} is how you greet someone until lunchtime.", say: "Buenos d\u{ED}as"),
            MiniQuestion(
                prompt: "And this one: what does \u{201C}gracias\u{201D} mean?",
                choices: ["Please", "Thank you", "Sorry"], answer: 1,
                why: "\u{201C}Gracias\u{201D} is thank you. \u{201C}Muchas gracias\u{201D} is thank you very much.",
                say: "Gracias"),
        ],
        "fr": [
            MiniQuestion(
                prompt: "Let's try one! How do you say \u{201C}good morning\u{201D}?",
                choices: ["Bonsoir", "Bonjour", "Au revoir"], answer: 1,
                why: "\u{201C}Bonjour\u{201D} is good morning and hello, all day until the evening.", say: "Bonjour"),
            MiniQuestion(
                prompt: "And this one: what does \u{201C}merci\u{201D} mean?",
                choices: ["Please", "Thank you", "Sorry"], answer: 1,
                why: "\u{201C}Merci\u{201D} is thank you. \u{201C}Merci beaucoup\u{201D} is thank you very much.",
                say: "Merci"),
        ],
        "en": [
            MiniQuestion(
                prompt: "Let's try one! Which is a morning greeting?",
                choices: ["Good night", "Good morning", "See you later"], answer: 1,
                why: "\u{201C}Good morning\u{201D} is a greeting until about noon. \u{201C}Good night\u{201D} is for bedtime.",
                say: "Good morning"),
            MiniQuestion(
                prompt: "And this one: which is the polite way to ask?",
                choices: ["Give me water.", "Could I have some water, please?", "Water now."], answer: 1,
                why: "\u{201C}Could I have\u{2026}, please?\u{201D} is polite and natural in caf\u{E9}s and shops.",
                say: "Could I have some water, please?"),
        ],
    ]

    public static func praise(course: String, name: String) -> String {
        let word = course == "es" ? "\u{A1}Muy bien" : course == "fr" ? "Tr\u{E8}s bien" : "Well done"
        return name.isEmpty ? "\(word)!" : "\(word), \(name)!"
    }

    /// Text for on-device speech: the curly quotes the bubbles use are dropped (the web's say()).
    public static func spoken(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{201C}", with: "").replacingOccurrences(of: "\u{201D}", with: "")
    }

    // MARK: Plan

    /// Where the plan starts until the placement test (offered for "some" and "confident") says otherwise.
    public static func startLevel(_ level: String?) -> String {
        switch level {
        case "some": return "A2"
        case "confident": return "B1"
        default: return "A1"
        }
    }

    public struct Plan: Equatable, Sendable {
        public struct Node: Equatable, Sendable {
            public let title: String
            public let room: String
        }
        public let nodes: [Node]
        /// The second unit: the plan's first goal.
        public let goalUnitTitle: String
        /// The day (UTC) the second unit is done by at the chosen daily time.
        public let goalDate: DateComponents
    }

    /// The first three units at the starting level, and when the second is done at `dailyMinutes` a day.
    public static func plan(
        units: [Unit], level: String?, dailyMinutes: Int?, now: Date, timing: LessonTiming?, roomMap: UnitRoomMap?
    ) -> Plan {
        let start = startLevel(level)
        let atLevel = units.filter { $0.level == start }
        let first = Array((atLevel.isEmpty ? units : atLevel).prefix(3))
        let minutes = first.prefix(2).flatMap(\.lessons).reduce(0) { sum, lesson in
            sum + (timing?.estimateMinutes(questionTypes: lesson.questions.map(\.typeKey), newWords: 0) ?? 1)
        }
        let perDay = dailyMinutes ?? 10
        let days = max(1, Int((Double(minutes) / Double(perDay)).rounded(.up)))
        let goal = now.addingTimeInterval(Double(days) * 86_400)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        return Plan(
            nodes: first.map { Plan.Node(title: $0.title, room: LessonStage.roomID(forUnit: $0.id, map: roomMap)) },
            goalUnitTitle: first.count > 1 ? first[1].title : (first.first?.title ?? ""),
            goalDate: utc.dateComponents([.year, .month, .day], from: goal))
    }

    private static let monthNames = [
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
        "November", "December",
    ]

    /// "8 November" (the web's en-GB day and month).
    public static func formatDay(_ day: DateComponents) -> String {
        guard let d = day.day, let m = day.month, (1...12).contains(m) else { return "" }
        return "\(d) \(monthNames[m - 1])"
    }

    // MARK: After the first run

    public enum FinishTarget: Sendable { case lesson, hector }
    public enum Destination: Equatable, Sendable { case hector, placement, learn }

    /// Where a learner goes after the first run: the placement test for "some" and "confident", else Learn.
    public static func destination(_ target: FinishTarget, level: String?, placementTaken: Bool) -> Destination {
        if target == .hector { return .hector }
        if (level == "some" || level == "confident") && !placementTaken { return .placement }
        return .learn
    }

    /// Meet Hector's trial line, from the store's introductory offer. Nil (no line) when there is no free trial or
    /// the learner is not eligible. Never typed in anywhere: `days` comes from the store.
    public static func trialLine(days: Int?) -> String? {
        guard let days, days >= 1 else { return nil }
        return "\(days) \(days == 1 ? "day" : "days") free, then your plan's price. Cancel any time."
    }

    public static func hectorButton(hasTrial: Bool) -> String {
        hasTrial ? "Try a free call with Hector" : "See what Hector can do"
    }

    /// A store's trial period in days: a week is 7, a month 30, a year 365.
    public static func trialDays(value: Int, unit: BillingPeriodUnit) -> Int? {
        guard value >= 1 else { return nil }
        switch unit {
        case .day: return value
        case .week: return value * 7
        case .month: return value * 30
        case .year: return value * 365
        }
    }

    /// The free trial the store offers THIS learner (StoreKit's introductory offer, already filtered by RevenueCat's
    /// eligibility check into `eligibleFreeTrial`), in days; nil while loading, on a failure, or with no trial.
    public static func trialDays(from load: PaywallLoadState) -> Int? {
        guard case .loaded(let products) = load else { return nil }
        return products.compactMap { $0.eligibleFreeTrial }.compactMap { trialDays(value: $0.value, unit: $0.unit) }.max()
    }

    // MARK: Complete your profile

    /// What Complete your profile starts from: the answers on the account, the public name (first word, never a
    /// Learner-XXXX handle) when no name was answered, and the leaderboard country. A country already shown on the
    /// leaderboard was the learner's own choice, so the flag starts on (the web's prefill): saving with it off would
    /// clear that country.
    public static func completeProfilePrefill(
        profile: LearnerProfile, displayName: String?, leaderboardCountry: String?
    ) -> LearnerAnswers {
        var out = profile.answers
        if out.name == nil, let displayName, !DisplayNameOnboarding.isLearnerHandle(displayName),
           let first = displayName.split(separator: " ").first.map(String.init) {
            out.name = LearnerAnswers.cleanName(first)
        }
        if out.country == nil { out.country = leaderboardCountry }
        out.showFlag = (profile.answers.showFlag == true) || leaderboardCountry != nil
        return out
    }

    // MARK: Under 13 (the owner-approved wording)

    public static let under13Title = "Thanks for wanting to learn with me!"
    public static let under13Body =
        "Learn With Alphonso is for learners aged 13 and over, so we can't make an account for you yet. Come back when you're 13. I'll be here!"
}

/// Complete your profile's Not now holds for the rest of this launch even when saving it failed (offline, a server
/// error), so the gate cannot send the learner straight back. In memory only; the saved dismissedAt is what keeps it
/// away on later launches.
public enum CompleteProfileSkip {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var skipped = false

    public static func skipThisLaunch() { lock.withLock { skipped = true } }
    public static var skippedThisLaunch: Bool { lock.withLock { skipped } }
    /// Sign-out: the next account decides for itself.
    public static func reset() { lock.withLock { skipped = false } }
}
