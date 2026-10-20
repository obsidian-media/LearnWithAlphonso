package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import kotlinx.coroutines.CancellationException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Exponential backoff for queued items that failed for a reason waiting can fix (server trouble, a rate limit, a
 * timeout). They retry forever, never faster than [baseDelayMillis] and never slower than [maxDelayMillis], and are
 * never dead-lettered: only a permanent rejection leaves the queue (SyncRetryPolicy.swift).
 */
data class SyncRetryPolicy(val baseDelayMillis: Long, val maxDelayMillis: Long) {
    /** `attempt` is the number of failures so far (1 after the first). */
    fun delayMillis(afterAttempt: Int): Long {
        val doublings = min(max(0, afterAttempt - 1), 30)
        val raw = baseDelayMillis.toDouble() * 2.0.pow(doublings)
        return min(maxDelayMillis.toDouble(), raw).toLong()
    }

    companion object {
        val STANDARD = SyncRetryPolicy(baseDelayMillis = 30_000L, maxDelayMillis = 6L * 60 * 60 * 1000)
    }
}

/**
 * The seam SyncEngine drains through: the live client in the app, a script in tests.
 */
interface SyncApi : LessonCompletionApi {
    suspend fun gradeReview(itemKey: String, answer: String, course: String, attemptId: String?, expectedDueOn: String?, expectedLastReviewedAt: String?)
}

/**
 * Port of SyncEngine.swift. Replays queued offline work through the same client calls the online path uses.
 * Persistence is the caller's job.
 *
 * Failures are classified ([LessonCompletionError]): transient ones back off and retry forever, only permanent ones are
 * dead-lettered, so one bad item never blocks the queue and a flaky network never loses one. Rows that belong to
 * another account are dropped, never sent.
 *
 * Lesson completions drain oldest-first but independently: complete-lesson is replay-safe, so a failure does not block
 * later ones. Review grades drain strictly oldest-first and stop at the first transient failure, because grade-review
 * advances an item's current SM-2 state and grade N+1 must land on whatever state grade N left behind. A grade the
 * server will never accept (a 4xx) is dead-lettered and the next one continues.
 */
object SyncEngine {
    suspend fun sync(
        pendingLessonCompletions: List<PendingLessonCompletion>,
        pendingReviewGrades: List<PendingReviewGrade>,
        client: SyncApi,
        currentUserId: String? = null,
        nowMillis: Long = System.currentTimeMillis(),
        policy: SyncRetryPolicy = SyncRetryPolicy.STANDARD,
        /**
         * Asked before every request. The client sends whichever account's token is current, so once the account
         * changes the rest of the pass must not run: account A's rows would go out under account B's token.
         */
        isCurrentAccount: () -> Boolean = { true },
    ): SyncResult {
        fun isForeign(owner: String?) = owner != null && currentUserId != null && owner != currentUserId
        val service = LessonCompletionService(client)

        val synced = ArrayList<PendingLessonCompletion>()
        val rescheduled = ArrayList<PendingLessonCompletion>()
        val dead = ArrayList<DeadLetter<PendingLessonCompletion>>()
        val foreign = ArrayList<PendingLessonCompletion>()
        var lastKnownProgress: LessonCompletionProgress? = null

        for (completion in pendingLessonCompletions.sortedBy { it.queuedAt }) {
            if (isForeign(completion.ownerUserId)) { foreign.add(completion); continue }
            if (completion.nextAttemptAt?.let { it > nowMillis } == true) continue
            if (!isCurrentAccount()) break
            val result = service.complete(LessonCompletionRequest(completion))
            val error = result.exceptionOrNull() as? LessonCompletionError
            when {
                error == null -> {
                    synced.add(completion)
                    lastKnownProgress = result.getOrThrow().progress
                }
                // Not a failure of the lesson: wait for a refill, without spending an attempt.
                error == LessonCompletionError.Rejected("out-of-hearts") ->
                    rescheduled.add(completion.rescheduled(completion.attemptCount, nowMillis + HeartsEconomy.HEART_REFILL_MS))
                error == LessonCompletionError.Unauthorized -> Unit
                // No connection is not the server struggling, so it earns no growing backoff: the item waits the
                // shortest delay and its failure count is left alone. Backing off here left a lesson finished on a
                // train unsynced for up to hours after the phone was back online.
                error == LessonCompletionError.Offline ->
                    rescheduled.add(completion.rescheduled(completion.attemptCount, nowMillis + policy.baseDelayMillis))
                error.shouldQueue -> {
                    // Transient: back off and keep it, however many times it fails. attemptCount only drives the backoff.
                    val failures = completion.attemptCount + 1
                    rescheduled.add(completion.rescheduled(failures, nowMillis + policy.delayMillis(failures)))
                }
                else -> dead.add(DeadLetter(completion, error.reasonCode))
            }
        }

        val syncedGrades = ArrayList<PendingReviewGrade>()
        val rescheduledGrades = ArrayList<PendingReviewGrade>()
        val deadGrades = ArrayList<DeadLetter<PendingReviewGrade>>()
        val foreignGrades = ArrayList<PendingReviewGrade>()

        for (grade in pendingReviewGrades.sortedBy { it.queuedAt }) {
            if (isForeign(grade.ownerUserId)) { foreignGrades.add(grade); continue }
            if (grade.nextAttemptAt?.let { it > nowMillis } == true) break
            if (!isCurrentAccount()) break
            try {
                client.gradeReview(grade.itemKey, grade.answer, grade.course, grade.queueIdentity, grade.expectedDueOn, grade.expectedLastReviewedAt)
                syncedGrades.add(grade)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val classified = LessonCompletionError.classify(e)
                if (classified == LessonCompletionError.Unauthorized) break
                if (classified == LessonCompletionError.Offline) {
                    // Same as a lesson completion: no connection earns the shortest wait and no backoff growth.
                    rescheduledGrades.add(grade.rescheduled(grade.attemptCount, nowMillis + policy.baseDelayMillis))
                    break
                }
                if (classified.shouldQueue) {
                    val failures = grade.attemptCount + 1
                    rescheduledGrades.add(grade.rescheduled(failures, nowMillis + policy.delayMillis(failures)))
                    break
                }
                deadGrades.add(DeadLetter(grade, classified.reasonCode))
            }
        }

        return SyncResult(
            syncedLessonCompletions = synced, syncedReviewGrades = syncedGrades, lastKnownProgress = lastKnownProgress,
            rescheduledLessonCompletions = rescheduled, deadLetteredLessonCompletions = dead,
            droppedForeignLessonCompletions = foreign, rescheduledReviewGrades = rescheduledGrades,
            deadLetteredReviewGrades = deadGrades, droppedForeignReviewGrades = foreignGrades,
        )
    }
}

