import Foundation

/// Every mock `Requester` closure in this test target is `@Sendable` (it
/// matches production's own `Requester` typealias -- see
/// AIConversationClient.swift and friends, which really do need it, since
/// a real client is called from arbitrary Task/actor contexts). But a
/// mock closure here only ever runs synchronously, sequentially, awaited
/// by the single call site that invoked it within one test function --
/// never actually concurrently. The compiler can't see that invariant,
/// so it rejects a plain `var` captured and mutated across the boundary
/// (an error, not just a warning, in the Swift 6 language mode). This
/// box says "trust the test author on the invariant" once, instead of
/// scattering `nonisolated(unsafe)` across ~80 call sites.
final class TestCapture<Value>: @unchecked Sendable {
    var value: Value

    init(_ value: Value) {
        self.value = value
    }
}
