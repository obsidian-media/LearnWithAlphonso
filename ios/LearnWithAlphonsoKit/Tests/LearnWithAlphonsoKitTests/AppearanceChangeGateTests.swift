import XCTest
@testable import LearnWithAlphonsoKit

final class AppearanceChangeGateTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func testTheFirstReadingIsApplied() {
        var gate = AppearanceChangeGate()
        XCTAssertTrue(gate.offer(.dark, at: t0))
        XCTAssertEqual(gate.current, .dark)
    }

    func testTheSameReadingIsNotReapplied() {
        var gate = AppearanceChangeGate()
        _ = gate.offer(.light, at: t0)
        XCTAssertFalse(gate.offer(.light, at: t0.addingTimeInterval(1)))
    }

    func testARealChangeIsApplied() {
        var gate = AppearanceChangeGate()
        _ = gate.offer(.light, at: t0)
        XCTAssertTrue(gate.offer(.dark, at: t0.addingTimeInterval(30)))
        XCTAssertEqual(gate.current, .dark)
    }

    /// Build 38: an appearance read fed back into .preferredColorScheme and flipped thousands of times a
    /// second until the watchdog killed the launch. Whatever the cause of a future loop, it stops here.
    func testAFeedbackLoopIsCutOffAfterFourFlips() {
        var gate = AppearanceChangeGate()
        var applied = 0
        for i in 0..<1000 {
            if gate.offer(i % 2 == 0 ? .dark : .light, at: t0.addingTimeInterval(Double(i) * 0.001)) { applied += 1 }
        }
        XCTAssertEqual(applied, 5) // the first reading plus four flips
        XCTAssertTrue(gate.isTripped)
    }

    func testChangesSpreadOverTimeAlwaysApply() {
        var gate = AppearanceChangeGate()
        var applied = 0
        for i in 0..<20 {
            if gate.offer(i % 2 == 0 ? .dark : .light, at: t0.addingTimeInterval(Double(i) * 10)) { applied += 1 }
        }
        XCTAssertEqual(applied, 20)
        XCTAssertFalse(gate.isTripped)
    }

    /// A tripped gate stays tripped with time alone: only `rearm()` (return to the foreground) clears it.
    func testATrippedGateStaysTrippedWithoutRearm() {
        var gate = AppearanceChangeGate()
        for i in 0..<20 { _ = gate.offer(i % 2 == 0 ? .dark : .light, at: t0.addingTimeInterval(Double(i) * 0.01)) }
        XCTAssertTrue(gate.isTripped)
        let next: AppearanceChangeGate.Appearance = gate.current == .dark ? .light : .dark
        XCTAssertFalse(gate.offer(next, at: t0.addingTimeInterval(3)))
        XCTAssertTrue(gate.isTripped)
    }

    func testRearmAllowsChangesAgainAfterATrip() {
        var gate = AppearanceChangeGate()
        for i in 0..<20 { _ = gate.offer(i % 2 == 0 ? .dark : .light, at: t0.addingTimeInterval(Double(i) * 0.01)) }
        XCTAssertTrue(gate.isTripped)
        gate.rearm()
        let next: AppearanceChangeGate.Appearance = gate.current == .dark ? .light : .dark
        XCTAssertTrue(gate.offer(next, at: t0.addingTimeInterval(60)))
    }
}
