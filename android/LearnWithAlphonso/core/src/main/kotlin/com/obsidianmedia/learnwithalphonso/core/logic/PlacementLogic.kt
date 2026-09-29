package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.content.placementOrder
import kotlin.math.min
import kotlin.random.Random

/** Port of PlacementLogic.swift / src/data/placement.ts. PlacementLogicTest carries placement.test.ts's vectors. */

/** Drops listening questions when audio cannot play: their audio text IS the answer, so text would be a free mark. */
fun playablePlacementPool(pool: List<PlacementQuestion>, canPlayAudio: Boolean): List<PlacementQuestion> =
    if (canPlayAudio) pool else pool.filterNot { it is PlacementQuestion.Listening }

/** A fresh shuffle per band, then the first 3, so a retake shows different questions. */
fun pickPlacementSet(pool: List<PlacementQuestion>, random: Random = Random.Default): List<PlacementQuestion> =
    placementOrder.flatMap { level -> pool.filter { it.level == level }.shuffled(random).take(3) }

/** Every band key stays present (possibly empty); nextAdaptiveBand depends on that. */
fun groupByBand(questions: List<PlacementQuestion>): Map<String, List<PlacementQuestion>> {
    val grouped = placementOrder.associateWith { mutableListOf<PlacementQuestion>() }
    for (q in questions) grouped[q.level]?.add(q)
    return grouped
}

data class AdaptiveBandDecision(
    /** True when the exam ends here. */
    val stop: Boolean,
    /** A band that receives synthetic pass credit without being shown. */
    val skipped: String?,
    /** The placementOrder index to test next (meaningless when stop is true). */
    val nextIdx: Int,
)

/**
 * Stop on a zero band; skip one band ahead on a perfect score only when a
 * real band exists two steps out; otherwise advance by one.
 */
fun nextAdaptiveBand(
    bandPool: Map<String, List<PlacementQuestion>>,
    currentIdx: Int,
    correctInBand: Int,
): AdaptiveBandDecision {
    val last = placementOrder.size - 1
    val bandSize = bandPool[placementOrder[currentIdx]]?.size ?: 0
    if (bandSize == 0 || correctInBand == 0) return AdaptiveBandDecision(true, null, currentIdx)
    val landingIdx = currentIdx + 2
    val landingHasContent = landingIdx <= last && (bandPool[placementOrder[landingIdx]]?.size ?: 0) > 0
    if (correctInBand == bandSize && landingHasContent) {
        return AdaptiveBandDecision(false, placementOrder[currentIdx + 1], landingIdx)
    }
    return AdaptiveBandDecision(false, null, currentIdx + 1)
}

data class PlacementScore(val level: String, val passed: List<String>)

/** A band passes with at least 2 of 3; placement lands one band above the last consecutive pass, capped at C1. */
fun scorePlacement(correctByLevel: Map<String, Int>): PlacementScore {
    val passed = mutableListOf<String>()
    for (level in placementOrder) {
        if ((correctByLevel[level] ?: 0) >= 2) passed.add(level) else break
    }
    val lastPassed = passed.lastOrNull() ?: return PlacementScore("A1", passed)
    val idx = placementOrder.indexOf(lastPassed)
    return PlacementScore(placementOrder[min(idx + 1, placementOrder.size - 1)], passed)
}

/** Grades the submitted TEXT; an empty answer is wrong rather than an error. */
fun isPlacementAnswerCorrect(question: PlacementQuestion, answer: String?): Boolean {
    val given = (answer ?: "").trim()
    if (given.isEmpty()) return false
    return when (question) {
        is PlacementQuestion.MultipleChoice ->
            question.answer in question.choices.indices && question.choices[question.answer] == given
        is PlacementQuestion.Listening -> question.answer == given
        is PlacementQuestion.Translate -> TranslationAnswer.matches(given, question.acceptableAnswers)
    }
}
