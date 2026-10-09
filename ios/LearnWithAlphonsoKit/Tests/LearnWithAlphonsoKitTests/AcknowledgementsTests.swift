import XCTest
@testable import LearnWithAlphonsoKit

final class AcknowledgementsTests: XCTestCase {
    func testRevenueCatAndTheSevenFontsAreCredited() {
        XCTAssertEqual(Acknowledgements.all.count, 8)
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.mit }.map(\.name), ["RevenueCat (purchases-ios)"])
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.ofl }.count, 7)
    }

    func testEachEntryPointsAtItsOwnLicenceText() {
        XCTAssertEqual(Set(Acknowledgements.all.map(\.licenseResource)).count, Acknowledgements.all.count)
        for item in Acknowledgements.all { XCTAssertTrue(item.url.hasPrefix("https://"), item.name) }
    }
}
