import XCTest
@testable import LearnWithAlphonsoKit

final class AcknowledgementsTests: XCTestCase {
    func testRevenueCatAndTheFiveFontsAreCredited() {
        XCTAssertEqual(Acknowledgements.all.count, 7)
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.mit }.map(\.name), ["RevenueCat (purchases-ios)"])
        XCTAssertEqual(Acknowledgements.all.filter { $0.licenseName == Acknowledgements.ofl }.count, 5)
        XCTAssertTrue(Acknowledgements.all.contains { $0.licenseResource == "BricolageGrotesque-OFL" })
        XCTAssertTrue(Acknowledgements.all.contains { $0.licenseResource == "Figtree-OFL" })
    }

    func testTheSoundEffectsAreCreditedToKenneyUnderCC0() {
        let sfx = Acknowledgements.all.filter { $0.licenseName == Acknowledgements.cc0 }
        XCTAssertEqual(sfx.map(\.name), ["Sound effects by Kenney (kenney.nl)"])
        XCTAssertEqual(sfx.first?.licenseResource, "Kenney-CC0")
        XCTAssertEqual(sfx.first?.url, "https://kenney.nl")
    }

    func testEachEntryPointsAtItsOwnLicenceText() {
        XCTAssertEqual(Set(Acknowledgements.all.map(\.licenseResource)).count, Acknowledgements.all.count)
        for item in Acknowledgements.all { XCTAssertTrue(item.url.hasPrefix("https://"), item.name) }
    }
}
