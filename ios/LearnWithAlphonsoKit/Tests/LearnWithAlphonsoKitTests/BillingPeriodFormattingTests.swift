import XCTest
@testable import LearnWithAlphonsoKit

final class BillingPeriodFormattingTests: XCTestCase {
    func testSingleUnitPeriodsReadAsAdverbs() {
        XCTAssertEqual(billingPeriodDescription(unit: .day, value: 1), "Billed daily")
        XCTAssertEqual(billingPeriodDescription(unit: .week, value: 1), "Billed weekly")
        XCTAssertEqual(billingPeriodDescription(unit: .month, value: 1), "Billed monthly")
        XCTAssertEqual(billingPeriodDescription(unit: .year, value: 1), "Billed yearly")
    }

    func testMultiUnitPeriodsSpellOutTheCount() {
        XCTAssertEqual(billingPeriodDescription(unit: .month, value: 3), "Billed every 3 months")
        XCTAssertEqual(billingPeriodDescription(unit: .year, value: 2), "Billed every 2 years")
        XCTAssertEqual(billingPeriodDescription(unit: .week, value: 2), "Billed every 2 weeks")
    }

    /// A malformed/zero-value period (should never come from StoreKit, but
    /// this must never crash or divide by zero if it ever does) falls back
    /// to the plural phrasing rather than "Billed every 0 months".
    func testZeroValueFallsBackToPluralPhrasing() {
        XCTAssertEqual(billingPeriodDescription(unit: .month, value: 0), "Billed every 0 months")
    }

    // Paywall trial disclosure (2026-09-29 pre-submission audit): the
    // subscription has a free trial, and the paywall must say how long it
    // lasts before the button that starts it.
    func testFreeTrialLengthReadsAsACountedDuration() {
        XCTAssertEqual(freeTrialDescription(unit: .week, value: 2), "2-week free trial")
        XCTAssertEqual(freeTrialDescription(unit: .day, value: 14), "14-day free trial")
        XCTAssertEqual(freeTrialDescription(unit: .month, value: 1), "1-month free trial")
        XCTAssertEqual(freeTrialDescription(unit: .year, value: 1), "1-year free trial")
    }
}
