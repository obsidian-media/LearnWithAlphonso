import XCTest
@testable import LearnWithAlphonsoKit

final class SupportLinksTests: XCTestCase {
    func testTheAllowedIdsAndTheirChipTextMatchTheWeb() {
        XCTAssertEqual(SupportLinkID.allCases.map(\.rawValue), ["subscription", "ai-features", "settings", "league"])
        XCTAssertEqual(SupportLinkID.subscription.label, "Open the subscription screen")
        XCTAssertEqual(SupportLinkID.aiFeatures.label, "Open AI features")
        XCTAssertEqual(SupportLinkID.settings.label, "Open Settings")
        XCTAssertEqual(SupportLinkID.league.label, "Open your league")
    }

    func testAnAiBodyLosesItsTrailingMarkerAndGainsTheLink() {
        let split = SupportLinks.split("Tap Restore Purchases.\n\n[[link:subscription]]")
        XCTAssertEqual(split.text, "Tap Restore Purchases.")
        XCTAssertEqual(split.link, .subscription)
    }

    func testAnUnknownIdLeavesNoLinkButTheMarkerStillNeverShows() {
        let split = SupportLinks.split("Try this.\n\n[[link:https-evil]]")
        XCTAssertEqual(split.text, "Try this.")
        XCTAssertNil(split.link)
        let empty = SupportLinks.split("Try this. [[link:]]")
        XCTAssertEqual(empty.text, "Try this.")
        XCTAssertNil(empty.link)
    }

    func testOnlyATrailingMarkerIsAMarker() {
        let text = "Mention [[link:league]] in the middle, then go on."
        XCTAssertEqual(SupportLinks.split(text).text, text)
        XCTAssertNil(SupportLinks.split(text).link)
    }

    func testTheMarkerIsReadOnAiRowsOnly() {
        let body = "I typed this myself.\n\n[[link:subscription]]"
        // A learner who types the marker gets their own text back, never a link.
        let you = SupportLinks.present(kind: .you, body: body, linkField: "subscription")
        XCTAssertEqual(you.body, body)
        XCTAssertNil(you.link)
        // A staff reply is shown as written.
        let support = SupportLinks.present(kind: .support, body: body, linkField: "league")
        XCTAssertEqual(support.body, body)
        XCTAssertNil(support.link)
        let system = SupportLinks.present(kind: .system, body: body, linkField: nil)
        XCTAssertEqual(system.body, body)
        XCTAssertNil(system.link)
        // The same text on an AI row loses the marker and links.
        let ai = SupportLinks.present(kind: .ai, body: body, linkField: nil)
        XCTAssertEqual(ai.body, "I typed this myself.")
        XCTAssertEqual(ai.link, .subscription)
        XCTAssertFalse(ai.body.contains("[[link:"))
    }

    func testTheServersLinkFieldWinsWhenItIsAllowedAndAnUnknownOneIsIgnored() {
        XCTAssertEqual(SupportLinks.present(kind: .ai, body: "Open it.", linkField: "ai-features").link, .aiFeatures)
        XCTAssertNil(SupportLinks.present(kind: .ai, body: "Open it.", linkField: "https://evil.example").link)
        XCTAssertNil(SupportLinks.present(kind: .ai, body: "Open it.", linkField: 7).link)
        // A field that is not allowed falls back to the marker; it never invents a link.
        XCTAssertEqual(SupportLinks.present(kind: .ai, body: "Open it.\n\n[[link:league]]", linkField: "bogus").link, .league)
    }
}
