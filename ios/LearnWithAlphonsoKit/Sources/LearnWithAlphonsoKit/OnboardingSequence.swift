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

/// What the onboarding cover shows. The name prompt carries its own state, so the presented item is the only
/// thing the cover reads: a cover whose content reads separate view state captures a stale value when that state
/// is set in the same update as the presentation, and renders empty.
public enum OnboardingPresentation: Identifiable, Equatable, Sendable {
    case displayName(DisplayNameOnboarding)
    case placement

    public var id: String { step.rawValue }

    public var step: OnboardingStep {
        switch self {
        case .displayName: return .displayName
        case .placement: return .placement
        }
    }
}

public struct OnboardingAdvance: Equatable, Sendable {
    /// Nil means nothing is left to show: go to the app.
    public let presentation: OnboardingPresentation?
    /// The input `done` plus any step that was skipped because it had nothing to show.
    public let done: Set<OnboardingStep>
}

extension OnboardingSequence {
    /// A step becomes a screen only when it has everything that screen needs. The name step without its
    /// `DisplayNameOnboarding` yields nil (skip) instead of an empty cover.
    public static func presentation(for step: OnboardingStep, nameOnboarding: DisplayNameOnboarding?) -> OnboardingPresentation? {
        switch step {
        case .displayName: return nameOnboarding.map { .displayName($0) }
        case .placement: return .placement
        }
    }

    /// The next screen to present. A step that cannot be shown is marked done and the sequence moves on, so
    /// the learner reaches the next step or the app and never an empty cover.
    public static func advance(
        nameConfirmed: Bool?, placementTaken: Bool?, done: Set<OnboardingStep>, nameOnboarding: DisplayNameOnboarding?
    ) -> OnboardingAdvance {
        var done = done
        while let step = next(nameConfirmed: nameConfirmed, placementTaken: placementTaken, done: done) {
            if let shown = presentation(for: step, nameOnboarding: nameOnboarding) {
                return OnboardingAdvance(presentation: shown, done: done)
            }
            done.insert(step)
        }
        return OnboardingAdvance(presentation: nil, done: done)
    }
}
