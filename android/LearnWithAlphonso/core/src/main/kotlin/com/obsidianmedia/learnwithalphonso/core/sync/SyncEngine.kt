package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient

/**
 * Port of SyncEngine.swift. Replays queued offline work through the same
 * client calls the online path uses. Persistence is the caller's job.
 *
 * Lesson completions drain oldest-first but independently: complete-lesson
 * is replay-safe, so a failure does not block later ones. Review grades
 * drain strictly oldest-first and stop at the first failure, because
 * grade-review advances an item's current SM-2 state and grade N+1 must land
 * on whatever state grade N left behind.
 */
object SyncEngine {
    suspend fun sync(
        pendingLessonCompletions: List<PendingLessonCompletion>,
        pendingReviewGrades: List<PendingReviewGrade>,
        client: ProgressSyncClient,
    ): SyncResult {
        val syncedCompletions = ArrayList<PendingLessonCompletion>()
        var lastKnownProgress: LessonCompletionProgress? = null

        for (completion in pendingLessonCompletions.sortedBy { it.queuedAt }) {
            try {
                val token = client.startLessonSession(completion.lessonId, completion.course)
                val result = client.completeLesson(
                    lessonId = completion.lessonId,
                    total = completion.total,
                    answers = completion.answers,
                    course = completion.course,
                    sessionToken = token,
                )
                syncedCompletions.add(completion)
                lastKnownProgress = result.progress
            } catch (_: Exception) {
                // Left queued; retried on the next sync trigger.
            }
        }

        val syncedGrades = ArrayList<PendingReviewGrade>()
        for (grade in pendingReviewGrades.sortedBy { it.queuedAt }) {
            try {
                client.gradeReview(grade.itemKey, grade.answer, grade.course)
                syncedGrades.add(grade)
            } catch (_: Exception) {
                break
            }
        }

        return SyncResult(syncedCompletions, syncedGrades, lastKnownProgress)
    }
}
