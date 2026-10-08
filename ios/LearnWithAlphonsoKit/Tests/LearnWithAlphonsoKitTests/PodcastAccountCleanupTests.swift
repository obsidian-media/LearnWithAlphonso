import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastAccountCleanupTests: XCTestCase {
    @MainActor
    private func register(on lifecycle: SessionLifecycle, log: TestCapture<[String]>) {
        PodcastAccountCleanup.register(
            on: lifecycle,
            stopPlayback: { log.value.append("stop") },
            removeDownloads: { log.value.append("remove-downloads") }
        )
    }

    @MainActor
    func testSignOutStopsPlaybackAndKeepsDownloads() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        register(on: lifecycle, log: log)
        await lifecycle.run(.signedOut)
        XCTAssertEqual(log.value, ["stop"])
    }

    @MainActor
    func testAccountDeletionStopsPlaybackThenRemovesDownloads() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        register(on: lifecycle, log: log)
        await lifecycle.run(.accountDeleted)
        XCTAssertEqual(log.value, ["stop", "remove-downloads"])
    }

    @MainActor
    func testRegistersTwoNamedHandlersOnceInOrder() {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        register(on: lifecycle, log: log)
        register(on: lifecycle, log: log)
        XCTAssertEqual(lifecycle.registeredIDs, [PodcastAccountCleanup.HandlerID.playback, PodcastAccountCleanup.HandlerID.downloads])
    }
}
