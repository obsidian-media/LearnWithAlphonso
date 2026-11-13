import XCTest
@testable import LearnWithAlphonsoKit

final class VideoShelfTests: XCTestCase {
    private let base = URL(string: "https://example.supabase.co")!

    private func video(
        id: String = "v1", course: String = "en", title: String = "A", sort: Int = 0, duration: Int = 50,
        progress: Int = 0, completedAt: String? = nil, practice: VideoPractice? = nil
    ) -> LibraryVideo {
        LibraryVideo(
            id: id, slug: "en-\(id)", course: course, title: title, level: "A1", durationSeconds: duration,
            videoURL: URL(string: "https://x.test/\(id).mp4")!, captionsURL: URL(string: "https://x.test/\(id).vtt")!,
            practice: practice, sortOrder: sort, progressSeconds: progress, completedAt: completedAt)
    }

    func testStateFractionAndResume() {
        XCTAssertEqual(VideoShelf.state(video()), .new)
        XCTAssertEqual(VideoShelf.state(video(progress: 12)), .inProgress)
        XCTAssertEqual(VideoShelf.state(video(progress: 12, completedAt: "2026-11-14T00:00:00Z")), .done)
        XCTAssertEqual(VideoShelf.fraction(video(progress: 5, completedAt: "x")), 1)
        XCTAssertEqual(VideoShelf.fraction(video(progress: 25)), 0.5, accuracy: 0.0001)
        XCTAssertEqual(VideoShelf.fraction(video(progress: 500)), 1)
        XCTAssertEqual(VideoShelf.resumeSeconds(video(progress: 20)), 20)
        XCTAssertEqual(VideoShelf.resumeSeconds(video(progress: 48)), 0, "saved inside the last seconds: restart")
        XCTAssertEqual(VideoShelf.resumeSeconds(video(progress: 20, completedAt: "x")), 0)
        XCTAssertEqual(VideoShelf.resumeSeconds(video()), 0)
    }

    func testTheShelfIsTheCoursesVideosInOrderAndEmptyWhenThereAreNone() {
        let all = [video(id: "b", title: "B", sort: 2), video(id: "a", title: "A", sort: 1), video(id: "f", course: "fr")]
        XCTAssertEqual(VideoShelf.shelf(all, course: "en").map(\.id), ["a", "b"])
        XCTAssertTrue(VideoShelf.shelf(all, course: "es").isEmpty)
    }

    func testCaptionsAreOnByDefaultAndSpeedsCycle() {
        XCTAssertTrue(VideoShelf.captionsDefaultOn)
        XCTAssertEqual(VideoShelf.nextSpeed(after: 1), 1.25)
        XCTAssertEqual(VideoShelf.nextSpeed(after: 1.5), 0.75)
        XCTAssertEqual(VideoShelf.nextSpeed(after: 3), 1)
        XCTAssertEqual(VideoShelf.speedLabel(1), "1x")
        XCTAssertEqual(VideoShelf.speedLabel(1.25), "1.25x")
    }

    func testClockReadsMinutesAndPaddedSeconds() {
        XCTAssertEqual(VideoShelf.clock(49), "0:49")
        XCTAssertEqual(VideoShelf.clock(372.4), "6:12")
        XCTAssertEqual(VideoShelf.clock(60), "1:00")
        XCTAssertEqual(VideoShelf.clock(-5), "0:00")
        XCTAssertEqual(VideoShelf.clock(.nan), "0:00")
    }

    func testThePracticeLinkGoesToALessonATalkOrACampaignSceneZero() {
        XCTAssertEqual(VideoShelf.practiceDestination(VideoPractice(kind: "lesson", id: "u3l2")), .lesson("u3l2"))
        XCTAssertEqual(VideoShelf.practiceDestination(VideoPractice(kind: "talk", id: "coffee")), .talk("coffee"))
        XCTAssertEqual(VideoShelf.practiceDestination(VideoPractice(kind: "campaign", id: "city-day")), .campaign("city-day", scene: 0))
        XCTAssertNil(VideoShelf.practiceDestination(nil))
        XCTAssertNil(VideoShelf.practiceDestination(VideoPractice(kind: "quiz", id: "x")))
        XCTAssertNil(VideoShelf.practiceDestination(VideoPractice(kind: "lesson", id: "")))
    }

