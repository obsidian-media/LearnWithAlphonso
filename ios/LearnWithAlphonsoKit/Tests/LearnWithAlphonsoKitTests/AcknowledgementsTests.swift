import XCTest
@testable import LearnWithAlphonsoKit

final class AcknowledgementsTests: XCTestCase {
    func testRevenueCatAndTheNineFontsAreCredited() {
        XCTAssertEqual(Acknowledgements.all.count, 10)
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.mit }.map(\.name), ["RevenueCat (purchases-ios)"])
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.ofl }.count, 9)
        XCTAssertTrue(Acknowledgements.all.contains { $0.licenseResource == "BricolageGrotesque-OFL" })
        XCTAssertTrue(Acknowledgements.all.contains { $0.licenseResource == "Figtree-OFL" })
    }

    func testEachEntryPointsAtItsOwnLicenceText() {
        XCTAssertEqual(Set(Acknowledgements.all.map(\.licenseResource)).count, Acknowledgements.all.count)
        for item in Acknowledgements.all { XCTAssertTrue(item.url.hasPrefix("https://"), item.name) }
    }
}
