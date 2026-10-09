import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastPlaybackFailureTests: XCTestCase {
    private func code(_ domain: String, _ code: Int) -> PodcastErrorCode { PodcastErrorCode(domain: domain, code: code) }

    func testTheChainWalksUnderlyingErrorsOutermostFirst() {
        let inner = NSError(domain: "NSURLErrorDomain", code: -1009)
        let middle = NSError(domain: "CoreMediaErrorDomain", code: -12938, userInfo: [NSUnderlyingErrorKey: inner])
        let outer = NSError(domain: "AVFoundationErrorDomain", code: -11800, userInfo: [NSUnderlyingErrorKey: middle])
        XCTAssertEqual(PodcastErrorCode.chain(from: outer), [
            code("AVFoundationErrorDomain", -11800), code("CoreMediaErrorDomain", -12938), code("NSURLErrorDomain", -1009),
        ])
        XCTAssertEqual(PodcastErrorCode.chain(from: nil), [])
    }

    func testTheChainIsBounded() {
        var error = NSError(domain: "d", code: 0)
        for index in 1...20 { error = NSError(domain: "d", code: index, userInfo: [NSUnderlyingErrorKey: error]) }
        XCTAssertEqual(PodcastErrorCode.chain(from: error).count, 8)
    }

    func testALocalFileThatFailsIsUnplayableWhateverTheError() {
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("NSURLErrorDomain", -1009)], probe: .notRun, isLocalFile: true), .unplayable)
    }

    func testOfflineWhileStreamingAsksForADownload() {
        let chain = [code("AVFoundationErrorDomain", -11800), code("NSURLErrorDomain", -1009)]
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: chain, probe: .notRun, isLocalFile: false), .offlineNotDownloaded)
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("NSURLErrorDomain", -1020)], probe: .noResponse, isLocalFile: false), .offlineNotDownloaded)
    }

    func testOfflineWinsOverANetworkCodeInTheSameChain() {
        // A dropped connection (-1005) wrapping "not connected" (-1009) is offline, not a
        // flaky network: the learner should be told to download, not to retry.
        let chain = [code("NSURLErrorDomain", -1005), code("NSURLErrorDomain", -1009)]
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: chain, probe: .notRun, isLocalFile: false), .offlineNotDownloaded)
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: Array(chain.reversed()), probe: .noResponse, isLocalFile: false), .offlineNotDownloaded)
    }

    // Supabase Storage answers a missing public object with 400 (probed 2026-10-07), not 404.
    func testTheProbeStatusDecidesNotFoundAndServer() {
        for status in [400, 403, 404, 410] {
            XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [], probe: .status(status), isLocalFile: false), .notFound, "\(status)")
        }
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [], probe: .status(503), isLocalFile: false), .server)
    }

    func testTransportErrorsAreNetwork() {
        for urlCode in [-1001, -1003, -1004, -1005, -1200] {
            XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("NSURLErrorDomain", urlCode)], probe: .notRun, isLocalFile: false), .network, "\(urlCode)")
        }
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("AVFoundationErrorDomain", -11800)], probe: .noResponse, isLocalFile: false), .network)
    }

    func testCoreMediaHTTP404IsNotFoundBeforeTheProbeAnswers() {
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("CoreMediaErrorDomain", -12938)], probe: .notRun, isLocalFile: false), .notFound)
    }

    func testAReachableObjectThatStillFailsIsUnplayable() {
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [code("AVFoundationErrorDomain", -11829)], probe: .status(200), isLocalFile: false), .unplayable)
        XCTAssertEqual(PodcastPlaybackFailure.classify(chain: [], probe: .notRun, isLocalFile: false), .unplayable)
    }

    func testEveryFailureHasSpecificCopyWithNoDoubleHyphen() {
        let all: [PodcastPlaybackFailure] = [.offlineNotDownloaded, .network, .notFound, .server, .unplayable]
        let messages = all.map(PodcastPlaybackCopy.message(for:))
        XCTAssertEqual(Set(messages).count, all.count, "each cause gets its own sentence")
        for message in messages { XCTAssertFalse(message.contains("--")); XCTAssertFalse(message.isEmpty) }
        XCTAssertEqual(PodcastPlaybackCopy.message(for: .offlineNotDownloaded), "Download this episode to listen offline.")
        XCTAssertEqual(PodcastPlaybackCopy.message(for: .network), Copy.connectionFailure)
    }
}
