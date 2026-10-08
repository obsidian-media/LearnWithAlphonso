import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastDownloadValidationTests: XCTestCase {
    private func code(_ domain: String, _ code: Int) -> PodcastErrorCode { PodcastErrorCode(domain: domain, code: code) }

    func testA200AudioResponseIsAccepted() {
        XCTAssertNil(PodcastDownloadValidation.checkResponse(statusCode: 200, contentType: "audio/mpeg"))
        XCTAssertNil(PodcastDownloadValidation.checkResponse(statusCode: 200, contentType: "Audio/MPEG; charset=binary"))
    }

    // Supabase answers a missing object with 400 + JSON. That must never be saved as audio.
    func testSupabasesMissingObjectAnswerIsNotFound() {
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 400, contentType: "application/json; charset=utf-8"), .notFound)
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 404, contentType: nil), .notFound)
    }

    func testServerErrorsCarryTheirStatus() {
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 503, contentType: "text/html"), .server(status: 503))
    }

    func testA200ThatIsNotAudioIsRejected() {
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 200, contentType: "text/html"), .invalidContent(contentType: "text/html"))
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 200, contentType: nil), .invalidContent(contentType: nil))
        XCTAssertEqual(PodcastDownloadValidation.checkResponse(statusCode: 200, contentType: "application/octet-stream"), .invalidContent(contentType: "application/octet-stream"))
    }

    func testTheBodyMustMatchTheDeclaredLength() {
        XCTAssertNil(PodcastDownloadValidation.checkBody(expectedLength: 1_378_473, actualBytes: 1_378_473, durationSeconds: 172))
        XCTAssertEqual(PodcastDownloadValidation.checkBody(expectedLength: 1_378_473, actualBytes: 900_000, durationSeconds: 172), .incomplete(expected: 1_378_473, actual: 900_000))
    }

    func testWithoutALengthTheBodyMustBePlausibleForTheDuration() {
        XCTAssertNil(PodcastDownloadValidation.checkBody(expectedLength: nil, actualBytes: 172 * 8_000, durationSeconds: 172))
        XCTAssertEqual(PodcastDownloadValidation.checkBody(expectedLength: nil, actualBytes: 120, durationSeconds: 172), .incomplete(expected: nil, actual: 120))
    }

    func testAnEmptyFileIsNeverAccepted() {
        XCTAssertEqual(PodcastDownloadValidation.checkBody(expectedLength: 0, actualBytes: 0, durationSeconds: 1), .incomplete(expected: 0, actual: 0))
    }

    func testStorageFullIsNoSpaceWhereverItSitsInTheChain() {
        XCTAssertEqual(PodcastDownloadValidation.classify([code("NSCocoaErrorDomain", 640)]), .noSpace)
        XCTAssertEqual(PodcastDownloadValidation.classify([code("NSURLErrorDomain", -3003), code("NSPOSIXErrorDomain", 28)]), .noSpace)
        XCTAssertEqual(PodcastDownloadValidation.classify([code("NSURLErrorDomain", -3003)]), .noSpace)
    }

    func testOfflineAndNetworkAreDistinct() {
        XCTAssertEqual(PodcastDownloadValidation.classify([code("NSURLErrorDomain", -1009)]), .offline)
        XCTAssertEqual(PodcastDownloadValidation.classify([code("NSURLErrorDomain", -1005)]), .network)
        XCTAssertEqual(PodcastDownloadValidation.classify([]), .network)
    }

    func testAlertTitlesNameTheCause() {
        XCTAssertEqual(PodcastDownloadCopy.title(for: .noSpace), "Not enough storage")
        XCTAssertEqual(PodcastDownloadCopy.title(for: .network), "Download interrupted")
        XCTAssertEqual(PodcastDownloadCopy.title(for: .server(status: 503)), "Server problem")
        XCTAssertEqual(PodcastDownloadCopy.title(for: .offline), "You're offline")
        XCTAssertEqual(PodcastDownloadCopy.title(for: .notFound), "Episode unavailable")
        XCTAssertEqual(PodcastDownloadCopy.title(for: .budgetExceeded(candidates: [], neededBytes: 1)), "Not enough space set aside")
    }

    func testEveryFailureHasAMessageWithNoDoubleHyphen() {
        let entry = PodcastCacheEntry(episodeID: "a", bytes: 1, etag: nil, storedDurationSeconds: 1, lastPlayed: nil)
        let all: [PodcastDownloadFailure] = [
            .budgetExceeded(candidates: [], neededBytes: 1), .budgetExceeded(candidates: [entry], neededBytes: 1),
            .noSpace, .offline, .network, .notFound, .server(status: 500), .invalidContent(contentType: nil),
            .incomplete(expected: 2, actual: 1),
        ]
        for failure in all {
            let message = PodcastDownloadCopy.message(for: failure)
            XCTAssertFalse(message.isEmpty, "\(failure)")
            XCTAssertFalse(message.contains("--"), "\(failure)")
        }
        XCTAssertEqual(PodcastDownloadCopy.message(for: .budgetExceeded(candidates: [entry], neededBytes: 1)),
                       "Remove 1 downloaded episode to make room, starting with the ones you haven't played.")
    }
}
