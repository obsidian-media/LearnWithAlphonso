import XCTest
@testable import LearnWithAlphonsoKit

final class CourseWireTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: #file)
        defaults.removePersistentDomain(forName: #file)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: #file)
        defaults = nil
        super.tearDown()
    }

    func testWireCodesMatchTheWebCourseType() {
        XCTAssertEqual(Course.english.wireCode, "en")
        XCTAssertEqual(Course.french.wireCode, "fr")
        XCTAssertEqual(Course.spanish.wireCode, "es")
    }

    func testWireCodesRoundTripAndRejectUnknownValues() {
        for course: Course in [.english, .french, .spanish] {
            XCTAssertEqual(Course(wireCode: course.wireCode), course)
        }
        XCTAssertNil(Course(wireCode: "de"))
        XCTAssertNil(Course(wireCode: "EN"))
    }

    func testActiveCourseDefaultsToEnglishAndPersists() {
        XCTAssertEqual(ActiveCoursePreference.load(for: "a", from: defaults), .english)
        ActiveCoursePreference.save(.spanish, for: "a", to: defaults)
        XCTAssertEqual(ActiveCoursePreference.load(for: "a", from: defaults), .spanish)
        defaults.set("klingon", forKey: ActiveCoursePreference.defaultsKey(for: "a"))
        XCTAssertEqual(ActiveCoursePreference.load(for: "a", from: defaults), .english)
    }

    /// The next account on a device must not start in the previous account's course.
    func testActiveCourseIsPerAccount() {
        ActiveCoursePreference.save(.french, for: "account-a", to: defaults)
        XCTAssertEqual(ActiveCoursePreference.load(for: "account-b", from: defaults), .english)
        ActiveCoursePreference.save(.spanish, for: "account-b", to: defaults)
        XCTAssertEqual(ActiveCoursePreference.load(for: "account-a", from: defaults), .french)
        XCTAssertEqual(ActiveCoursePreference.load(for: "account-b", from: defaults), .spanish)
    }

    func testNothingIsRememberedWhileSignedOut() {
        ActiveCoursePreference.save(.french, for: nil, to: defaults)
        XCTAssertEqual(ActiveCoursePreference.load(for: nil, from: defaults), .english)
        XCTAssertEqual(ActiveCoursePreference.load(for: "a", from: defaults), .english)
    }
}
