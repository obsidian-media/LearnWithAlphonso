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
        XCTAssertEqual(ActiveCoursePreference.load(from: defaults), .english)
        ActiveCoursePreference.save(.spanish, to: defaults)
        XCTAssertEqual(ActiveCoursePreference.load(from: defaults), .spanish)
        defaults.set("klingon", forKey: ActiveCoursePreference.defaultsKey)
        XCTAssertEqual(ActiveCoursePreference.load(from: defaults), .english)
    }
}
