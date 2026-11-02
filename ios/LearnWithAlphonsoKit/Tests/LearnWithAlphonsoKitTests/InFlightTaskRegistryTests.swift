import XCTest
@testable import LearnWithAlphonsoKit

final class InFlightTaskRegistryTests: XCTestCase {
    actor Counter {
        private(set) var value = 0
        func increment() { value += 1 }
    }

    func testConcurrentSameKeyRunsOperationOnce() async throws {
        let registry = InFlightTaskRegistry<String>()
        let counter = Counter()
        let gate = Task { try await registry.run(key: "episode") {
            await counter.increment()
            try await Task.sleep(for: .milliseconds(100))
        } }
        try await Task.sleep(for: .milliseconds(10))
        try await registry.run(key: "episode") {
            await counter.increment()
        }
        try await gate.value
        let count = await counter.value
        XCTAssertEqual(count, 1)
    }

    func testFailureIsSharedAndLaterCallCanRetry() async throws {
        let registry = InFlightTaskRegistry<String>()
        enum Failure: Error { case expected }
        let first = Task {
            try await registry.run(key: "episode") {
                try await Task.sleep(for: .milliseconds(50))
                throw Failure.expected
            }
        }
        try await Task.sleep(for: .milliseconds(5))
        do {
            try await registry.run(key: "episode") {}
            XCTFail("Concurrent caller should observe the in-flight failure")
        } catch is Failure {}
        do {
            try await first.value
            XCTFail("Initial caller should observe the failure")
        } catch is Failure {}

        try await registry.run(key: "episode") {}
    }
}
