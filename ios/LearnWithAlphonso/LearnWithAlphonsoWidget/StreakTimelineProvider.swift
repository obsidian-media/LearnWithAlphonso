import WidgetKit
import LearnWithAlphonsoKit

/// One timeline entry: the snapshot last published by the app (see
/// WidgetProgressPublisher.swift, app target), or nil if nothing's been
/// published yet (fresh install, or the App Group entitlement isn't
/// provisioned on this build -- see WidgetSharing.appGroupID's doc
/// comment). StreakWidgetView renders the nil case as a "come study" empty
/// state rather than crashing or showing garbage.
struct StreakEntry: TimelineEntry {
    let date: Date
    let snapshot: StreakWidgetSnapshot?
}

/// Reads WidgetSharing's shared App Group UserDefaults suite -- this
/// extension is read-only, it never writes back to it (the app is the
/// only writer, via WidgetProgressPublisher). No network or SwiftData
/// access here: a widget extension process is short-lived and sandboxed
/// separately from the app, so the shared UserDefaults snapshot (already
/// the app's own "last known progress" cache, see SyncQueueStore) is the
/// only data source that makes sense here, not a second round trip to
/// Supabase.
struct StreakTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(
            date: Date(),
            snapshot: StreakWidgetSnapshot(streak: 4, longestStreak: 12, studiedToday: false, updatedAt: Date())
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        completion(StreakEntry(date: Date(), snapshot: Self.readSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let entry = StreakEntry(date: Date(), snapshot: Self.readSnapshot())
        // This app has no push-widget-update plumbing (that's a separate,
        // materially bigger lift -- see V4 candidate #2's push-notification
        // scoping for the closest equivalent) -- WidgetProgressPublisher's
        // explicit WidgetCenter.reloadTimelines() call after every
        // completion/sync is the real refresh signal while the app is
        // actually being used. This fixed 4-hour reload is only a
        // safety net against the widget going visibly stale (e.g. showing
        // "not studied today" into the next calendar day) if the app is
        // never reopened.
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 4, to: entry.date)
            ?? entry.date.addingTimeInterval(4 * 60 * 60)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private static func readSnapshot() -> StreakWidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: WidgetSharing.appGroupID),
              let data = defaults.data(forKey: WidgetSharing.streakSnapshotDefaultsKey)
        else {
            return nil
        }
        return try? JSONDecoder().decode(StreakWidgetSnapshot.self, from: data)
    }
}
