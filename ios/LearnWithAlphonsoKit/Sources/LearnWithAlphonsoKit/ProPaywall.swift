import Foundation

/// Wording and logic for the round-6 Alphonso Pro paywall (the approved "Mix: A's story, B's card"; the web
/// version is `src/lib/paywall-copy.ts`). No price, currency, trial, saving or daily number lives here: those are
/// worked out from the store products, and the daily allowance is "a long conversation every day".
public struct PaywallWhenLine: Sendable, Equatable {
    public let lead: String
    public let rest: String
}

public enum PaywallDates {
    /// When the first payment is taken: the offer's period after now, or now when there is no trial.
    public static func firstPaymentDate(now: Date, trial: BillingPeriod?, calendar: Calendar) -> Date {
        guard let trial, trial.value >= 1 else { return now }
        let component: Calendar.Component
        switch trial.unit {
        case .day: component = .day
        case .week: component = .weekOfYear
        case .month: component = .month
        case .year: component = .year
        }
        return calendar.date(byAdding: component, value: trial.value, to: now) ?? now
    }

    /// "November 14", or "February 20, 2027" when it is not this year.
    static func paymentDay(_ date: Date, now: Date, calendar: Calendar, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        formatter.setLocalizedDateFormatFromTemplate(sameYear ? "dMMMM" : "dMMMMyyyy")
        return formatter.string(from: date)
    }

    /// The dashed "when do I pay" row. Without an eligible trial it never mentions one.
    public static func whenLine(trial: BillingPeriod?, now: Date, calendar: Calendar, locale: Locale) -> PaywallWhenLine {
        guard let trial, trial.value >= 1 else {
            return PaywallWhenLine(lead: "First payment today, when you confirm.",
                                   rest: "Cancel any time and it stops the next renewal.")
        }
        let day = paymentDay(firstPaymentDate(now: now, trial: trial, calendar: calendar), now: now,
                             calendar: calendar, locale: locale)
        return PaywallWhenLine(lead: "Nothing to pay today.",
                               rest: "First payment on \(day). Cancel before then and you pay nothing.")
    }
}

public enum PaywallPricing {
    /// A yearly plan's price per month in its own currency, or the period's own words when that cannot be
    /// worked out (no currency code, or a plan that is not a year).
    public static func perMonthLine(_ product: PaywallProduct, locale: Locale) -> String {
        guard let period = product.period else { return "" }
        if PaywallPresentation.isYearly(period), let code = product.currencyCode, product.price > 0 {
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.currencyCode = code
            formatter.locale = Locale(identifier: "en")
            if let text = formatter.string(from: NSDecimalNumber(decimal: product.price / 12)) {
                return "\(text) a month"
            }
        }
        if period.value == 1 {
            switch period.unit {
            case .day: return "per day"
            case .week: return "per week"
            case .month: return "per month"
            case .year: return "per year"
            }
        }
        return PaywallPresentation.planTitle(period).lowercased()
    }
}

public struct ProExampleCall: Sendable, Equatable {
    public let before: String
    public let recalled: String
    public let after: String
    public let reply: String
    public let praise: String
}

public enum ProPaywallCopy {
    public static let kicker = "Alphonso Pro"
    public static let headlineLead = "A tutor who "
    public static let headlineMark = "remembers you"
    public static let headlineEnd = "."
    public static let exampleLabel = "Example call"
    public static let factsLabel = "What Pro gives you"
    public static let facts: [(title: String, detail: String)] = [
        ("Any topic", "no script"),
        ("Remembers", "your weak spots"),
        ("Every day", "a long conversation"),
    ]
    public static let factsSpoken = "Any topic, no script. Remembers your weak spots. A long conversation every day."
    public static let freeLabel = "Free for everyone"
    public static let freeItems = ["Lessons", "Alphonso calls", "Audio", "Review"]
    public static let freeNote = "Everything else stays free, always."
    public static let plansLabel = "Choose a plan"
    public static let roomLabel = "Hector in his library"
    public static let welcomeEyebrow = "Welcome to Pro"
    public static let welcomeReady = "Hector's ready."
    public static let welcomeBody = "Start anywhere. He'll remember it next time."
    public static let openersTitle = "Try one of these"
    public static let callHector = "Call Hector"
    public static func welcomeGreeting(name: String?) -> String {
        name.map { "Welcome, \($0)." } ?? "Welcome to Alphonso Pro."
    }

    public static var allText: [String] {
        let courses: [Course] = [.english, .french, .spanish]
        var all = [kicker, headlineLead + headlineMark + headlineEnd, exampleLabel, factsLabel, factsSpoken, freeLabel,
                   freeNote, plansLabel, welcomeEyebrow, welcomeReady, welcomeBody, openersTitle, callHector]
        all += facts.flatMap { [$0.title, $0.detail] }
        all += freeItems
        for course in courses {
            let call = ProPaywallContent.exampleCall(for: course)
            all += [call.before, call.recalled, call.after, call.reply, call.praise]
            all += ProPaywallContent.openers(for: course)
        }
        return all
    }
}

public enum ProPaywallContent {
    /// Hector remembering a past mistake, in the learner's course language (the web's exact calls).
    public static func exampleCall(for course: Course) -> ProExampleCall {
        switch course {
        case .spanish:
            return ProExampleCall(before: "Last week you said ", recalled: "“soy cansado”",
                                  after: ". How are you feeling today?", reply: "Estoy cansado, pero feliz.",
                                  praise: "¡Perfecto! Estar for feelings. Nailed it.")
        case .french:
            return ProExampleCall(before: "Last week you said ", recalled: "“je suis faim”",
                                  after: ". Are you hungry today?", reply: "Oui, j'ai faim !",
                                  praise: "Parfait ! Avoir for hunger. Nailed it.")
        case .english:
            return ProExampleCall(before: "Last week you said ", recalled: "“I am agree”",
                                  after: ". What do you think of the plan?", reply: "I agree, it's a great plan.",
                                  praise: "Perfect! Just “I agree”. Nailed it.")
        }
    }

    /// Three easy first lines for the welcome screen.
    public static func openers(for course: Course) -> [String] {
        let middle: String
        switch course {
        case .spanish: middle = "“Help me practise ser and estar”"
        case .french: middle = "“Help me practise tu and vous”"
        case .english: middle = "“Help me practise the present perfect”"
        }
        return ["“Tell me about your weekend”", middle, "“Let's chat about a film I like”"]
    }

    /// The first name for the Pro card, or nil for a generated Learner-XXXX handle or no name.
    public static func cardFirstName(_ displayName: String?) -> String? {
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty, !DisplayNameOnboarding.isLearnerHandle(name) else { return nil }
        return name.split(whereSeparator: \.isWhitespace).first.map(String.init)
    }
}
