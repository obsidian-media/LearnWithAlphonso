import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

private final class RecordingSink: AnalyticsSink {
    var captured: [(String, [String: Any])] = []
    var resets = 0
    func capture(_ event: String, properties: [String: Any]) { captured.append((event, properties)) }
    func reset() { resets += 1 }
}

final class AnalyticsTrackerTests: XCTestCase {
    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "AnalyticsTrackerTests.\(UUID().uuidString)")!
    }

    func testNothingIsSentAndTheSinkIsNeverBuiltBeforeConsent() {
        let tracker = AnalyticsTracker(defaults: makeDefaults(), isUnder13: { false })
        var built = 0
        tracker.resume { built += 1; return RecordingSink() }
        tracker.track(.appOpen)
        XCTAssertEqual(built, 0)
        XCTAssertFalse(tracker.hasConsent)
        XCTAssertFalse(tracker.hasAnswered)
    }

    func testEventsFlowAfterOptInWithAllowedPropertiesOnly() {
        let tracker = AnalyticsTracker(defaults: makeDefaults(), isUnder13: { false })
        let sink = RecordingSink()
        tracker.setConsent(true) { sink }
        tracker.track(.lessonStarted, ["lesson_id": "l-1", "level": "A1", "course": "en", "email": "a@b.co"])
        XCTAssertEqual(sink.captured.count, 1)
        XCTAssertEqual(sink.captured[0].0, "lesson_started")
        XCTAssertEqual(Set(sink.captured[0].1.keys), ["lesson_id", "level", "course", "platform"])
    }

    func testOptOutStopsSendingAndResetsTheAnonymousId() {
        let tracker = AnalyticsTracker(defaults: makeDefaults(), isUnder13: { false })
        let sink = RecordingSink()
        tracker.setConsent(true) { sink }
        tracker.setConsent(false) { nil }
        XCTAssertEqual(sink.resets, 1)
        tracker.track(.appOpen)
        XCTAssertTrue(sink.captured.isEmpty)
    }

    func testAnUnder13DeviceNeverSendsEvenWithAStoredOptIn() {
        let defaults = makeDefaults()
        defaults.set("1", forKey: AnalyticsTracker.consentKey)
        let tracker = AnalyticsTracker(defaults: defaults, isUnder13: { true })
        var built = 0
        tracker.resume { built += 1; return RecordingSink() }
        tracker.setConsent(true) { built += 1; return RecordingSink() }
        tracker.track(.appOpen)
        XCTAssertEqual(built, 0)
        XCTAssertFalse(tracker.hasConsent)
    }

    func testEmailLikeAndFreeTextValuesAreDropped() {
        XCTAssertEqual(AnalyticsProperties.sanitize(.lessonStarted, ["lesson_id": "maria@example.com", "level": "hello there friend"]).count, 0)
        XCTAssertEqual(AnalyticsProperties.sanitize(.paywallViewed, ["source": String(repeating: "x", count: 200)]).count, 0)
        XCTAssertEqual(AnalyticsProperties.sanitize(.practiceCallCompleted, ["scenario_id": "cafe", "stars": 3]).count, 2)
        XCTAssertEqual(AnalyticsProperties.sanitize(.practiceCallCompleted, ["scenario_id": "cafe", "stars": "3"]).count, 1)
    }

    func testScoreBuckets() {
        XCTAssertEqual(AnalyticsProperties.scoreBucket(percent: 100), "100")
        XCTAssertEqual(AnalyticsProperties.scoreBucket(percent: 85), "80-99")
        XCTAssertEqual(AnalyticsProperties.scoreBucket(percent: 50), "50-79")
        XCTAssertEqual(AnalyticsProperties.scoreBucket(percent: 10), "0-49")
    }
}
