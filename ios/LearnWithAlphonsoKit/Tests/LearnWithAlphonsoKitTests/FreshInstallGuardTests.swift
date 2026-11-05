import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class FreshInstallGuardTests: XCTestCase {
    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "FreshInstallGuardTests.\(UUID().uuidString)")!
    }

    func testTheFirstLaunchOfAnInstallClearsALeftoverSessionOnce() {
        let defaults = makeDefaults()
        XCTAssertTrue(FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: defaults))
        XCTAssertFalse(FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: defaults))
        XCTAssertFalse(FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: defaults))
    }

    func testAReinstallStartsWithEmptyDefaultsAndSoClearsAgain() {
        XCTAssertTrue(FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: makeDefaults()))
        XCTAssertTrue(FreshInstallGuard.isFirstLaunchOfThisInstall(defaults: makeDefaults()))
    }
}
