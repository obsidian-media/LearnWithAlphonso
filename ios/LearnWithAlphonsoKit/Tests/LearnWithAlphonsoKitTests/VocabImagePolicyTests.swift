import XCTest
@testable import LearnWithAlphonsoKit

final class VocabImagePolicyTests: XCTestCase {
    private let ok = "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd"

    func testABucketURLIsRenderable() {
        XCTAssertTrue(VocabImagePolicy.isRenderable(ok))
    }

    func testProviderAndForeignURLsAreNotRenderable() {
        let bad = [
            "https://pixabay.com/get/gabc_640.jpg",
            "https://images.pexels.com/photos/590472/pexels-photo-590472.jpeg",
            ok.replacingOccurrences(of: "https://", with: "http://"),
            ok.replacingOccurrences(of: "/vocab-images/", with: "/podcast-audio/"),
            "",
        ]
        for url in bad {
            XCTAssertFalse(VocabImagePolicy.isRenderable(url), url)
        }
    }

    func testAnImageThatHasNotFailedIsVisible() {
        XCTAssertEqual(VocabImagePolicy.slot(url: ok, failedURL: nil), .visible)
    }

    func testTheURLThatFailedCollapses() {
        XCTAssertEqual(VocabImagePolicy.slot(url: ok, failedURL: ok), .collapsed)
    }

    /// A failure recorded for one URL must never hide a different URL's image,
    /// whichever view instance ends up showing it.
    func testAFailureForAPreviousURLDoesNotCollapseTheNextImage() {
        let next = ok.replacingOccurrences(of: "apple", with: "pear")
        XCTAssertEqual(VocabImagePolicy.slot(url: next, failedURL: ok), .visible)
    }

    func testAnUnrenderableURLCollapsesBeforeAnyLoadAttempt() {
        XCTAssertEqual(VocabImagePolicy.slot(url: "https://pixabay.com/get/gabc_640.jpg", failedURL: nil), .collapsed)
    }
}
