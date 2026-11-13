package com.obsidianmedia.learnwithalphonso.core.logic



import com.obsidianmedia.learnwithalphonso.core.content.Scenario

import com.obsidianmedia.learnwithalphonso.core.content.Campaign

import kotlinx.serialization.Serializable



@Serializable data class PracticeStarRow(val kind: String, val itemKey: String, val bestStars: Int, val lastPlayedAt: String)

@Serializable data class PracticeWeaknessEvent(val category: String, val eventType: String, val createdAt: String)

@Serializable data class PracticeHubData(val stars: List<PracticeStarRow> = emptyList(), val cefrLevel: String? = null, val weaknessEvents: List<PracticeWeaknessEvent> = emptyList())

/** Only the server awards stars. These counts are display data, never inputs to a scorer. */

@Serializable data class PracticeResult(val kind: String, val itemKey: String, val stars: Int, val bestBefore: Int, val bestAfter: Int, val replies: Int, val rightReplies: Int, val shortReplies: Int, val englishReplies: Int, val finishMinReplies: Int) {

    val displayedStars get() = stars
    /** The slip block only shows when the server counted a wrong reply; a clean call has none. */
    fun <T> slipToShow(slip: T?): T? = if (rightReplies < replies) slip else null

    val retryLabel get() = if (stars == 3) "Play again" else if (stars == 0) "Try again" else "Try for ${stars + 1}"

    fun headline(course: String): String {

        val praise = mapOf("en" to "Well done.", "fr" to "Très bien.", "es" to "Muy bien.")[course] ?: "Well done."

        return when (stars) { 0 -> "No stars this time"; 1 -> "One star. You finished."; 2 -> "Two stars. $praise"; else -> "Three stars. $praise" }

    }

    val hint: String get() {

        fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

        if (stars == 0) return "Finish the call for your first star: ${plural(finishMinReplies - replies, "more reply", "more replies")} next time."

        if (stars == 1) return "$rightReplies of $replies replies right. Two stars take 80%."

        if (stars == 3) return if (bestBefore == 3) "Three again. Nothing left to win here." else "Every reply right, in full sentences. Nothing left to win here."

        val wrong = replies - rightReplies

        val reasons = buildList {

            if (wrong > 0) add(plural(wrong, "slip", "slips"))

            if (shortReplies > 0) add(plural(shortReplies, "short reply", "short replies"))

            if (englishReplies > 0) add(plural(englishReplies, "reply in English", "replies in English"))

        }

        val what = if (reasons.size > 1) reasons.dropLast(1).joinToString(", ") + " and " + reasons.last() else reasons.firstOrNull() ?: "A slip"

        return what.replaceFirstChar { it.uppercase() } + " kept you from three. Fix ${if (wrong + shortReplies + englishReplies == 1) "it" else "them"} and try again."

    }

}

data class PracticePick(val scenarioId: String, val weakSpot: String?)

data class PracticeContinue(val campaignId: String, val sceneIndex: Int)

object PracticeHub {

    fun weakSpotName(key: String) = mapOf("past-tense" to "the past tense", "subject-verb-agreement" to "verb agreement", "question-formation" to "asking questions", "modal-verbs" to "can, could and would", "word-order" to "word order", "conditionals" to "the conditional", "phrasal-verbs" to "phrasal verbs", "negation" to "negatives", "vocabulary-choice" to "choosing the right word", "comparatives" to "comparisons")[key] ?: key

    val levels = listOf("All", "Beginner", "Intermediate", "Advanced")

    fun starRules(chat: Boolean): List<String> = if (chat) listOf("Finish the chat") + starRules.drop(1) else starRules
    val starRules = listOf("Finish the call", "80% of your replies right", "Every reply right, in full sentences of 4+ words, no English")

    fun stars(rows: List<PracticeStarRow>, kind: String, key: String): Int = rows.lastOrNull { it.kind == kind && it.itemKey == key }?.bestStars ?: 0

    fun starLabel(n: Int) = "$n of 3 stars"

    fun level(cefr: String?): String = (cefr ?: "A1").uppercase().let { if (it.startsWith("A")) "Beginner" else if (it.startsWith("B")) "Intermediate" else "Advanced" }

    fun filtered(scenarios: List<Scenario>, level: String) = scenarios.filter { level == "All" || it.level == level }

    fun today(data: PracticeHubData, scenarios: List<Scenario>): PracticePick? {

        val candidates = filtered(scenarios, level(data.cefrLevel))

        fun least(list: List<Scenario>) = list.minByOrNull { stars(data.stars, "scenario", it.id) }

        val groups = data.weaknessEvents.groupBy { it.category }

        val weak = groups.entries.filter { (_, es) -> es.sumOf { if (it.eventType == "detected") 1 else -1 } > 0 }

            .sortedWith(compareByDescending<Map.Entry<String, List<PracticeWeaknessEvent>>> { it.value.sumOf { e -> if (e.eventType == "detected") 1 else -1 } }.thenByDescending { it.value.maxOf { e -> e.createdAt } })

        for ((w, _) in weak) {

            if (w == "spelling") continue

            least(candidates.filter { w in focus[it.id].orEmpty() })?.let { return PracticePick(it.id, w) }

        }

        return least(candidates)?.let { PracticePick(it.id, null) }

    }

