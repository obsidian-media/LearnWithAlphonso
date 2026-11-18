import Foundation
import XCTest
@testable import LearnWithAlphonsoKit

/// The small pieces behind the iOS sync-reliability fixes: single-flight refresh, the sign-out guard, what a
/// queued lesson does locally, the displayed streak, the retry caps and clamps, and the submit gate.
final class SyncReliabilityTests: XCTestCase {
    private let utc = TimeZone(identifier: "UTC")!
    /// 2026-11-17 15:00 UTC.
    private let now = Date(timeIntervalSince1970: 1_794_927_600)

    private func progress(streak: Int, longest: Int = 10, lastActive: String) -> LessonCompletionProgress {
        LessonCompletionProgress(
            xp: 500, streak: streak, longestStreak: longest, lastActiveDate: lastActive, hearts: 3,
            heartsRefillAt: nil, streakFreezes: 1, leagueTier: "silver")
    }

    // MARK: - SingleFlight (token refresh)

    /// Supabase rotates refresh tokens: two overlapping refreshes send the same one twice, the second is
    /// rejected, and a rejected refresh signs out. Concurrent callers must share one run.
    @MainActor
    func testConcurrentCallersShareOneRunAndAllGetItsResult() async {
        let flight = SingleFlight<String>()
        let runs = TestCapture(0)
        let gate = AsyncGate()
        let operation: @MainActor () async -> String = {
            runs.value += 1
            await gate.wait()
            return "token-\(runs.value)"
        }
        let callers = (0..<3).map { _ in Task { @MainActor in await flight.run(operation) } }
        await waitUntil { flight.isRunning && runs.value == 1 }
        // Give the other two callers every chance to start a second run before the first one finishes.
        await drainMainActor()
        gate.open()
        var results: [String] = []
        for caller in callers { results.append(await caller.value) }
        XCTAssertEqual(runs.value, 1)
        XCTAssertEqual(results, ["token-1", "token-1", "token-1"])
        XCTAssertFalse(flight.isRunning)
    }

    @MainActor
    func testACallAfterTheRunFinishedStartsANewRun() async {
        let flight = SingleFlight<Int>()
        let runs = TestCapture(0)
        let first = await flight.run { runs.value += 1; return runs.value }
        let second = await flight.run { runs.value += 1; return runs.value }
        XCTAssertEqual([first, second], [1, 2])
    }

    // MARK: - Sign-out guard

    func testSignOutWithNothingWaitingSignsOutAtOnce() {
        XCTAssertEqual(SignOutGuard.decide(pendingLessons: 0, pendingReviewAnswers: 0), .signOut)
    }

    func testSignOutWithWorkStillWaitingAsksFirstAndSaysHowMuch() {
        guard case let .confirm(title, message) = SignOutGuard.decide(pendingLessons: 2, pendingReviewAnswers: 0) else {
            return XCTFail("must ask")
        }
        XCTAssertEqual(title, "2 lessons haven't synced yet. Sign out anyway?")
        XCTAssertEqual(message, SignOutGuard.message)
        guard case let .confirm(one, _) = SignOutGuard.decide(pendingLessons: 1, pendingReviewAnswers: 3) else {
            return XCTFail("must ask")
        }
        XCTAssertEqual(one, "1 lesson and 3 review answers haven't synced yet. Sign out anyway?")
        guard case let .confirm(reviews, _) = SignOutGuard.decide(pendingLessons: 0, pendingReviewAnswers: 1) else {
            return XCTFail("must ask")
        }
        XCTAssertEqual(reviews, "1 review answer hasn't synced yet. Sign out anyway?")
    }

    // MARK: - A lesson that goes into the queue

    func testALiveFinishQueuesBehindAnOlderQueuedLesson() {
        XCTAssertTrue(QueuedLessonPolicy.mustQueueBehindPending(pendingLessons: 1))
        XCTAssertFalse(QueuedLessonPolicy.mustQueueBehindPending(pendingLessons: 0))
    }

