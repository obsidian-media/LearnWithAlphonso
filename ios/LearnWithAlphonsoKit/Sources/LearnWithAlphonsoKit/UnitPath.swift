import Foundation

public enum UnitPathState: String, Sendable { case done, next, locked }

public struct UnitPathNode: Equatable, Sendable {
    public let id: String
    public let state: UnitPathState
}

/// The Learn screen's lesson path for one unit. Mirrors `unitPathNodes` in src/lib/unit-path.ts.
public enum UnitPath {
    /// Completed lessons are done wherever they sit, the first lesson not done is next, the rest are
    /// locked. Shows `max` nodes, starting up to two before next (or the last `max` when all are done).
    public static func nodes(lessonIDs: [String], completed: Set<String>, max: Int = 5) -> [UnitPathNode] {
        let nextIndex = lessonIDs.firstIndex { !completed.contains($0) }
        let nodes = lessonIDs.enumerated().map { index, id in
            UnitPathNode(id: id, state: completed.contains(id) ? .done : (index == nextIndex ? .next : .locked))
        }
        let anchor = nextIndex ?? nodes.count
        let start = Swift.max(0, Swift.min(anchor - 2, nodes.count - max))
        return Array(nodes[start..<Swift.min(start + max, nodes.count)])
    }
}