    fun nextScene(c: Campaign, rows: List<PracticeStarRow>): Int = c.scenes.indexOfFirst { stars(rows, "scene", "${c.id}/${it.id}") == 0 }.coerceAtLeast(0)

    fun resume(rows: List<PracticeStarRow>, campaigns: List<Campaign>): PracticeContinue? {

        val seen = mutableSetOf<String>()

        for (r in rows.filter { it.kind == "scene" }.sortedByDescending { it.lastPlayedAt }) {

            val id = r.itemKey.substringBefore('/')

            if (!seen.add(id)) continue

            val c = campaigns.firstOrNull { it.id == id } ?: continue

            val i = c.scenes.indexOfFirst { stars(rows, "scene", "$id/${it.id}") == 0 }

            if (i >= 0) return PracticeContinue(id, i)

        }

        return null

    }

    fun tally(rows: List<PracticeStarRow>, scenarios: List<Scenario>, campaigns: List<Campaign>): Pair<Int, Int> {

        val keys = scenarios.map { "scenario" to it.id } + campaigns.flatMap { c -> c.scenes.map { "scene" to "${c.id}/${it.id}" } }

        return keys.sumOf { stars(rows, it.first, it.second) } to keys.size * 3

    }

    val sceneRoomNames get() = rooms.values.toSet()

    fun room(campaignId: String, sceneId: String) = rooms["$campaignId/$sceneId"] ?: "room-light"

    private val rooms = mapOf("city-day/coffee-stop" to "coffee", "city-day/directions" to "directions", "city-day/small-talk" to "market", "first-week-job/job-meet-team" to "office", "first-week-job/job-find-way" to "interview", "first-week-job/job-lunch-order" to "restaurant", "first-week-job/job-coffee-chat" to "coffee", "doctors-visit/doctor-book-phone" to "bedroom", "doctors-visit/doctor-symptoms" to "doctor", "doctors-visit/doctor-pharmacy" to "returns", "train-trip/train-buy-ticket" to "station", "train-trip/train-delay-help" to "station", "train-trip/train-hotel-checkin" to "hotel", "new-flat/flat-viewing" to "apartment", "new-flat/flat-broken-heater" to "kitchen", "new-flat/flat-neighbour" to "directions", "market-day/market-plan-picnic" to "smalltalk", "market-day/market-buy-food" to "market", "market-day/market-picnic" to "garden", "dinner-guest/dinner-arrive" to "kitchen", "dinner-guest/dinner-table" to "dining", "dinner-guest/dinner-goodbye" to "apartment", "lost-bag/lost-ask-driver" to "station", "lost-bag/lost-property-office" to "returns", "lost-bag/lost-tell-friend" to "smalltalk", "refund-return/refund-shop" to "returns", "refund-return/refund-parcel" to "techshop", "refund-return/refund-opinion" to "coffee", "study-abroad/study-register" to "office", "study-abroad/study-office-hours" to "classroom", "study-abroad/study-group" to "library", "gym-join/gym-sign-up" to "gym", "gym-join/gym-class" to "gym", "gym-join/gym-after-class" to "coffee", "project-week/project-pitch" to "office", "project-week/project-deadline" to "negotiation", "project-week/project-update" to "interview", "family-weekend/family-station" to "station", "family-weekend/family-birthday-plan" to "kitchen", "family-weekend/family-call" to "bedroom")

    private val focus = mapOf("coffee" to listOf("question-formation", "articles", "plurals", "modal-verbs", "conditionals"), "airport" to listOf("question-formation", "prepositions", "pronouns", "spelling"), "smalltalk" to listOf("question-formation", "pronouns", "subject-verb-agreement", "word-order"), "hotel" to listOf("modal-verbs", "prepositions", "articles", "spelling", "phrasal-verbs"), "directions" to listOf("prepositions", "word-order", "question-formation"), "returns" to listOf("past-tense", "negation", "pronouns", "vocabulary-choice", "comparatives"), "interview" to listOf("past-tense", "comparatives", "phrasal-verbs", "word-order", "vocabulary-choice"), "doctor" to listOf("past-tense", "subject-verb-agreement", "prepositions", "negation", "pronouns"), "restaurant" to listOf("modal-verbs", "articles", "plurals", "conditionals"), "apartment" to listOf("question-formation", "comparatives", "conditionals", "prepositions", "spelling"), "negotiation" to listOf("conditionals", "modal-verbs", "comparatives", "vocabulary-choice"), "debate" to listOf("comparatives", "conditionals", "negation", "phrasal-verbs", "word-order"))

}
