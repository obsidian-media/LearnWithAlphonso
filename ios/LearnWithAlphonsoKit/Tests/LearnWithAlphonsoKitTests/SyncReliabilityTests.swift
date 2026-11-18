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

    private func shown(_ streak: Int, _ last: String, freezes: Int?, basis: String? = "local", today: String = "2026-11-17") -> StreakDisplay.Shown {
        StreakDisplay.shown(streak: streak, lastActiveDate: last, streakFreezes: freezes, dayBasis: basis, today: today)
    }

    // The server's step (computeStreakUpdate / local_days.sql), case by case.

    func testTheServerStepSameDayChangesNothing() {
        let o = StreakRule.next(streak: 5, longestStreak: 8, lastActiveDate: "2026-11-17", today: "2026-11-17", freezes: 1, dayBasis: "local")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 5, longestStreak: 8, freezes: 1, spentFreeze: false))
        let future = StreakRule.next(streak: 5, longestStreak: 8, lastActiveDate: "2026-11-18", today: "2026-11-17", freezes: 1, dayBasis: "local")
        XCTAssertEqual(future.streak, 5, "a skewed future day is treated as today")
    }

    func testTheServerStepNextDayAddsOne() {
        let o = StreakRule.next(streak: 5, longestStreak: 5, lastActiveDate: "2026-11-16", today: "2026-11-17", freezes: 0, dayBasis: "local")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 6, longestStreak: 6, freezes: 0, spentFreeze: false))
    }

    func testTheServerStepOneMissedDaySpendsAFreeze() {
        let o = StreakRule.next(streak: 5, longestStreak: 9, lastActiveDate: "2026-11-15", today: "2026-11-17", freezes: 2, dayBasis: "local")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 6, longestStreak: 9, freezes: 1, spentFreeze: true))
    }

    func testTheServerStepOneMissedDayWithoutAFreezeRestarts() {
        let o = StreakRule.next(streak: 5, longestStreak: 9, lastActiveDate: "2026-11-15", today: "2026-11-17", freezes: 0, dayBasis: "local")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 1, longestStreak: 9, freezes: 0, spentFreeze: false))
    }

    /// The one-time bridge from UTC days: a gap of two is the next day, with no freeze spent.
    func testTheServerStepBridgesTheUtcDayOnceWithoutAFreeze() {
        let o = StreakRule.next(streak: 5, longestStreak: 5, lastActiveDate: "2026-11-15", today: "2026-11-17", freezes: 1, dayBasis: "utc")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 6, longestStreak: 6, freezes: 1, spentFreeze: false))
        XCTAssertTrue(StreakRule.bridgesUtcDay(nil), "an unread basis is the server's default, utc")
    }

    /// Two or more missed days restart the run, whatever the freezes and the basis.
    func testTheServerStepTwoMissedDaysRestartWhateverTheFreezes() {
        for basis in ["local", "utc"] {
            let o = StreakRule.next(streak: 12, longestStreak: 12, lastActiveDate: "2026-11-14", today: "2026-11-17", freezes: 5, dayBasis: basis)
            XCTAssertEqual(o, StreakRule.Outcome(streak: 1, longestStreak: 12, freezes: 5, spentFreeze: false), basis)
        }
    }

    func testTheServerStepEarnsAFreezeOnEveryTenthDay() {
        let o = StreakRule.next(streak: 9, longestStreak: 9, lastActiveDate: "2026-11-16", today: "2026-11-17", freezes: 0, dayBasis: "local")
        XCTAssertEqual(o, StreakRule.Outcome(streak: 10, longestStreak: 10, freezes: 1, spentFreeze: false))
        let spentAndEarned = StreakRule.next(streak: 19, longestStreak: 19, lastActiveDate: "2026-11-15", today: "2026-11-17", freezes: 1, dayBasis: "local")
        XCTAssertEqual(spentAndEarned, StreakRule.Outcome(streak: 20, longestStreak: 20, freezes: 1, spentFreeze: true))
    }

    // The displayed streak is that step's verdict.

    func testTheStreakReadsNormallyWhenStudiedTodayOrYesterday() {
        XCTAssertEqual(shown(12, "2026-11-17", freezes: 0), StreakDisplay.Shown(streak: 12, state: .active))
        XCTAssertEqual(shown(12, "2026-11-16", freezes: 0), StreakDisplay.Shown(streak: 12, state: .active),
                       "yesterday still counts: today is not over")
    }

    func testOneMissedDayCoveredByAFreezeReadsAsProtected() {
        XCTAssertEqual(shown(12, "2026-11-15", freezes: 1), StreakDisplay.Shown(streak: 12, state: .protected))
        XCTAssertEqual(StreakDisplay.accessibilityLabel(shown(12, "2026-11-15", freezes: 1)),
                       "12-day streak, protected by a streak freeze")
        XCTAssertEqual(StreakDisplay.accessibilityLabel(shown(1, "2026-11-17", freezes: 0)), "Streak: 1 day")
    }

    func testTheUtcBridgeReadsAsActiveNotProtected() {
        XCTAssertEqual(shown(12, "2026-11-15", freezes: 0, basis: "utc"), StreakDisplay.Shown(streak: 12, state: .active))
        XCTAssertEqual(shown(12, "2026-11-15", freezes: 3, basis: nil), StreakDisplay.Shown(streak: 12, state: .active))
    }

    func testTheStreakReadsZeroWhenTheServerWouldRestartIt() {
        XCTAssertEqual(shown(12, "2026-11-15", freezes: 0), StreakDisplay.Shown(streak: 0, state: .lapsed), "one missed, no freeze")
        XCTAssertEqual(shown(12, "2026-11-14", freezes: 5), StreakDisplay.Shown(streak: 0, state: .lapsed),
                       "two missed: no freeze count saves it on the server")
        XCTAssertEqual(shown(12, "2026-11-15", freezes: nil).streak, 0, "an unknown freeze count protects nothing")
        XCTAssertEqual(StreakDisplay.accessibilityLabel(shown(12, "2026-11-15", freezes: 0)), "Streak: 0 days")
    }

    func testTheStreakUsesTheLearnersLocalDay() {
        // 15:00 UTC is already 2026-11-18 in Auckland (UTC+13), so the 16th is two days ago there: one missed day.
        let auckland = TimeZone(identifier: "Pacific/Auckland")!
        func at(_ last: String, freezes: Int, _ tz: TimeZone) -> StreakDisplay.State {
            StreakDisplay.shown(streak: 3, lastActiveDate: last, streakFreezes: freezes, dayBasis: "local", now: now, timeZone: tz).state
        }
        XCTAssertEqual(at("2026-11-16", freezes: 0, auckland), .lapsed)
        XCTAssertEqual(at("2026-11-16", freezes: 1, auckland), .protected)
        XCTAssertEqual(at("2026-11-17", freezes: 0, auckland), .active)
        // In Los Angeles (UTC-8) it is still 07:00 on the 17th: the 16th is yesterday.
        let losAngeles = TimeZone(identifier: "America/Los_Angeles")!
        XCTAssertEqual(at("2026-11-16", freezes: 0, losAngeles), .active)
        XCTAssertEqual(at("2026-11-15", freezes: 0, losAngeles), .lapsed)
    }

    /// One second either side of local midnight decides whether a day was missed.
    func testTheDayChangesAtLocalMidnight() {
        let utcMidnight18th = Date(timeIntervalSince1970: 1_794_960_000) // 2026-11-18 00:00 UTC
        func at(_ date: Date) -> StreakDisplay.State {
            StreakDisplay.shown(streak: 4, lastActiveDate: "2026-11-16", streakFreezes: 0, dayBasis: "local", now: date, timeZone: utc).state
        }
        XCTAssertEqual(at(utcMidnight18th.addingTimeInterval(-1)), .active)
        XCTAssertEqual(at(utcMidnight18th), .lapsed)
    }

    /// The queued lesson's estimate is the server's own step: N+1 and a freeze spent after one missed day.
    func testAQueuedLessonAfterOneMissedDayEstimatesTheFreezeTheServerSpends() {
        let cached = LessonCompletionProgress(
            xp: 500, streak: 7, longestStreak: 7, lastActiveDate: "2026-11-15", hearts: 3, heartsRefillAt: nil,
            streakFreezes: 2, leagueTier: "silver", dayBasis: "local")
        let after = QueuedLessonPolicy.optimisticProgress(after: cached, now: now, timeZone: utc)
        XCTAssertEqual(after.streak, 8)
        XCTAssertEqual(after.streakFreezes, 1)
        XCTAssertEqual(after.lastActiveDate, "2026-11-17")
        XCTAssertEqual(after.dayBasis, "local")
        let bridged = QueuedLessonPolicy.optimisticProgress(after: cached.withDayBasis("utc"), now: now, timeZone: utc)
        XCTAssertEqual(bridged.streak, 8)
        XCTAssertEqual(bridged.streakFreezes, 2, "the bridge spends no freeze")
    }

    func testTheProfileShowsTheSameStreakAsTheHeader() {
        let data = ProfileOverviewData(
            today: "2026-11-17", course: "en", streak: 9, longestStreak: 9, streakFreezes: 1,
            lastActiveDate: "2026-11-15", dayBasis: "local", localToday: "2026-11-17")
        let big = ProfileMath.bigNumbers(data, vocabTerms: { _ in [] })
        let header = StreakDisplay.shown(streak: 9, lastActiveDate: "2026-11-15", streakFreezes: 1, dayBasis: "local", today: "2026-11-17")
        XCTAssertEqual(big.streak, header.streak)
        XCTAssertEqual(big.streakState, .protected)
        var lapsed = data
        lapsed.streakFreezes = 0
        XCTAssertEqual(ProfileMath.bigNumbers(lapsed, vocabTerms: { _ in [] }).streak, 0)
    }

    func testTheWidgetSnapshotFollowsTheServerRuleDayByDay() {
        let stale = makeStreakWidgetSnapshot(streak: 12, longestStreak: 12, lastActiveDate: "2026-11-14", now: now, timeZone: utc)
        XCTAssertEqual(stale.streak, 0)
        XCTAssertFalse(stale.isStreakProtected)
        XCTAssertEqual(stale.longestStreak, 12)
        // Published while the streak was alive, with one freeze, read by the widget on later days.
        let published = makeStreakWidgetSnapshot(
            streak: 6, longestStreak: 6, lastActiveDate: "2026-11-17", now: now, timeZone: utc, streakFreezes: 1, dayBasis: "local")
        XCTAssertEqual(published.streak, 6)
        XCTAssertFalse(published.isStreakProtected)
        let nextDay = published.asOf(now.addingTimeInterval(24 * 3600), timeZone: utc)
        XCTAssertEqual(nextDay.streak, 6)
        XCTAssertFalse(nextDay.isStreakProtected)
        let oneMissed = published.asOf(now.addingTimeInterval(2 * 24 * 3600), timeZone: utc)
        XCTAssertEqual(oneMissed.streak, 6)
        XCTAssertTrue(oneMissed.isStreakProtected)
        let twoMissed = published.asOf(now.addingTimeInterval(3 * 24 * 3600), timeZone: utc)
        XCTAssertEqual(twoMissed.streak, 0)
        XCTAssertFalse(twoMissed.isStreakProtected)
    }

    /// A snapshot written before the freeze fields existed still decodes, as unprotected with no freezes.
    func testAnOlderWidgetSnapshotDecodesWithoutTheFreezeFields() throws {
        let json = #"{"streak":4,"longestStreak":9,"studiedToday":false,"updatedAt":0}"#
        let decoded = try JSONDecoder().decode(StreakWidgetSnapshot.self, from: Data(json.utf8))
        XCTAssertNil(decoded.streakFreezes)
        XCTAssertFalse(decoded.isStreakProtected)
        XCTAssertNil(decoded.lastActiveDate)
        XCTAssertNil(decoded.dayBasis)
        let roundTrip = try JSONDecoder().decode(
            StreakWidgetSnapshot.self,
            from: JSONEncoder().encode(makeStreakWidgetSnapshot(
                streak: 2, longestStreak: 2, lastActiveDate: "2026-11-15", now: now, timeZone: utc, streakFreezes: 1, dayBasis: "local")))
        XCTAssertTrue(roundTrip.isStreakProtected)
        XCTAssertEqual(roundTrip.streakFreezes, 1)
        XCTAssertEqual(roundTrip.dayBasis, "local")
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