    /// When the queue could not reach disk, "Saved" would be a lie.
    func testAQueuedLessonThatIsNotOnDiskNeverSaysSaved() {
        XCTAssertEqual(QueuedLessonPolicy.finishMessage(reason: .offline, isDurable: true), Copy.savedOffline)
        let atRisk = QueuedLessonPolicy.finishMessage(reason: .offline, isDurable: false)
        XCTAssertEqual(atRisk, QueuedLessonPolicy.notDurableMessage)
        XCTAssertFalse(atRisk.localizedCaseInsensitiveContains("saved."))
        XCTAssertTrue(atRisk.contains("lost"))
    }

    func testTheKeptForSignInCopyNeverSaysTheLessonWasLost() {
        XCTAssertTrue(QueuedLessonPolicy.keptForSignInMessage.contains("kept"))
        XCTAssertFalse(QueuedLessonPolicy.keptForSignInMessage.contains("couldn't be saved"))
        XCTAssertTrue(QueuedLessonPolicy.queuedBehindMessage.hasPrefix("Saved."))
    }

    func testAQueuedLessonMarksTodayStudiedAndContinuesYesterdaysStreak() {
        let after = QueuedLessonPolicy.optimisticProgress(after: progress(streak: 4, lastActive: "2026-11-16"), now: now, timeZone: utc)
        XCTAssertEqual(after.lastActiveDate, "2026-11-17")
        XCTAssertEqual(after.streak, 5)
        XCTAssertEqual(after.xp, 500, "XP waits for the server")
        XCTAssertEqual(after.hearts, 3)
    }

    func testAQueuedLessonAfterAGapStartsAtOneAndASecondOneTodayChangesNothing() {
        let gap = QueuedLessonPolicy.optimisticProgress(after: progress(streak: 9, lastActive: "2026-11-10"), now: now, timeZone: utc)
        XCTAssertEqual(gap.streak, 1)
        XCTAssertEqual(gap.longestStreak, 10)
        let again = QueuedLessonPolicy.optimisticProgress(after: progress(streak: 5, lastActive: "2026-11-17"), now: now, timeZone: utc)
        XCTAssertEqual(again.streak, 5)
        XCTAssertEqual(again.lastActiveDate, "2026-11-17")
    }

    /// The widget and the 8 pm reminder read lastActiveDate: today means "studied today".
    func testTheOptimisticProgressReadsAsStudiedTodayForTheWidget() {
        let after = QueuedLessonPolicy.optimisticProgress(after: progress(streak: 4, lastActive: "2026-11-15"), now: now, timeZone: utc)
        let snapshot = makeStreakWidgetSnapshot(
            streak: after.streak, longestStreak: after.longestStreak, lastActiveDate: after.lastActiveDate, now: now, timeZone: utc)
        XCTAssertTrue(snapshot.studiedToday)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        XCTAssertNil(nextStreakReminderDate(lastActiveDate: after.lastActiveDate, now: now, calendar: calendar))
    }

    /// A fetched progress row that has not seen the queued lesson yet must not undo the local "studied today".
    func testAFetchThatPredatesAQueuedLessonKeepsTheLocalDayAndStreak() {
        let local = progress(streak: 5, lastActive: "2026-11-17")
        let fetched = LessonCompletionProgress(
            xp: 640, streak: 4, longestStreak: 10, lastActiveDate: "2026-11-16", hearts: 5, heartsRefillAt: nil,
            streakFreezes: 2, leagueTier: "gold")
        let merged = QueuedLessonPolicy.merge(fetched: fetched, local: local, hasPendingLessons: true)
        XCTAssertEqual(merged.lastActiveDate, "2026-11-17")
        XCTAssertEqual(merged.streak, 5)
        XCTAssertEqual(merged.xp, 640, "everything else is the server's")
        XCTAssertEqual(merged.hearts, 5)
        XCTAssertEqual(merged.leagueTier, "gold")
        XCTAssertEqual(QueuedLessonPolicy.merge(fetched: fetched, local: local, hasPendingLessons: false), fetched,
                       "with nothing queued the server is the whole truth")
        XCTAssertEqual(QueuedLessonPolicy.merge(fetched: fetched, local: nil, hasPendingLessons: true), fetched)
    }

    // MARK: - Displayed streak

