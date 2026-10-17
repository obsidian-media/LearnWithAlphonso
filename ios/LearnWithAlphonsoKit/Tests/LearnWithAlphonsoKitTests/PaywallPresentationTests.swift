import XCTest
@testable import LearnWithAlphonsoKit

final class PaywallPresentationTests: XCTestCase {
    private let monthly = BillingPeriod(unit: .month, value: 1)
    private let twoWeeks = BillingPeriod(unit: .week, value: 2)

    private func product(
        title: String = "Alphonso Pro",
        price: String = "$9.99",
        amount: Decimal = Decimal(string: "9.99")!,
        period: BillingPeriod? = BillingPeriod(unit: .month, value: 1),
        trial: BillingPeriod? = BillingPeriod(unit: .week, value: 2),
        id: String = "com.obsidianmedia.learnwithalphonso.pro.monthly"
    ) -> PaywallProduct {
        PaywallProduct(
            id: id,
            localizedTitle: title,
            localizedPriceString: price,
            price: amount,
            period: period,
            eligibleFreeTrial: trial
        )
    }

    private var yearlyProduct: PaywallProduct {
        product(price: "$79.99", amount: Decimal(string: "79.99")!, period: BillingPeriod(unit: .year, value: 1),
                trial: nil, id: "com.obsidianmedia.learnwithalphonso.pro.yearly")
    }

    // MARK: - Plans

    func testOnePlanShowsNoPicker() {
        XCTAssertEqual(PaywallPresentation.make(.loaded([product()])).options, [])
    }

    func testTwoPlansListYearlyFirstWithItsSavingAndDefaultToYearly() {
        let p = PaywallPresentation.make(.loaded([product(), yearlyProduct]))
        XCTAssertEqual(p.productID, "com.obsidianmedia.learnwithalphonso.pro.yearly")
        XCTAssertEqual(p.options.map(\.title), ["Yearly", "Monthly"])
        XCTAssertEqual(p.options.map(\.priceLine), ["$79.99 / year", "$9.99 / month"])
        // 12 x 9.99 = 119.88; 79.99 saves 33.27%, shown rounded down.
        XCTAssertEqual(p.options.map(\.savingsLine), ["Save 33%", nil])
        XCTAssertEqual(p.options.map(\.isSelected), [true, false])
        XCTAssertEqual(p.priceLine, "$79.99 / year")
        XCTAssertNil(p.trialLine, "the yearly plan has no trial, so none is promised")
        XCTAssertTrue(p.renewalDisclosure.contains("$79.99/year"), p.renewalDisclosure)
    }

    func testThePickedPlanDrivesEveryLine() {
        let p = PaywallPresentation.make(.loaded([product(), yearlyProduct]),
                                         selectedProductID: "com.obsidianmedia.learnwithalphonso.pro.monthly")
        XCTAssertEqual(p.productID, "com.obsidianmedia.learnwithalphonso.pro.monthly")
        XCTAssertEqual(p.priceLine, "$9.99 / month")
        XCTAssertEqual(p.trialLine, "Free for 2 weeks, then $9.99/month")
        XCTAssertEqual(p.options.map(\.isSelected), [false, true])
    }

    func testAnUnknownPickFallsBackToTheDefault() {
        XCTAssertEqual(PaywallPresentation.make(.loaded([product(), yearlyProduct]), selectedProductID: "gone").productID,
                       "com.obsidianmedia.learnwithalphonso.pro.yearly")
    }

    func testNoSavingIsClaimedWhenTheYearlyPlanIsNotCheaper() {
        let pricey = product(price: "$129.99", amount: Decimal(string: "129.99")!,
                             period: BillingPeriod(unit: .year, value: 1), trial: nil, id: "y")
        XCTAssertNil(PaywallPresentation.make(.loaded([product(), pricey])).options.first?.savingsLine)
        let tiny = product(price: "$116.99", amount: Decimal(string: "116.99")!,
                           period: BillingPeriod(unit: .year, value: 1), trial: nil, id: "y2")
        XCTAssertNil(PaywallPresentation.make(.loaded([product(), tiny])).options.first?.savingsLine,
                     "under 5% is not worth a badge")
    }

    // MARK: - Strings

    func testTrialEligibleMonthlyReadsExactlyAsSpecified() {
        let p = PaywallPresentation.make(.loaded([product()]))
        XCTAssertEqual(p.state, .loaded)
        XCTAssertEqual(p.productID, "com.obsidianmedia.learnwithalphonso.pro.monthly")
        XCTAssertEqual(p.titleText, "Alphonso Pro")
        XCTAssertEqual(p.priceLine, "$9.99 / month")
        XCTAssertEqual(p.trialLine, "Free for 2 weeks, then $9.99/month")
        XCTAssertEqual(p.ctaTitle, "Start free trial")
        XCTAssertEqual(
            p.renewalDisclosure,
            "After the free trial, Alphonso Pro renews automatically at $9.99/month until you cancel. Payment is charged to your Apple Account when the trial ends. Cancel in your Apple Account settings at least 24 hours before the trial or any period ends."
        )
        XCTAssertNil(p.retryTitle)
    }

