import XCTest
@testable import LearnWithAlphonsoKit

final class ListenShelfTests: XCTestCase {
    private func folder(_ id: String, _ parent: String?, _ slug: String, course: String? = nil) -> PodcastFolder {
        PodcastFolder(id: id, parentID: parent, slug: slug, title: slug, description: nil, sortOrder: 0, course: course)
    }
    private func ep(_ id: String, _ folderID: String, dur: Int = 600) -> PodcastEpisode {
        PodcastEpisode(id: id, folderID: folderID, slug: id, title: id, description: nil,
                       audioURL: URL(string: "https://x.test/a.mp3")!, durationSeconds: dur, positionSeconds: 0,
                       playbackUpdatedAt: nil, aiNarrated: false, course: nil)
    }
    private func prog(_ id: String, _ pos: Int, _ at: String, done: Bool = false) -> ListenProgress {
        ListenProgress(episodeID: id, positionS: pos, completedAt: done ? "x" : nil, updatedAt: at)
    }
    private var folders: [PodcastFolder] {
        [folder("en", nil, "en", course: "en"), folder("a2", "en", "a2"), folder("shop", "a2", "bookshop"),
         folder("fr", nil, "fr", course: "fr"), folder("frq", "fr", "mystery")]
    }
    private var eps: [PodcastEpisode] { [ep("e1", "shop"), ep("e2", "shop"), ep("e3", "shop"), ep("f1", "frq")] }

    func testStateAndFraction() {
        XCTAssertEqual(ListenShelf.state(nil), .new)
        XCTAssertEqual(ListenShelf.state(prog("e1", 0, "t")), .new)
        XCTAssertEqual(ListenShelf.state(prog("e1", 5, "t")), .inProgress)
        XCTAssertEqual(ListenShelf.state(prog("e1", 5, "t", done: true)), .done)
        XCTAssertEqual(ListenShelf.fraction(eps[0], prog("e1", 300, "t")), 0.5)
        XCTAssertEqual(ListenShelf.fraction(eps[0], prog("e1", 9999, "t")), 1)
        XCTAssertEqual(ListenShelf.fraction(eps[0], prog("e1", 10, "t", done: true)), 1)
        XCTAssertEqual(ListenShelf.secondsLeft(eps[0], prog("e1", 230, "t")), 370)
    }

    func testFormatting() {
        XCTAssertEqual(ListenShelf.clock(370), "6:10")
        XCTAssertEqual(ListenShelf.hoursMinutes(12000), "3 h 20 m")
        XCTAssertEqual(ListenShelf.hoursMinutes(0), "0 m")
        XCTAssertEqual(ListenShelf.wirePosition(.max), 2_000_000_000)
        XCTAssertEqual(ListenShelf.wirePosition(-4), 0)
    }

    func testLevelsCourseAndPercent() {
        XCTAssertEqual(ListenShelf.level(of: "shop", in: folders), "A2")
        XCTAssertNil(ListenShelf.level(of: "frq", in: folders))
        let en = ListenShelf.shelves(folders: folders, episodes: eps, progress: [], course: "en")
        XCTAssertEqual(en.map(\.folder.id), ["shop"])
        XCTAssertEqual(ListenShelf.levels(en), ["A2"])
        XCTAssertEqual(ListenShelf.shelves(folders: folders, episodes: eps, progress: [], course: "fr").map(\.folder.id), ["frq"])
        XCTAssertTrue(ListenShelf.shelves(folders: folders, episodes: eps, progress: [], course: "es").isEmpty)
        let half = ListenShelf.shelves(folders: folders, episodes: eps,
                                       progress: [prog("e1", 0, "t", done: true), prog("e2", 300, "t")], course: "en")
        XCTAssertEqual(half[0].doneCount, 1)
        XCTAssertEqual(half[0].percent, 50)
        let all = ["e1", "e2", "e3"].map { prog($0, 0, "t", done: true) }
        XCTAssertEqual(ListenShelf.shelves(folders: folders, episodes: eps, progress: all, course: "en")[0].percent, 100)
    }

    func testRoomIsBySubjectElseStable() {
        XCTAssertEqual(ListenShelf.room(for: folder("x", nil, "bookshop")), "library")
        XCTAssertEqual(ListenShelf.room(for: folder("x", nil, "zzz")), ListenShelf.room(for: folder("y", nil, "zzz")))
    }

    func testContinueListening() {
        let shelves = ListenShelf.shelves(folders: folders, episodes: eps, progress: [], course: "en")
        XCTAssertNil(ListenShelf.continueListening(shelves, progress: []))
        let recent = ListenShelf.continueListening(shelves, progress: [prog("e1", 100, "2026-01-01"), prog("e2", 50, "2026-01-02")])
        XCTAssertEqual(recent?.episode.id, "e2")
        let after = ListenShelf.continueListening(shelves, progress: [prog("e1", 0, "2026-01-02", done: true)])
        XCTAssertEqual(after?.episode.id, "e2")
        XCTAssertNil(after?.progress)
        let finished = ["e1", "e2", "e3"].map { prog($0, 0, "2026-01-01", done: true) }
        XCTAssertNil(ListenShelf.continueListening(shelves, progress: finished))
    }
}