    func testTheStreakReadsZeroOnceADayWasMissed() {
        XCTAssertEqual(StreakDisplay.visibleStreak(streak: 12, lastActiveDate: "2026-11-17", now: now, timeZone: utc), 12)
        XCTAssertEqual(StreakDisplay.visibleStreak(streak: 12, lastActiveDate: "2026-11-16", now: now, timeZone: utc), 12,
                       "yesterday still counts: today is not over")
        XCTAssertEqual(StreakDisplay.visibleStreak(streak: 12, lastActiveDate: "2026-11-15", now: now, timeZone: utc), 0)
    }

    func testTheStreakUsesTheLearnersLocalDay() {
        // 15:00 UTC is already 2026-11-18 in Auckland (UTC+13), so the 16th is two days ago there.
        let auckland = TimeZone(identifier: "Pacific/Auckland")!
        XCTAssertEqual(StreakDisplay.visibleStreak(streak: 3, lastActiveDate: "2026-11-16", now: now, timeZone: auckland), 0)
        XCTAssertEqual(StreakDisplay.visibleStreak(streak: 3, lastActiveDate: "2026-11-17", now: now, timeZone: auckland), 3)
    }

    func testTheWidgetSnapshotShowsZeroAfterAMissedDay() {
        let stale = makeStreakWidgetSnapshot(streak: 12, longestStreak: 12, lastActiveDate: "2026-11-14", now: now, timeZone: utc)
        XCTAssertEqual(stale.streak, 0)
        XCTAssertEqual(stale.longestStreak, 12)
        // Published while the streak was alive, read by the widget two days later.
        let published = makeStreakWidgetSnapshot(streak: 6, longestStreak: 6, lastActiveDate: "2026-11-17", now: now, timeZone: utc)
        XCTAssertEqual(published.streak, 6)
        XCTAssertEqual(published.asOf(now.addingTimeInterval(24 * 3600), timeZone: utc).streak, 6)
        XCTAssertEqual(published.asOf(now.addingTimeInterval(2 * 24 * 3600), timeZone: utc).streak, 0)
    }

    // MARK: - Retry caps and clamps

    func testRetriesRunOutAfterTheAttemptCapOrAfterAWeekOfRealFailures() {
        let policy = SyncRetryPolicy.standard
        let queuedAt = now
        XCTAssertFalse(policy.hasExhaustedRetries(failures: 19, queuedAt: queuedAt, now: now))
        XCTAssertTrue(policy.hasExhaustedRetries(failures: 20, queuedAt: queuedAt, now: now))
        let aWeekLater = now.addingTimeInterval(7 * 24 * 3600)
        XCTAssertTrue(policy.hasExhaustedRetries(failures: 3, queuedAt: queuedAt, now: aWeekLater))
        XCTAssertFalse(policy.hasExhaustedRetries(failures: 1, queuedAt: queuedAt, now: aWeekLater),
                       "a week without signal is not a week of failures")
    }

    func testARetryTimeFromAClockSetDaysAheadIsReadAsDueNow() {
        let policy = SyncRetryPolicy.standard
        XCTAssertEqual(policy.clampedNextAttempt(now.addingTimeInterval(30 * 24 * 3600), now: now), now)
        XCTAssertEqual(policy.clampedNextAttempt(now.addingTimeInterval(policy.maxDelay), now: now), now.addingTimeInterval(policy.maxDelay),
                       "the longest real backoff is still honoured")
        XCTAssertEqual(policy.clampedNextAttempt(now.addingTimeInterval(60), now: now), now.addingTimeInterval(60))
        XCTAssertNil(policy.clampedNextAttempt(nil, now: now))
    }

    // MARK: - Submit gate

    func testASecondTapWhileSubmittingIsRefusedUntilTheFirstEnds() {
        var gate = SubmitGate()
        XCTAssertTrue(gate.begin())
        XCTAssertFalse(gate.begin())
        XCTAssertTrue(gate.isBusy)
        gate.end()
        XCTAssertTrue(gate.begin())
    }
}

/// Holds an async operation until the test opens it.
@MainActor
final class AsyncGate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var isOpen = false

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}
