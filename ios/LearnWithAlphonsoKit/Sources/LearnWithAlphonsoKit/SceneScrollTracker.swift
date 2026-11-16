import Foundation

/// Where a screen's scene thinks the content is scrolled to. The state machine behind `SceneScrollHost`, kept here so
/// it is tested.
///
/// Two signals feed it: the scroll view's own offset (iOS 18+, `scrolled`), which wins as soon as it reports, and a
/// probe row's global top edge (`moved`) with its `appeared` / `disappeared`, for iOS 17. The probe row is a List row
/// and is recycled: when it comes back SwiftUI may report its position BEFORE it reports that it appeared, and a
/// position that does not change afterwards is never reported again. So the last probe position is always kept, even
/// while the row is off screen, and applied the moment the row is back. Otherwise a list scrolled away and returned to
/// the top left the old offset in place and the greeting bubble hidden at the top.
public struct SceneScrollTracker: Equatable, Sendable {
    public enum Event: Equatable, Sendable {
        case moved(Double)
        case scrolled(Double)
        case appeared
        case disappeared
    }

    /// The offset the scene should use; nil until something has reported.
    public private(set) var offset: Double?
    /// False while the probe row is off screen (a scroll view that reports itself overrides this at the call site).
    public private(set) var probeVisible = true
    /// True once the scroll view itself reported; the probe is ignored from then on.
    public private(set) var scrollDriven = false
    private var lastProbeY: Double?

    public init() {}

    public mutating func apply(_ event: Event) {
        switch event {
        case .appeared:
            probeVisible = true
            if !scrollDriven, let y = lastProbeY { offset = y }
        case .disappeared:
            probeVisible = false
        case .scrolled(let y):
            scrollDriven = true
            offset = y
        case .moved(let y):
            lastProbeY = y
            guard probeVisible, !scrollDriven else { return }
            offset = y
        }
    }
}
