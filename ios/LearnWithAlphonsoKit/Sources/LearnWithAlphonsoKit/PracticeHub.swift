import Foundation

/// Wire models from /api/practice. No client scorer or star writer exists.
public struct PracticeStarRow: Codable, Sendable, Equatable {
    public let kind: String
    public let itemKey: String
    public let bestStars: Int
    public let lastPlayedAt: String
    public init(kind: String, itemKey: String, bestStars: Int, lastPlayedAt: String) {
        self.kind = kind; self.itemKey = itemKey; self.bestStars = bestStars; self.lastPlayedAt = lastPlayedAt
    }
}
public struct PracticeWeaknessEvent: Codable, Sendable {
    public let category: String
    public let eventType: String
    public let createdAt: String
    public init(category: String, eventType: String, createdAt: String) {
        self.category = category; self.eventType = eventType; self.createdAt = createdAt
    }
}
public struct PracticeHubData: Codable, Sendable {
    public let stars: [PracticeStarRow]
    public let cefrLevel: String?
    public let weaknessEvents: [PracticeWeaknessEvent]
    public init(stars: [PracticeStarRow] = [], cefrLevel: String? = nil, weaknessEvents: [PracticeWeaknessEvent] = []) {
        self.stars = stars; self.cefrLevel = cefrLevel; self.weaknessEvents = weaknessEvents
    }
}
public struct PracticeResult: Codable, Sendable, Equatable {
    public let kind: String
    public let itemKey: String
    public let stars: Int
    public let bestBefore: Int
    public let bestAfter: Int
    public let replies: Int
    public let rightReplies: Int
    public let shortReplies: Int
    public let englishReplies: Int
    public let finishMinReplies: Int
    /// Display the server's award even if the transcript or best suggests a different score.
    public var displayedStars: Int { stars }
    /// The slip block only shows when the server counted a wrong reply; a clean call has none.
    public func slipToShow<T>(_ slip: T?) -> T? { rightReplies < replies ? slip : nil }
    public var retryLabel: String { stars == 3 ? "Play again" : stars == 0 ? "Try again" : "Try for \(stars + 1)" }
    public func headline(course: String) -> String {
        let praise = ["en": "Well done.", "fr": "Très bien.", "es": "Muy bien."][course] ?? "Well done."
        if stars == 0 { return "No stars this time" }
        return ["", "One star. You finished.", "Two stars. " + praise, "Three stars. " + praise][stars]
    }
    public var hint: String {
        func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
        if stars == 0 { return "Finish the call for your first star: \(plural(finishMinReplies - replies, "more reply", "more replies")) next time." }
        if stars == 3 { return bestBefore == 3 ? "Three again. Nothing left to win here." : "Every reply right, in full sentences. Nothing left to win here." }
        if stars == 1 { return "\(rightReplies) of \(replies) replies right. Two stars take 80%." }
        let wrong = replies - rightReplies
        var reasons: [String] = []
        if wrong > 0 { reasons.append(plural(wrong, "slip", "slips")) }
        if shortReplies > 0 { reasons.append(plural(shortReplies, "short reply", "short replies")) }
        if englishReplies > 0 { reasons.append(plural(englishReplies, "reply in English", "replies in English")) }
        let what = reasons.count > 1 ? reasons.dropLast().joined(separator: ", ") + " and " + reasons.last! : reasons.first ?? "A slip"
        let subject = what.prefix(1).uppercased() + what.dropFirst()
        return subject + " kept you from three. Fix " + (wrong + shortReplies + englishReplies == 1 ? "it" : "them") + " and try again."
    }
}
public struct PracticePick: Equatable, Sendable {
    public let scenarioID: String
    public let weakSpot: String?
}
public struct PracticeContinue: Equatable, Sendable {
    public let campaignID: String
    public let sceneIndex: Int
}
public enum PracticeHub {
    public static func weakSpotName(_ key: String) -> String {
        ["past-tense": "the past tense", "subject-verb-agreement": "verb agreement", "question-formation": "asking questions", "modal-verbs": "can, could and would", "word-order": "word order", "conditionals": "the conditional", "phrasal-verbs": "phrasal verbs", "negation": "negatives", "vocabulary-choice": "choosing the right word", "comparatives": "comparisons"][key] ?? key
    }
    public static let levels = ["All", "Beginner", "Intermediate", "Advanced"]
    public static let starRules = ["Finish the call", "80% of your replies right", "Every reply right, in full sentences of 4+ words, no English"]
    /// The rule lines for a call or a chat: only the first line names the mode.
    public static func starRules(chat: Bool) -> [String] {
        var rules = starRules
        if chat { rules[0] = "Finish the chat" }
        return rules
    }
    public static func stars(_ rows: [PracticeStarRow], kind: String, key: String) -> Int {
        rows.last(where: { $0.kind == kind && $0.itemKey == key })?.bestStars ?? 0
    }
    public static func starLabel(_ n: Int) -> String { "\(n) of 3 stars" }
    public static func level(_ cefr: String?) -> String {
        let c = (cefr ?? "A1").uppercased()
        return c.hasPrefix("A") ? "Beginner" : c.hasPrefix("B") ? "Intermediate" : "Advanced"
    }
    public static func filtered(_ scenarios: [Scenario], level: String) -> [Scenario] {
        scenarios.filter { level == "All" || $0.level == level }
    }
    public static func today(_ data: PracticeHubData, scenarios: [Scenario]) -> PracticePick? {
        let candidates = filtered(scenarios, level: level(data.cefrLevel))
        func least(_ list: [Scenario]) -> Scenario? {
            list.enumerated().min { a, b in
                let x = stars(data.stars, kind: "scenario", key: a.element.id)
                let y = stars(data.stars, kind: "scenario", key: b.element.id)
                return x == y ? a.offset < b.offset : x < y
            }?.element
        }
        var counts: [String: Int] = [:], last: [String: String] = [:]
        var order: [String] = []
        for e in data.weaknessEvents {
            if counts[e.category] == nil { order.append(e.category) }
            counts[e.category, default: 0] += e.eventType == "detected" ? 1 : -1
            last[e.category] = max(last[e.category] ?? "", e.createdAt)
        }
        let weak = order.filter { counts[$0, default: 0] > 0 }.sorted {
            let a = counts[$0, default: 0], b = counts[$1, default: 0]
            return a == b ? last[$0, default: ""] > last[$1, default: ""] : a > b
        }
        for w in weak {
            if w == "spelling" { continue }
            if let s = least(candidates.filter { focus[$0.id, default: []].contains(w) }) {
                return PracticePick(scenarioID: s.id, weakSpot: w)
            }
        }
        return least(candidates).map { PracticePick(scenarioID: $0.id, weakSpot: nil) }
    }
    public static func start(_ campaign: Campaign, sceneIndex: Int) -> ConversationSnapshot {
        let index = min(max(0, sceneIndex), campaign.scenes.count - 1)
        var snapshot = ConversationSnapshot(turns: [.init(role: "assistant", content: campaign.scenes[index].opener)], openerIndices: [0])
        snapshot.sceneIndex = index
        snapshot.sceneOffset = index
        return snapshot
    }
    public static func nextScene(_ campaign: Campaign, rows: [PracticeStarRow]) -> Int {
        campaign.scenes.firstIndex { stars(rows, kind: "scene", key: campaign.id + "/" + $0.id) == 0 } ?? 0
    }
    public static func resume(_ rows: [PracticeStarRow], campaigns: [Campaign]) -> PracticeContinue? {
        var seen: Set<String> = []
        for row in rows.filter({ $0.kind == "scene" }).sorted(by: { $0.lastPlayedAt > $1.lastPlayedAt }) {
            let id = String(row.itemKey.split(separator: "/").first ?? "")
            guard seen.insert(id).inserted, let c = campaigns.first(where: { $0.id == id }) else { continue }
            if let i = c.scenes.firstIndex(where: { stars(rows, kind: "scene", key: id + "/" + $0.id) == 0 }) {
                return PracticeContinue(campaignID: id, sceneIndex: i)
            }
        }
        return nil
    }
    public static func tally(_ rows: [PracticeStarRow], scenarios: [Scenario], campaigns: [Campaign]) -> (earned: Int, total: Int) {
        let keys = scenarios.map { ("scenario", $0.id) } + campaigns.flatMap { c in c.scenes.map { ("scene", c.id + "/" + $0.id) } }
        return (keys.reduce(0) { $0 + stars(rows, kind: $1.0, key: $1.1) }, keys.count * 3)
    }
    public static var sceneRoomNames: Set<String> { Set(rooms.values) }
    public static func room(campaignID: String, sceneID: String) -> String { rooms[campaignID + "/" + sceneID] ?? "room-light" }
    private static let rooms: [String: String] = ["city-day/coffee-stop": "coffee", "city-day/directions": "directions", "city-day/small-talk": "market", "first-week-job/job-meet-team": "office", "first-week-job/job-find-way": "interview", "first-week-job/job-lunch-order": "restaurant", "first-week-job/job-coffee-chat": "coffee", "doctors-visit/doctor-book-phone": "bedroom", "doctors-visit/doctor-symptoms": "doctor", "doctors-visit/doctor-pharmacy": "returns", "train-trip/train-buy-ticket": "station", "train-trip/train-delay-help": "station", "train-trip/train-hotel-checkin": "hotel", "new-flat/flat-viewing": "apartment", "new-flat/flat-broken-heater": "kitchen", "new-flat/flat-neighbour": "directions", "market-day/market-plan-picnic": "smalltalk", "market-day/market-buy-food": "market", "market-day/market-picnic": "garden", "dinner-guest/dinner-arrive": "kitchen", "dinner-guest/dinner-table": "dining", "dinner-guest/dinner-goodbye": "apartment", "lost-bag/lost-ask-driver": "station", "lost-bag/lost-property-office": "returns", "lost-bag/lost-tell-friend": "smalltalk", "refund-return/refund-shop": "returns", "refund-return/refund-parcel": "techshop", "refund-return/refund-opinion": "coffee"]
    private static let focus: [String: [String]] = ["coffee": ["question-formation", "articles", "plurals", "modal-verbs", "conditionals"], "airport": ["question-formation", "prepositions", "pronouns", "spelling"], "smalltalk": ["question-formation", "pronouns", "subject-verb-agreement", "word-order"], "hotel": ["modal-verbs", "prepositions", "articles", "spelling", "phrasal-verbs"], "directions": ["prepositions", "word-order", "question-formation"], "returns": ["past-tense", "negation", "pronouns", "vocabulary-choice", "comparatives"], "interview": ["past-tense", "comparatives", "phrasal-verbs", "word-order", "vocabulary-choice"], "doctor": ["past-tense", "subject-verb-agreement", "prepositions", "negation", "pronouns"], "restaurant": ["modal-verbs", "articles", "plurals", "conditionals"], "apartment": ["question-formation", "comparatives", "conditionals", "prepositions", "spelling"], "negotiation": ["conditionals", "modal-verbs", "comparatives", "vocabulary-choice"], "debate": ["comparatives", "conditionals", "negation", "phrasal-verbs", "word-order"]]
}
