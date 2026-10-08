import Foundation
import XCTest

/// Polls `condition` on the main actor until it holds or `timeout` passes. For state that
/// changes on a later main-actor hop (an AsyncStream consumer), where a single `await`
/// is not enough. Fails the calling test on timeout rather than hanging.
@MainActor
func waitUntil(
    timeout: TimeInterval = 2,
    file: StaticString = #filePath,
    line: UInt = #line,
    _ condition: @MainActor () -> Bool
) async {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() {
        if Date() > deadline {
            XCTFail("Condition not met within \(timeout)s", file: file, line: line)
            return
        }
        await Task.yield()
        try? await Task.sleep(nanoseconds: 5_000_000)
    }
}

/// Lets main-actor work that is already queued (a stream consumer's next iteration) run,
/// so a test can then assert that it did NOT change state.
@MainActor
func drainMainActor() async {
    for _ in 0..<20 { await Task.yield() }
    try? await Task.sleep(nanoseconds: 50_000_000)
    for _ in 0..<20 { await Task.yield() }
}
