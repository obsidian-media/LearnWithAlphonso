import XCTest
@testable import LearnWithAlphonsoKit

final class SessionLifecycleTests: XCTestCase {
    @MainActor
    func testHandlersRunInRegistrationOrderWithTheEvent() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        lifecycle.register("a") { event in log.value.append("a:\(event)") }
        lifecycle.register("b") { event in log.value.append("b:\(event)") }

        await lifecycle.run(.signedOut)
        await lifecycle.run(.accountDeleted)

        XCTAssertEqual(log.value, ["a:signedOut", "b:signedOut", "a:accountDeleted", "b:accountDeleted"])
    }

    @MainActor
    func testReRegisteringAnIDReplacesTheHandlerInPlace() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        lifecycle.register("a") { _ in log.value.append("old-a") }
        lifecycle.register("b") { _ in log.value.append("b") }
        lifecycle.register("a") { _ in log.value.append("new-a") }

        await lifecycle.run(.signedOut)

        XCTAssertEqual(lifecycle.registeredIDs, ["a", "b"])
        XCTAssertEqual(log.value, ["new-a", "b"])
    }

    /// A handler that awaits (RevenueCat's logOut) must finish before the next one starts,
    /// so the order the app registers in is the order things actually happen.
    @MainActor
    func testAnAwaitingHandlerFinishesBeforeTheNextStarts() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        lifecycle.register("slow") { _ in
            log.value.append("slow-start")
            for _ in 0..<5 { await Task.yield() }
            log.value.append("slow-end")
        }
        lifecycle.register("next") { _ in log.value.append("next") }

        await lifecycle.run(.accountDeleted)

        XCTAssertEqual(log.value, ["slow-start", "slow-end", "next"])
    }

    /// Sign-out is often triggered from a task that is being torn down (a view's .task).
    /// Cancellation of the caller must not skip cleanup.
    @MainActor
    func testEveryHandlerRunsEvenWhenTheCallingTaskIsCancelled() async {
        let lifecycle = SessionLifecycle()
        let log = TestCapture<[String]>([])
        lifecycle.register("a") { _ in log.value.append("a") }
        lifecycle.register("b") { _ in log.value.append("b") }

        let task = Task { @MainActor in await lifecycle.run(.signedOut) }
        task.cancel()
        await task.value

        XCTAssertEqual(log.value, ["a", "b"])
    }
}