/** The common call: the live client, adapted. */
suspend fun SyncEngine.sync(
    pendingLessonCompletions: List<PendingLessonCompletion>,
    pendingReviewGrades: List<PendingReviewGrade>,
    client: ProgressSyncClient,
    currentUserId: String? = null,
    nowMillis: Long = System.currentTimeMillis(),
    policy: SyncRetryPolicy = SyncRetryPolicy.STANDARD,
    isCurrentAccount: () -> Boolean = { true },
): SyncResult = sync(pendingLessonCompletions, pendingReviewGrades, ProgressSyncApi(client), currentUserId, nowMillis, policy, isCurrentAccount)

/** An adapter from the real client to [SyncApi]. */
class ProgressSyncApi(private val client: ProgressSyncClient) : SyncApi, LessonCompletionApi by client {
    override suspend fun gradeReview(itemKey: String, answer: String, course: String, attemptId: String?, expectedDueOn: String?, expectedLastReviewedAt: String?) {
        client.gradeReview(itemKey, answer, course, attemptId, expectedDueOn, expectedLastReviewedAt)
    }
}

/**
 * When the sync queue should wake itself (RootView.swift's retry task). The floor is what stops a loop: an item that is
 * due but cannot be sent yet (the session could not be refreshed, say) would otherwise start a new pass the moment the
 * last one ended.
 */
object SyncWakeup {
    const val MINIMUM_DELAY_MILLIS = 30_000L

    /**
     * When the next pass could send something for this account; null means nothing is waiting. Every lesson completion
     * is tried on its own schedule, but review grades are sent strictly oldest first, so only the oldest grade's time
     * counts. Rows with no owner (queued by an older build) are synced as the current account's, so they count too.
     */
    fun nextPendingAttempt(userId: String, completions: List<PendingLessonCompletion>, grades: List<PendingReviewGrade>, nowMillis: Long): Long? {
        fun mine(owner: String?) = owner == null || owner == userId
        val lessonDates = completions.filter { mine(it.ownerUserId) }.map { it.nextAttemptAt ?: nowMillis }
        val oldestGrade = grades.filter { mine(it.ownerUserId) }.minByOrNull { it.queuedAt }
        val gradeDates = oldestGrade?.let { listOf(it.nextAttemptAt ?: nowMillis) } ?: emptyList()
        return (lessonDates + gradeDates).minOrNull()
    }

    /** How long to sleep before the next pass for [dueAtMillis], never less than the floor. */
    fun delayMillis(dueAtMillis: Long, nowMillis: Long): Long = max(MINIMUM_DELAY_MILLIS, dueAtMillis - nowMillis)
}