    func testPublicURLsPointAtTheVideosBucketSegmentBySegment() {
        XCTAssertEqual(
            VideoShelf.publicURL(supabaseURL: base, path: "en/en-a b.mp4")?.absoluteString,
            "https://example.supabase.co/storage/v1/object/public/videos/en/en-a%20b.mp4")
        XCTAssertNil(VideoShelf.publicURL(supabaseURL: base, path: ""))
    }

    func testRowsBecomeVideosWithTheLearnersProgressAndUnplayableRowsAreDropped() {
        let good: [String: Any] = [
            "id": "v1", "slug": "en-a", "course": "en", "title": "A", "level_id": "A1", "duration_seconds": 49,
            "video_path": "en/en-a.mp4", "poster_path": "en/en-a.jpg", "captions_path": "en/en-a.en.vtt",
            "tags": ["food"], "practice_kind": "lesson", "practice_id": "u3l2", "sort_order": 3,
        ]
        var noCaptions = good
        noCaptions["id"] = "v2"
        noCaptions["captions_path"] = NSNull()
        var badCourse = good
        badCourse["id"] = "v3"
        badCourse["course"] = "de"
        var halfPractice = good
        halfPractice["id"] = "v4"
        halfPractice["practice_id"] = NSNull()
        let watches: [[String: Any]] = [["video_id": "v1", "progress_seconds": 20, "completed_at": NSNull()]]

        let videos = VideoShelf.videos(videoRows: [good, noCaptions, badCourse, halfPractice], watchRows: watches, supabaseURL: base)
        XCTAssertEqual(videos.map(\.id), ["v1", "v4"])
        XCTAssertEqual(videos[0].progressSeconds, 20)
        XCTAssertEqual(videos[0].durationSeconds, 49)
        XCTAssertEqual(videos[0].practice, VideoPractice(kind: "lesson", id: "u3l2"))
        XCTAssertEqual(videos[0].captionsURL.absoluteString, "https://example.supabase.co/storage/v1/object/public/videos/en/en-a.en.vtt")
        XCTAssertEqual(videos[0].posterURL?.lastPathComponent, "en-a.jpg")
        XCTAssertNil(videos[1].practice, "a half-set practice target is no target")
        XCTAssertEqual(videos[1].progressSeconds, 0)
    }

    func testTheClientAsksForTheTablesAndSavesThroughTheFunction() async throws {
        final class Box: @unchecked Sendable { var urls: [String] = []; var body: [String: Any] = [:] }
        let box = Box()
        let client = PodcastClient(supabaseURL: base, anonKey: "anon", accessToken: "tok") { request in
            box.urls.append(request.url!.path)
            if let data = request.httpBody, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { box.body = json }
            let body = request.url!.path.hasSuffix("/videos")
                ? #"[{"id":"v1","slug":"en-a","course":"en","title":"A","duration_seconds":49,"video_path":"en/a.mp4","captions_path":"en/a.vtt"}]"#
                : "[]"
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let videos = try await client.fetchVideos()
        XCTAssertEqual(videos.map(\.id), ["v1"])
        XCTAssertEqual(box.urls, ["/rest/v1/videos", "/rest/v1/video_watches"])
        try await client.saveVideoProgress(videoID: "v1", progressSeconds: 49)
        XCTAssertEqual(box.urls.last, "/rest/v1/rpc/save_video_progress")
        XCTAssertEqual(box.body["p_video_id"] as? String, "v1")
        XCTAssertEqual(box.body["p_progress_s"] as? Int, 49)
    }
}