    func testWithoutAnEligibleTrialThereIsNoTrialLineAndTheCTASaysSubscribe() {
        let p = PaywallPresentation.make(.loaded([product(trial: nil)]))
        XCTAssertNil(p.trialLine)
        XCTAssertEqual(p.priceLine, "$9.99 / month")
        XCTAssertEqual(p.ctaTitle, "Subscribe")
        XCTAssertEqual(
            p.renewalDisclosure,
            "Alphonso Pro renews automatically at $9.99/month until you cancel. Payment is charged to your Apple Account when you confirm the purchase. Cancel in your Apple Account settings at least 24 hours before the current period ends."
        )
    }

    /// The paywall shows the StoreKit product title, not a second hardcoded name.
    func testTheTitleIsTheStoreKitTitle() {
        let p = PaywallPresentation.make(.loaded([product(title: "Alphonso Pro Monthly")]))
        XCTAssertEqual(p.titleText, "Alphonso Pro Monthly")
        XCTAssertTrue(p.renewalDisclosure.hasPrefix("After the free trial, Alphonso Pro Monthly renews"))
    }

    func testABlankStoreKitTitleFallsBackToTheProductName() {
        XCTAssertEqual(PaywallPresentation.make(.loaded([product(title: "  ")])).titleText, "Alphonso Pro")
    }

    func testOtherStorefrontsUseTheirOwnPriceStringVerbatim() {
        let p = PaywallPresentation.make(.loaded([product(price: "9,99 €")]))
        XCTAssertEqual(p.priceLine, "9,99 € / month")
        XCTAssertEqual(p.trialLine, "Free for 2 weeks, then 9,99 €/month")
    }

    func testMultiUnitPeriodsAndTrialsSpellOutTheCount() {
        let p = PaywallPresentation.make(.loaded([product(
            price: "$24.99", period: BillingPeriod(unit: .month, value: 3), trial: BillingPeriod(unit: .day, value: 14)
        )]))
        XCTAssertEqual(p.priceLine, "$24.99 every 3 months")
        XCTAssertEqual(p.trialLine, "Free for 14 days, then $24.99 every 3 months")

        let yearly = PaywallPresentation.make(.loaded([product(
            price: "$59.99", period: BillingPeriod(unit: .year, value: 1), trial: BillingPeriod(unit: .week, value: 1)
        )]))
        XCTAssertEqual(yearly.priceLine, "$59.99 / year")
        XCTAssertEqual(yearly.trialLine, "Free for 1 week, then $59.99/year")
    }

    // MARK: - States

    func testLoadingShowsNoPriceNoCTAButKeepsTheDisclosure() {
        let p = PaywallPresentation.make(.loading)
        XCTAssertEqual(p.state, .loading)
        XCTAssertNil(p.priceLine)
        XCTAssertNil(p.trialLine)
        XCTAssertNil(p.ctaTitle)
        XCTAssertNil(p.retryTitle)
        XCTAssertEqual(p.titleText, "Alphonso Pro")
        XCTAssertEqual(p.renewalDisclosure, PaywallCopy.genericRenewal)
    }

    func testFailedEmptyAndUnsellableProductsAllOfferARetry() {
        let unsellable: [PaywallLoadState] = [
            .failed,
            .loaded([]),
            .loaded([product(price: " ")]),
            .loaded([product(period: nil)]),
            .loaded([product(period: BillingPeriod(unit: .month, value: 0))]),
        ]
        for load in unsellable {
            let p = PaywallPresentation.make(load)
            XCTAssertEqual(p.state, .failed(message: "Couldn't load subscription options. Check your connection and try again."), "\(load)")
            XCTAssertEqual(p.retryTitle, "Try again", "\(load)")
            XCTAssertNil(p.ctaTitle, "\(load)")
            XCTAssertNil(p.priceLine, "\(load)")
            XCTAssertNil(p.trialLine, "\(load)")
            XCTAssertNil(p.productID, "\(load)")
            XCTAssertFalse(p.renewalDisclosure.isEmpty, "\(load)")
        }
    }

    func testSavingsRoundDownNotToNearest() {
        // 12 x 9.99 = 119.88; 59.99 saves 49.958% -> 49, never 50.
        let y = product(price: "$59.99", amount: Decimal(string: "59.99")!,
                        period: BillingPeriod(unit: .year, value: 1), trial: nil, id: "y")
        XCTAssertEqual(PaywallPresentation.make(.loaded([product(), y])).options.first?.savingsLine, "Save 49%")
    }

    func testFivePercentIsTheThreshold() {
        // 12 x 10 = 120; 114 saves exactly 5%, 114.01 saves 4.99%.
        let monthly10 = product(price: "$10.00", amount: 10)
        let five = product(price: "$114.00", amount: 114, period: BillingPeriod(unit: .year, value: 1), trial: nil, id: "y5")
        let under = product(price: "$114.01", amount: Decimal(string: "114.01")!, period: BillingPeriod(unit: .year, value: 1), trial: nil, id: "y4")
        XCTAssertEqual(PaywallPresentation.make(.loaded([monthly10, five])).options.first?.savingsLine, "Save 5%")
        XCTAssertNil(PaywallPresentation.make(.loaded([monthly10, under])).options.first?.savingsLine)
    }

