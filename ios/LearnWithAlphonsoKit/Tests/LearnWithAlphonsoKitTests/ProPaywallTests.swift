import XCTest
@testable import LearnWithAlphonsoKit

/// The round-6 paywall's logic: what it says about the trial, the first payment, the per-month price and the
/// saving. All of it comes from the product values, never from typed-in numbers.
final class ProPaywallTests: XCTestCase {
    private let year = BillingPeriod(unit: .year, value: 1)
    private let month = BillingPeriod(unit: .month, value: 1)
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }
    private let en = Locale(identifier: "en_US")

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        utc.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    private func product(id: String, price: String, amount: Decimal, period: BillingPeriod,
                         trial: BillingPeriod?, currency: String? = "USD") -> PaywallProduct {
        PaywallProduct(id: id, localizedTitle: "Alphonso Pro", localizedPriceString: price, price: amount,
                       period: period, eligibleFreeTrial: trial, currencyCode: currency)
    }

    private func offer(trial: BillingPeriod?) -> [PaywallProduct] {
        [product(id: "m", price: "$10.00", amount: 10, period: month, trial: nil),
         product(id: "y", price: "$60.00", amount: 60, period: year, trial: trial)]
    }

    private func make(_ products: [PaywallProduct], selected: String? = nil) -> PaywallPresentation {
        PaywallPresentation.make(.loaded(products), selectedProductID: selected,
                                 now: date(2026, 11, 7), calendar: utc, locale: en)
    }

    // MARK: trial line hidden when not eligible

    func testNoTrialMeansNoTrialLineNoTrialNoteAndSubscribeButton() {
        let p = make(offer(trial: nil))
        XCTAssertNil(p.trialLine)
        XCTAssertEqual(p.ctaTitle, "Subscribe")
        XCTAssertTrue(p.options.allSatisfy { $0.trialNote == nil })
        let all = [p.whenLine?.lead, p.whenLine?.rest, p.renewalDisclosure].compactMap { $0 }.joined(separator: " ").lowercased()
        XCTAssertFalse(all.contains("trial"), all)
        XCTAssertFalse(all.contains("free"), all)
        XCTAssertFalse(all.contains("pay nothing"), all)
    }

    func testEligibleTrialShowsTrialLineAndStartFreeTrial() {
        let p = make(offer(trial: BillingPeriod(unit: .day, value: 7)))
        XCTAssertEqual(p.trialLine, "Free for 7 days, then $60.00/year")
        XCTAssertEqual(p.ctaTitle, "Start free trial")
    }

    // MARK: price at least as prominent as trial

    func testPriceIsAtLeastAsProminentAsTheTrial() {
        let p = make(offer(trial: BillingPeriod(unit: .day, value: 7)))
        XCTAssertGreaterThanOrEqual(p.priceStyle.pointSize, p.trialStyle.pointSize)
        XCTAssertGreaterThanOrEqual(p.priceStyle.weight, p.trialStyle.weight)
        // The "when" row's body text is smaller than both, so it can never out-shout the price.
        XCTAssertGreaterThan(p.priceStyle.pointSize, PaywallTextStyle.whenBody.pointSize)
    }

    // MARK: first payment date from the offer period

    func testFirstPaymentDateIsTodayPlusTheOffersPeriod() {
        let now = date(2026, 11, 7)
        XCTAssertEqual(PaywallDates.firstPaymentDate(now: now, trial: BillingPeriod(unit: .day, value: 7), calendar: utc),
                       date(2026, 11, 14))
        XCTAssertEqual(PaywallDates.firstPaymentDate(now: now, trial: BillingPeriod(unit: .week, value: 2), calendar: utc),
                       date(2026, 11, 21))
        XCTAssertEqual(PaywallDates.firstPaymentDate(now: now, trial: BillingPeriod(unit: .month, value: 1), calendar: utc),
                       date(2026, 12, 7))
        XCTAssertEqual(PaywallDates.firstPaymentDate(now: now, trial: nil, calendar: utc), now)
    }

    func testWhenLineNamesTheExactDateFromThePeriodNotATypedNumber() {
        let week = make(offer(trial: BillingPeriod(unit: .week, value: 1)))
        XCTAssertEqual(week.whenLine?.lead, "Nothing to pay today.")
        XCTAssertEqual(week.whenLine?.rest, "First payment on November 14. Cancel before then and you pay nothing.")
        let two = make(offer(trial: BillingPeriod(unit: .week, value: 2)))
        XCTAssertEqual(two.whenLine?.rest, "First payment on November 21. Cancel before then and you pay nothing.")
    }

    func testWhenLineShowsTheYearWhenItIsNotThisYear() {
        let p = PaywallPresentation.make(.loaded(offer(trial: BillingPeriod(unit: .month, value: 2))),
                                         now: date(2026, 12, 20), calendar: utc, locale: en)
        XCTAssertEqual(p.whenLine?.rest, "First payment on February 20, 2027. Cancel before then and you pay nothing.")
    }

    func testWhenLineWithoutTrialIsFirstPaymentToday() {
        let p = make(offer(trial: nil))
        XCTAssertEqual(p.whenLine?.lead, "First payment today, when you confirm.")
    }

    // MARK: per month and saving from the prices

    func testPerMonthAndSavingAreComputedFromProductPrices() {
        let p = make(offer(trial: nil))
        let yearly = p.options.first { $0.id == "y" }
        XCTAssertEqual(yearly?.perMonthLine, "$5.00 a month")
        XCTAssertEqual(yearly?.savingsLine, "Save 50%")
        XCTAssertEqual(p.options.first { $0.id == "m" }?.perMonthLine, "per month")
    }

    func testPerMonthFollowsAnotherPriceAndCurrency() {
        let products = [product(id: "m", price: "€4,00", amount: 4, period: month, trial: nil, currency: "EUR"),
                        product(id: "y", price: "€24,00", amount: 24, period: year, trial: nil, currency: "EUR")]
        let y = make(products).options.first { $0.id == "y" }
        XCTAssertEqual(y?.perMonthLine, "€2.00 a month")
        XCTAssertEqual(y?.savingsLine, "Save 50%")
    }

    func testUnknownCurrencyShowsNoInventedNumber() {
        let products = [product(id: "m", price: "10", amount: 10, period: month, trial: nil, currency: nil),
                        product(id: "y", price: "60", amount: 60, period: year, trial: nil, currency: nil)]
        XCTAssertEqual(make(products).options.first { $0.id == "y" }?.perMonthLine, "per year")
    }

    // MARK: example call, openers, card name

    func testExampleCallIsInTheCourseLanguage() {
        XCTAssertEqual(ProPaywallContent.exampleCall(for: .spanish).recalled, "“soy cansado”")
        XCTAssertEqual(ProPaywallContent.exampleCall(for: .french).recalled, "“je suis faim”")
        XCTAssertEqual(ProPaywallContent.exampleCall(for: .english).recalled, "“I am agree”")
        XCTAssertEqual(ProPaywallContent.openers(for: .spanish).count, 3)
    }

    func testCardNameIsFirstNameAndNeverAGeneratedHandle() {
        XCTAssertEqual(ProPaywallContent.cardFirstName("Maria Lopez"), "Maria")
        XCTAssertNil(ProPaywallContent.cardFirstName("Learner-4F2A"))
        XCTAssertNil(ProPaywallContent.cardFirstName("  "))
        XCTAssertNil(ProPaywallContent.cardFirstName(nil))
    }

    func testNoDailyNumberAnywhereInProCopy() {
        let all = ProPaywallCopy.allText.joined(separator: " ").lowercased()
        XCTAssertTrue(all.contains("a long conversation every day"))
        XCTAssertNil(all.range(of: #"\d+\s*(minutes?|min|calls?|messages?)"#, options: .regularExpression))
    }
}
