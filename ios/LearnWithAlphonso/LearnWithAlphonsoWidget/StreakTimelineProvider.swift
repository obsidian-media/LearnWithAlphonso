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
        let now = Date()
        completion(StreakEntry(date: now, snapshot: Self.readSnapshot()?.asOf(now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let stored = Self.readSnapshot()
        // WidgetProgressPublisher's WidgetCenter.reloadTimelines() call after every completion or sync is the
        // real refresh signal while the app is in use. Two things cover the app not being opened:
        //  - a second entry at the next UTC midnight, so "Studied today" turns off the moment the day changes
        //    (the stored value is only true for the day it was written);
        //  - a 4-hour reload as a general safety net.
        let midnight = nextUTCMidnight(after: now)
        let entries = [
            StreakEntry(date: now, snapshot: stored?.asOf(now)),
            StreakEntry(date: midnight, snapshot: stored?.asOf(midnight)),
        ]
        let fourHours = Calendar.current.date(byAdding: .hour, value: 4, to: now) ?? now.addingTimeInterval(4 * 60 * 60)
        let nextRefresh = max(fourHours, midnight.addingTimeInterval(60))
        completion(Timeline(entries: entries, policy: .after(nextRefresh)))
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
