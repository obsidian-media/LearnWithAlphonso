import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastLibraryTests: XCTestCase {
    private func folder(_ id: String, parent: String? = nil, course: String? = nil, sort: Int = 0) -> PodcastFolder {
        PodcastFolder(id: id, parentID: parent, slug: id, title: id, description: nil, sortOrder: sort, course: course)
    }

    private var tree: [PodcastFolder] {
        [
            folder("en", course: "en"), folder("en-a1", parent: "en"), folder("en-series", parent: "en"),
            folder("en-series-1", parent: "en-series"), folder("en-empty", parent: "en"),
            folder("fr", course: "fr"), folder("fr-a1", parent: "fr"),
            folder("shared"), folder("shared-tips", parent: "shared"),
        ]
    }

    func testOnlyTheActiveCoursesRootIsShownPlusCourseFreeRoots() {
        let ids = Set(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-a1", "fr-a1", "shared-tips"], courseCode: "en").map(\.id))
        XCTAssertEqual(ids, ["en", "en-a1", "shared", "shared-tips"])
    }

    func testAFolderWithNothingPublishedBeneathItIsHidden() {
        let ids = Set(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-a1"], courseCode: "en").map(\.id))
        XCTAssertFalse(ids.contains("en-empty"))
        XCTAssertFalse(ids.contains("en-series"))
        XCTAssertFalse(ids.contains("shared"))
        // The folder that DOES have content is visible: a filter that hid everything (or an
        // early return) would fail one of these two sides.
        XCTAssertTrue(ids.contains("en-a1"))
        XCTAssertTrue(ids.contains("en"))
    }

    func testANestedEpisodeKeepsEveryAncestorVisible() {
        let ids = Set(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-series-1"], courseCode: "en").map(\.id))
        XCTAssertEqual(ids, ["en", "en-series", "en-series-1"])
    }

    func testACourseWithNothingPublishedIsEmpty() {
        XCTAssertEqual(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-a1"], courseCode: "es"), [])
        XCTAssertEqual(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: [], courseCode: "en"), [])
        // The same tree does show something for the course that has content, so an
        // always-empty result cannot pass.
        XCTAssertFalse(PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-a1"], courseCode: "en").isEmpty)
    }

    func testAnEmptyFolderListNeverLicensesPruningDownloads() {
        // An empty folder list with an empty index means a role or RLS problem, not
        // "everything was unpublished": the sweep must not delete the learner's downloads.
        XCTAssertFalse(PodcastLibrary.canPruneDownloads(afterLoading: []))
        XCTAssertTrue(PodcastLibrary.canPruneDownloads(afterLoading: [folder("en", course: "en")]))
    }

    func testACycleIsNeverReachedAndNeverLoops() {
        let cyclic = tree + [folder("x", parent: "y"), folder("y", parent: "x")]
        let ids = Set(PodcastLibrary.visibleFolders(cyclic, publishedFolderIDs: ["x", "en-a1"], courseCode: "en").map(\.id))
        XCTAssertFalse(ids.contains("x"))
    }

    func testSearchResultsAreLimitedToVisibleFolders() {
        let url = URL(string: "https://example.test/a.mp3")!
        let inFrench = PodcastEpisode(id: "1", folderID: "fr-a1", slug: "a", title: "A", description: nil, audioURL: url, durationSeconds: 60, positionSeconds: 0, playbackUpdatedAt: nil)
        let inEnglish = PodcastEpisode(id: "2", folderID: "en-a1", slug: "b", title: "B", description: nil, audioURL: url, durationSeconds: 60, positionSeconds: 0, playbackUpdatedAt: nil)
        let visible = PodcastLibrary.visibleFolders(tree, publishedFolderIDs: ["en-a1", "fr-a1"], courseCode: "en")
        XCTAssertEqual(PodcastLibrary.episodes([inFrench, inEnglish], inFolders: visible).map(\.id), ["2"])
    }

    func testDownloadsOfUnpublishedEpisodesAreSweptExceptTheOnePlaying() {
        let entries = ["kept", "gone", "playing"].map {
            PodcastCacheEntry(episodeID: $0, bytes: 1, etag: nil, storedDurationSeconds: 1, lastPlayed: nil)
        }
        XCTAssertEqual(PodcastLibrary.unpublishedDownloads(entries: entries, publishedEpisodeIDs: ["kept"], keeping: "playing"), ["gone"])
    }

    func testEmptyCopyNamesTheCourse() {
        XCTAssertEqual(PodcastLibraryCopy.emptyTitle(courseCode: "fr"), "No French episodes yet")
        XCTAssertEqual(PodcastLibraryCopy.emptyTitle(courseCode: "es"), "No Spanish episodes yet")
        XCTAssertEqual(PodcastLibraryCopy.emptyTitle(courseCode: "en"), "No English episodes yet")
        XCTAssertEqual(PodcastLibraryCopy.emptyTitle(courseCode: "xx"), "No episodes yet")
        XCTAssertFalse(PodcastLibraryCopy.emptyMessage.contains("--"))
    }
}
