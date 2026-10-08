import Foundation

public enum OnboardingStep: String, Identifiable, Hashable, Sendable, CaseIterable {
    case displayName
    case placement
    public var id: String { rawValue }
}

/// What RootView shows after a sign-in: the public-name prompt first, then English placement. `nil` inputs mean
/// that check failed this launch; a failed check skips its step rather than blocking the app.
public enum OnboardingSequence {
    public static func next(nameConfirmed: Bool?, placementTaken: Bool?, done: Set<OnboardingStep>) -> OnboardingStep? {
        if nameConfirmed == false, !done.contains(.displayName) { return .displayName }
        if placementTaken == false, !done.contains(.placement) { return .placement }
        return nil
    }
}