    func testATwelveMonthPlanIsYearlyEverywhere() {
        let twelve = product(price: "$79.99", amount: Decimal(string: "79.99")!,
                             period: BillingPeriod(unit: .month, value: 12), trial: nil, id: "m12")
        let p = PaywallPresentation.make(.loaded([product(), twelve]))
        XCTAssertEqual(p.options.first?.title, "Yearly")
        XCTAssertEqual(p.options.first?.priceLine, "$79.99 / year")
        XCTAssertEqual(p.priceLine, "$79.99 / year")
    }

    func testATrialOnTheUnselectedPlanIsStillShownOnItsRow() {
        let p = PaywallPresentation.make(.loaded([product(), yearlyProduct]))
        XCTAssertEqual(p.options.map(\.trialNote), [nil, "2-week free trial"])
    }

    func testOnlyTheFirstProductIsPresented() {
        let second = PaywallProduct(id: "other", localizedTitle: "Other", localizedPriceString: "$1.00",
                                    price: 1, period: monthly, eligibleFreeTrial: nil)
        XCTAssertEqual(PaywallPresentation.make(.loaded([product(), second])).productID,
                       "com.obsidianmedia.learnwithalphonso.pro.monthly")
    }

    // MARK: - Invariants: every state, every product shape

    private var everyLoad: [PaywallLoadState] {
        let shapes: [PaywallProduct] = [
            product(),
            product(trial: nil),
            product(price: "9,99 €"),
            product(price: "¥1,500", period: BillingPeriod(unit: .month, value: 1), trial: BillingPeriod(unit: .day, value: 3)),
            product(price: "$24.99", period: BillingPeriod(unit: .month, value: 3), trial: twoWeeks),
            product(price: "$59.99", period: BillingPeriod(unit: .year, value: 1), trial: BillingPeriod(unit: .month, value: 1)),
            product(title: ""),
        ]
        return [.loading, .failed, .loaded([])] + shapes.map { .loaded([$0]) }
    }

    private func strings(_ p: PaywallPresentation) -> [String] {
        var all = [p.titleText, p.renewalDisclosure]
        all += [p.priceLine, p.trialLine, p.ctaTitle, p.retryTitle].compactMap { $0 }
        if case .failed(let message) = p.state { all.append(message) }
        return all
    }

    func testInvariantsHoldInEveryState() {
        for load in everyLoad {
            let p = PaywallPresentation.make(load)
            // 1. The price is at least as prominent as the trial: size AND weight.
            XCTAssertGreaterThanOrEqual(p.priceStyle.pointSize, p.trialStyle.pointSize, "\(load)")
            XCTAssertGreaterThanOrEqual(p.priceStyle.weight, p.trialStyle.weight, "\(load)")
            // 2. A trial is never shown without the price, and the trial line itself states it.
            if let trialLine = p.trialLine, case .loaded(let products) = load, let first = products.first {
                XCTAssertNotNil(p.priceLine, "\(load)")
                XCTAssertTrue(trialLine.contains(first.localizedPriceString), "\(load)")
                XCTAssertTrue(p.renewalDisclosure.contains(first.localizedPriceString), "\(load)")
            }
            // 3. No literal "--" and no App Review wording, anywhere.
            for text in strings(p) {
                XCTAssertFalse(text.contains("--"), "\(load): \(text)")
                for phrase in PaywallCopy.forbiddenPhrases {
                    XCTAssertFalse(text.localizedCaseInsensitiveContains(phrase), "\(load): \(text)")
                }
            }
            // 4. The disclosure is always present.
            XCTAssertFalse(p.renewalDisclosure.isEmpty, "\(load)")
            // 5. A CTA exists exactly when there is a sellable product.
            XCTAssertEqual(p.ctaTitle != nil, p.state == .loaded, "\(load)")
        }
    }

    func testTheDisclosureIsNoLessReadableThanCaptionAndThePriceOutranksTheCTAButton() {
        let p = PaywallPresentation.make(.loaded([product()]))
        XCTAssertGreaterThanOrEqual(p.disclosureStyle.pointSize, 12)
        // AlphonsoPrimaryButtonStyle sets the CTA at this size.
        XCTAssertGreaterThan(p.priceStyle.pointSize, PaywallTextStyle.primaryButtonPointSize)
    }

    func testNoStaticCopyContainsADoubleHyphenOrReviewWording() {
        for text in PaywallCopy.allUserFacing {
            XCTAssertFalse(text.contains("--"), text)
            for phrase in PaywallCopy.forbiddenPhrases {
                XCTAssertFalse(text.localizedCaseInsensitiveContains(phrase), text)
            }
        }
        XCTAssertEqual(PaywallLinks.appleStandardEULA.absoluteString,
                       "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")
    }
}
