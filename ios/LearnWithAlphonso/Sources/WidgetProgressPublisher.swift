import Foundation
import WidgetKit
import LearnWithAlphonsoKit

/// The one place progress data crosses the app -> widget process boundary
/// -- writes a small, read-only StreakWidgetSnapshot (Kit) into the shared
/// App Group's UserDefaults suite and nudges WidgetKit to reload
/// LearnWithAlphonsoWidget's timeline. One-directional by design: the
/// widget extension only ever reads this back (StreakTimelineProvider),
/// never writes to it -- see WidgetSharing.swift's doc comments in the Kit
/// for the full app <-> widget contract.
///
/// Wired directly into SyncQueueStore.updateLastKnownProgress rather than
/// each call site (LessonPlayerView.finish(), RootView's sync trigger)
/// remembering to call this separately -- both already funnel through
/// that one function, so the widget picks up both a fresh lesson
/// completion and an ordinary background/foreground sync for free.
enum WidgetProgressPublisher {
    static func publish(_ progress: LessonCompletionProgress, now: Date = Date()) {
        guard let defaults = UserDefaults(suiteName: WidgetSharing.appGroupID) else {
            // App Group not available -- e.g. running on a build/profile
            // where the App Group entitlement hasn't been provisioned yet
            // (see WidgetSharing.appGroupID's doc comment). Not fatal: the
            // widget just falls back to its "nothing published yet" state.
            return
        }
        let snapshot = makeStreakWidgetSnapshot(
            streak: progress.streak,
            longestStreak: progress.longestStreak,
            lastActiveDate: progress.lastActiveDate,
            now: now
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: WidgetSharing.streakSnapshotDefaultsKey)
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetSharing.streakWidgetKind)
    }
}
