import XCTest
@testable import LearnWithAlphonsoKit

/// Each test names the change in SceneScrollTracker that turns it red (mutation pairs).
final class SceneScrollTrackerTests: XCTestCase {
    /// Red if `moved` stops updating the offset while the probe row is on screen.
    func testAProbeMoveWhileVisibleSetsTheOffset() {
        var t = SceneScrollTracker()
        t.apply(.moved(-40))
        XCTAssertEqual(t.offset, -40)
    }

    /// Red if a position reported while the row is off screen is applied to the offset (a recycled row's position is
    /// not where the list is).
    func testAProbeMoveWhileHiddenDoesNotMoveTheOffset() {
        var t = SceneScrollTracker()
        t.apply(.moved(0))
        t.apply(.disappeared)
        t.apply(.moved(-900))
        XCTAssertEqual(t.offset, 0)
        XCTAssertFalse(t.probeVisible)
    }

    /// The reported bug: the list was scrolled away and came back to the top. SwiftUI reports the row's position
    /// BEFORE `appeared`, and an unchanged position is never reported again, so the old offset stayed and the
    /// greeting bubble stayed hidden at the top. Red if `appeared` stops applying the last position seen.
    func testTheProbeComingBackAtTheTopRestoresTheOffsetEvenWhenItsPositionWasReportedFirst() {
        var t = SceneScrollTracker()
        t.apply(.moved(0))
        t.apply(.moved(-300))
        t.apply(.disappeared)
        // Back at the top: position first (ignored while hidden), then the appearance.
        t.apply(.moved(0))
        XCTAssertEqual(t.offset, -300)
        t.apply(.appeared)
        XCTAssertEqual(t.offset, 0)
        XCTAssertTrue(t.probeVisible)
    }

    /// Red if the probe is still listened to after the scroll view itself has reported.
    func testOnceTheScrollViewReportsTheProbeIsIgnored() {
        var t = SceneScrollTracker()
        t.apply(.scrolled(-10))
        XCTAssertTrue(t.scrollDriven)
        t.apply(.moved(-500))
        t.apply(.disappeared)
        t.apply(.moved(-700))
        t.apply(.appeared)
        XCTAssertEqual(t.offset, -10)
    }

    /// Red if `appeared` applies a remembered probe position over the scroll view's own offset.
    func testAppearedNeverOverridesAScrollDrivenOffset() {
        var t = SceneScrollTracker()
        t.apply(.moved(-5))
        t.apply(.scrolled(-80))
        t.apply(.appeared)
        XCTAssertEqual(t.offset, -80)
    }

    func testNothingReportedMeansNoOffset() {
        var t = SceneScrollTracker()
        t.apply(.appeared)
        XCTAssertNil(t.offset)
    }
}
