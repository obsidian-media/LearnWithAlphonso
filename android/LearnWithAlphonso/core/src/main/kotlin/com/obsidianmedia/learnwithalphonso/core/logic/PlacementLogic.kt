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
 * real band exists two steps out; otherwise advance by one. The skip's
 * credit is only a bet that the band after it will be passed: callers use
 * [resolveBand], not this, to move between bands, because that is what
 * settles the bet.
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

/**
 * A band is passed with at least this many of its three questions correct. The one definition of "passed":
 * [scorePlacement] counts bands with it and [resolveBand] uses it to decide whether the band after a skip held up.
 */
const val PLACEMENT_PASS_MARK = 2

data class PlacementScore(val level: String, val passed: List<String>)

/** A band passes with at least [PLACEMENT_PASS_MARK] (2) of 3; placement lands one band above the last consecutive pass, capped at C1. */
fun scorePlacement(correctByLevel: Map<String, Int>): PlacementScore {
    val passed = mutableListOf<String>()
    for (level in placementOrder) {
        if ((correctByLevel[level] ?: 0) >= PLACEMENT_PASS_MARK) passed.add(level) else break
    }
    val lastPassed = passed.lastOrNull() ?: return PlacementScore("A1", passed)
    val idx = placementOrder.indexOf(lastPassed)
    return PlacementScore(placementOrder[min(idx + 1, placementOrder.size - 1)], passed)
}

/** What the adaptive walk remembers from one band to the next. */
data class PlacementTally(
    /**
     * Correct answers per band. A skipped band holds [PLACEMENT_PASS_MARK] for as long as its credit stands, and 0
     * from the moment the credit is withdrawn until the band has really been asked.
     */
    val correctByLevel: Map<String, Int> = placementOrder.associateWith { 0 },
    /** The skipped bands whose credit still stands: the only ones the result may call "fast-tracked". */
    val skippedLevels: List<String> = emptyList(),
    /** True while the learner answers a skipped band the exam sent them back to. That band is the last one asked. */
    val revisiting: Boolean = false,
)

data class BandResolution(
    /** True when the exam ends here. */
    val stop: Boolean,
    /** The placementOrder index to ask next (meaningless when stop is true). */
    val nextIdx: Int,
    val tally: PlacementTally,
)

/**
 * Port of placement.ts's resolveBand; see that file's doc comment for the reasoning. What happens when the learner
 * has answered the last question of a band: where the exam goes next, and what the credit for any skipped band is
 * worth.
 *
 * A skip is a bet. Acing a band makes [nextAdaptiveBand] jump the next one -- credited as passed, never asked -- on
 * the strength that someone who aced A1 will pass A2, so B1 is the interesting question. The credit stands only once
 * the band after the skip (the landing band) is passed for real: a pass above implies a pass below. If the landing
 * band is NOT passed (under [PLACEMENT_PASS_MARK], so 0 or 1 of 3) the bet lost, and the credit must decide nothing:
 * [scorePlacement] would read the credited band as passed and place the learner AT the band they had just failed, on
 * an A2 nobody ever asked them. So the credit is withdrawn and the exam goes BACK and asks the skipped band -- then
 * ends, because nothing above can change the result once the landing band has failed -- and the placement rests on
 * answers the learner actually gave. A skipped band with no questions in the pool cannot be gone back to; there the
 * exam ends with the credit withdrawn and the learner is placed at the skipped band at most. Passing the landing band
 * 2 of 3 changes nothing.
 */
fun resolveBand(
    bandPool: Map<String, List<PlacementQuestion>>,
    currentIdx: Int,
    correctInBand: Int,
    tally: PlacementTally,
): BandResolution {
    val correctByLevel = tally.correctByLevel + (placementOrder[currentIdx] to correctInBand)
    fun end(counts: Map<String, Int>, skippedLevels: List<String>) =
        BandResolution(true, currentIdx, PlacementTally(counts, skippedLevels, revisiting = false))

    // The band the learner was sent back to is the last one asked: the band above it already failed.
    if (tally.revisiting) return end(correctByLevel, tally.skippedLevels)

    // Is the band just finished the landing band of a skip, and did the learner fail it?
    val skippedBelow = placementOrder.getOrNull(currentIdx - 1)
    if (skippedBelow != null && skippedBelow in tally.skippedLevels && correctInBand < PLACEMENT_PASS_MARK) {
        val skippedLevels = tally.skippedLevels - skippedBelow
        val withdrawn = correctByLevel + (skippedBelow to 0)
        if (bandPool[skippedBelow].isNullOrEmpty()) return end(withdrawn, skippedLevels)
        return BandResolution(false, currentIdx - 1, PlacementTally(withdrawn, skippedLevels, revisiting = true))
    }

    val decision = nextAdaptiveBand(bandPool, currentIdx, correctInBand)
    val credited = decision.skipped?.let { correctByLevel + (it to PLACEMENT_PASS_MARK) } ?: correctByLevel
    return BandResolution(
        decision.stop,
        decision.nextIdx,
        PlacementTally(credited, tally.skippedLevels + listOfNotNull(decision.skipped), revisiting = false),
    )
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

/**
 * The most questions the adaptive walk can ever ask for this pool: every band at most once, so the sum of the band
 * sizes (15 for five bands of three). It does not depend on the answers, so it is shown from the first question.
 */
fun placementMaxQuestions(bandPool: Map<String, List<PlacementQuestion>>): Int =
    placementOrder.sumOf { bandPool[it]?.size ?: 0 }

/** "Question 4 · up to 15": the same words on web, iOS and Android. */
fun placementProgressLabel(questionNumber: Int, max: Int): String = "Question $questionNumber · up to $max"

/** What TalkBack says for the counter: "Question 4, up to 15" (the dot would be read aloud or dropped). */
fun placementProgressSpokenLabel(questionNumber: Int, max: Int): String = "Question $questionNumber, up to $max"

/** Finishing before the maximum is a result, not a failure: the exam had what it needed. */
fun placementFinishedLabel(asked: Int): String = "Placed after $asked questions"

enum class BandMarkerState {
    /** Asked and passed on the learner's own answers. */
    PASSED,
    /** Credited from a perfect band below, not asked: looks different on purpose. */
    SKIPPED,
    /** The band being asked now. */
    CURRENT,
    /** Asked, and not passed. */
    MISSED,
    /** Not reached. */
    UPCOMING,
}

data class BandMarker(val level: String, val state: BandMarkerState)

/** One marker per band that has questions, for the row under the counter. Port of placement.ts's bandMarkers. */
fun bandMarkers(
    bandPool: Map<String, List<PlacementQuestion>>,
    shown: List<PlacementQuestion>,
    bandIdx: Int,
    tally: PlacementTally,
    done: Boolean,
): List<BandMarker> {
    val asked = shown.map { it.level }.toSet()
    return placementOrder.filter { !bandPool[it].isNullOrEmpty() }.map { level ->
        val state = when {
            !done && placementOrder.getOrNull(bandIdx) == level -> BandMarkerState.CURRENT
            level in tally.skippedLevels -> BandMarkerState.SKIPPED
            level in asked -> if ((tally.correctByLevel[level] ?: 0) >= PLACEMENT_PASS_MARK) BandMarkerState.PASSED else BandMarkerState.MISSED
            else -> BandMarkerState.UPCOMING
        }
        BandMarker(level, state)
    }
}
