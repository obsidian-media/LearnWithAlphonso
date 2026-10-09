import XCTest
@testable import LearnWithAlphonsoKit

final class DeadLetterNoticeTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let suite = "DeadLetterNoticeTests-" + UUID().uuidString
        let d = UserDefaults(suiteName: suite)!
        d.removePersistentDomain(forName: suite)
        return d
    }

    func testNothingToShowWithoutDeadLetters() {
        XCTAssertNil(DeadLetterNotice.message(count: 0))
        XCTAssertEqual(DeadLetterNotice.visible(lessonIdentities: [], dismissed: []), [])
    }

    func testOneAndManyCopy() {
        XCTAssertEqual(DeadLetterNotice.message(count: 1), "1 lesson couldn't be saved. Contact support.")
        XCTAssertEqual(DeadLetterNotice.message(count: 3), "3 lessons couldn't be saved. Contact support.")
    }

    func testDismissedOnesAreHiddenAndOthersStay() {
        let d = DeadLetterDismissals(defaults: defaults())
        d.dismiss(["a"])
        XCTAssertEqual(DeadLetterNotice.visible(lessonIdentities: ["b", "a"], dismissed: d.dismissed), ["b"])
    }

    func testANewDeadLetterAfterDismissalShowsAgain() {
        let d = DeadLetterDismissals(defaults: defaults())
        d.dismiss(["a"])
        let visible = DeadLetterNotice.visible(lessonIdentities: ["c", "a"], dismissed: d.dismissed)
        XCTAssertEqual(visible, ["c"])
        XCTAssertEqual(DeadLetterNotice.message(count: visible.count), "1 lesson couldn't be saved. Contact support.")
    }

    /// Dismissing is a view preference: the records (owned by SyncQueueStore) are what support needs, so
    /// nothing here removes or rewrites them, and pruning only forgets dismissals whose record is gone.
    func testDismissalKeepsTheRecordsAndPruneOnlyForgetsGoneOnes() {
        let d = DeadLetterDismissals(defaults: defaults())
        let live = ["a", "b"]
        d.dismiss(["a", "gone"])
        d.prune(keeping: live)
        XCTAssertEqual(d.dismissed, ["a"])
    }

    /// Two separate dismissals both stay: dismissing adds to the set, it never replaces it.
    func testSeparateDismissalsAccumulate() {
        let d = DeadLetterDismissals(defaults: defaults())
        d.dismiss(["a"])
        d.dismiss(["b"])
        XCTAssertEqual(d.dismissed, ["a", "b"])
    }

    func testSignOutClearsDismissals() {
        let store = defaults()
        DeadLetterDismissals(defaults: store).dismiss(["a"])
        AccountLocalCaches(defaults: store).clear()
        XCTAssertEqual(DeadLetterDismissals(defaults: store).dismissed, [])
        XCTAssertTrue(AccountCacheKeys.all.contains(DeadLetterDismissals.key))
    }

    func testTheSupportEmailCarriesWhatSupportNeeds() throws {
        let url = try XCTUnwrap(DeadLetterNotice.supportMailURL(identities: ["fra1p1l1|fr|1760000000.0"], reasons: ["lesson-version-mismatch"], appVersion: "1.0 (50)"))
        let s = url.absoluteString
        XCTAssertTrue(s.hasPrefix("mailto:support@alphonsoecosystem.app?"), s)
        let items = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(items.first { $0.name == "subject" }?.value, "A lesson couldn't be saved")
        let body = try XCTUnwrap(items.first { $0.name == "body" }?.value)
        XCTAssertTrue(body.contains("fra1p1l1|fr|1760000000.0 (lesson-version-mismatch)"), body)
        XCTAssertTrue(body.contains("App: 1.0 (50)"), body)
        XCTAssertFalse(s.contains(" "), "spaces must be percent-encoded")
    }

    func testNoCopyContainsADoubleDash() {
        for s in [DeadLetterNotice.message(count: 1)!, DeadLetterNotice.message(count: 2)!, DeadLetterNotice.contactTitle, DeadLetterNotice.dismissTitle] {
            XCTAssertFalse(s.contains("--"), s)
        }
    }
}
