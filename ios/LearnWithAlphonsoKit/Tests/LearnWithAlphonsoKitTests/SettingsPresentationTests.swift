import XCTest
@testable import LearnWithAlphonsoKit

final class SettingsPresentationTests: XCTestCase {
    func testASavableNameHasTextAndNoSaveIsRunning() {
        XCTAssertTrue(SettingsPresentation.canSaveName("QA", isSaving: false))
        XCTAssertFalse(SettingsPresentation.canSaveName("QA", isSaving: true))
    }

    func testABlankNameCannotBeSaved() {
        XCTAssertFalse(SettingsPresentation.canSaveName("", isSaving: false))
        XCTAssertFalse(SettingsPresentation.canSaveName("  \n ", isSaving: false))
        XCTAssertTrue(SettingsPresentation.canSaveName("  Ana  ", isSaving: false))
    }

    func testAnAccountActionWaitsForTheOtherToFinish() {
        XCTAssertTrue(SettingsPresentation.canStartAccountAction(isExporting: false, isDeleting: false))
        XCTAssertFalse(SettingsPresentation.canStartAccountAction(isExporting: true, isDeleting: false))
        XCTAssertFalse(SettingsPresentation.canStartAccountAction(isExporting: false, isDeleting: true))
    }

    func testDeleteNeedsTheExactWord() {
        XCTAssertTrue(SettingsPresentation.canConfirmDelete(typed: "DELETE"))
        XCTAssertFalse(SettingsPresentation.canConfirmDelete(typed: "delete"))
        XCTAssertFalse(SettingsPresentation.canConfirmDelete(typed: "DELETE "))
        XCTAssertFalse(SettingsPresentation.canConfirmDelete(typed: ""))
    }
}
