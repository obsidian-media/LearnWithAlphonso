import XCTest
@testable import LearnWithAlphonsoKit

/// Ported from src/lib/podcast-tree.test.ts -- same cases, same values, so
/// drift between the two implementations is visible in review.
final class PodcastTreeTests: XCTestCase {
    private func folder(
        _ id: String,
        _ parentID: String?,
        _ slug: String,
        _ sortOrder: Int = 0
    ) -> PodcastFolder {
        PodcastFolder(id: id, parentID: parentID, slug: slug, title: slug, description: nil, sortOrder: sortOrder)
    }

    func testChildrenAreOrderedBySortOrder() {
        let all = [folder("b", "a", "b1", 2), folder("a", nil, "en"), folder("c", "a", "c1", 1)]
        XCTAssertEqual(PodcastTree.children(of: "a", in: all).map(\.slug), ["c1", "b1"])
    }

    func testRootsAreFoldersWithNoParent() {
        let all = [folder("a", nil, "en"), folder("b", "a", "a1")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).map(\.slug), ["en"])
    }

    func testAChildWithAMissingParentIsDroppedNotPromoted() {
        // Surfacing an orphan at top level would misrepresent the tree.
        let all = [folder("a", nil, "en"), folder("orphan", "gone", "lost")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).map(\.slug), ["en"])
    }

    func testResolvesASlugPathOfArbitraryDepth() {
        let all = [folder("a", nil, "en"), folder("b", "a", "a1"), folder("c", "b", "cafe")]
        XCTAssertEqual(PodcastTree.resolve(path: ["en", "a1", "cafe"], in: all)?.id, "c")
    }

    func testReturnsNilWhenASegmentDoesNotExistAtThatLevel() {
        let all = [folder("a", nil, "en"), folder("b", "a", "a1")]
        XCTAssertNil(PodcastTree.resolve(path: ["en", "nope"], in: all))
    }

    func testDoesNotMatchAFolderThatExistsElsewhereInTheTree() {
        // "cafe" is a child of a1, not of en -- en/cafe must not resolve.
        let all = [folder("a", nil, "en"), folder("b", "a", "a1"), folder("c", "b", "cafe")]
        XCTAssertNil(PodcastTree.resolve(path: ["en", "cafe"], in: all))
    }

    // Review Focus #4: a cycle from hand-edited data must not hang the UI.
    func testDetectsACycleBetweenTwoFolders() {
        let cycle = PodcastTree.findCycle(in: [folder("a", "b", "en"), folder("b", "a", "a1")])
        XCTAssertNotNil(cycle)
        XCTAssertEqual(Set(cycle ?? []), Set(["a", "b"]))
    }

    func testDetectsAFolderParentedToItself() {
        XCTAssertEqual(PodcastTree.findCycle(in: [folder("a", "a", "en")]), ["a"])
    }

    func testReturnsNoCycleForAnAcyclicTree() {
        XCTAssertNil(PodcastTree.findCycle(in: [folder("a", nil, "en"), folder("b", "a", "a1")]))
    }

    func testChildrenTerminatesOnACyclicTree() {
        // Cycle members have non-nil parents, so they never surface as
        // roots and the walk stays bounded.
        let all = [folder("a", "b", "en"), folder("b", "a", "a1")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).count, 0)
    }

    func testAcceptsAndRejectsSlugsLikeTheWebImplementation() {
        XCTAssertTrue(PodcastTree.isValidSlug("cafe-orders-a1"))
        for bad in ["Cafe", "a b", "a/b", "", "-lead", "trail-", "a--b", "é"] {
            XCTAssertFalse(PodcastTree.isValidSlug(bad), "expected \(bad) to be rejected")
        }
    }
}
