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
}
