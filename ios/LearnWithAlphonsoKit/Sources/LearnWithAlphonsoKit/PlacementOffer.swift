import Foundation

/// Whether to offer the placement test now (owner decision, "option 1"). Everyone who said they know "some" or are
/// "confident" and have not taken it is offered it, right after a Hector call and as a prominent card at the top of
/// Learn. True beginners ("new") are not pushed; they keep the small card on Learn. "Not now" hides the Hector-end
/// prompt for that course (kept on this device) and quietens the Learn card. The same rule is on the web
/// (placementOffer in src/lib/placement-offer.ts) and in the Android core (PlacementOffer); keep the three in step.
public enum PlacementOffer {
    public enum Surface: Sendable { case hectorEnd, learn }
    public enum Style: Equatable, Sendable { case none, prominent, quiet }

    public static func style(level: String?, placementTaken: Bool, dismissed: Bool, surface: Surface) -> Style {
        if placementTaken { return .none }
        let wantsIt = level == "some" || level == "confident"
        switch surface {
        case .hectorEnd: return wantsIt && !dismissed ? .prominent : .none
        case .learn: return wantsIt && !dismissed ? .prominent : .quiet
        }
    }

    /// The UserDefaults key that remembers "Not now" for a course.
    public static func dismissKey(course: String) -> String { "placementOfferDismissed.v1.\(course)" }

    public static let title = "Find your level"
    public static let body = "A 5-minute placement test sets your level so lessons start in the right place."
    public static let start = "Start"
    public static let notNow = "Not now"
}
