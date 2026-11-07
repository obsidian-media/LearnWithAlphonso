package com.obsidianmedia.learnwithalphonso.core.firstrun

import com.obsidianmedia.learnwithalphonso.core.logic.DisplayNameOnboarding
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming
import com.obsidianmedia.learnwithalphonso.core.logic.typeKey
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.ceil
import kotlin.math.max
import com.obsidianmedia.learnwithalphonso.core.content.Unit as CourseUnit

/**
 * The first run (visual round 6, part 3), the same as the web's src/lib/first-run.ts and the iOS Kit's FirstRun.swift:
 * Alphonso asks eight questions, gives a two-question taste and a plan, and only then asks the learner to sign in.
 * Until then every answer stays on this device.
 *
 * Under 13: the age screen is neutral. Choosing "Under 13" ends the first run on this device: the answers are wiped,
 * a flag is kept (DataStore) so going back, relaunching or picking an older range does not get through, no account
 * can be made here, and nothing is ever sent.
 */

/** Where the store keeps its values. The app passes DataStore-backed storage. */
interface FirstRunKeyValue {
    fun get(key: String): String?
    fun set(key: String, value: String?)
}

class InMemoryFirstRunKeyValue(initial: Map<String, String> = emptyMap()) : FirstRunKeyValue {
    private val values = initial.toMutableMap()
    @Synchronized override fun get(key: String): String? = values[key]
    @Synchronized override fun set(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
}

class FirstRunStore(private val draftStorage: FirstRunKeyValue?, private val blockStorage: FirstRunKeyValue?) {
    /** Kept in memory as well, so the block holds for this launch even if the storage write failed. */
    @Volatile private var blockedThisLaunch = false

    fun readDraft(): LearnerAnswers {
        if (isBlocked()) return LearnerAnswers()
        return draftStorage?.get(DRAFT_KEY)?.let(LearnerAnswers::decode) ?: LearnerAnswers()
    }

    fun writeDraft(draft: LearnerAnswers) {
        if (isBlocked()) return
        draftStorage?.set(DRAFT_KEY, LearnerAnswers.encode(draft))
    }

    fun clearDraft() { draftStorage?.set(DRAFT_KEY, null) }

    fun isBlocked(): Boolean = blockedThisLaunch || blockStorage?.get(UNDER_13_KEY) == "1"

    fun blockUnder13() {
        blockedThisLaunch = true
        blockStorage?.set(UNDER_13_KEY, "1")
        clearDraft()
    }

    companion object {
        const val DRAFT_KEY = "lwa.firstRun.v1"
        const val UNDER_13_KEY = "lwa.under13.v1"
    }
}

enum class AgeChoice(val id: String, val big: String, val small: String) {
    UNDER_13("under-13", "<13", "Under 13"),
    TEEN("13-17", "13–17", "Teen"),
    YOUNG_ADULT("18-24", "18–24", "Young adult"),
    ADULT("25-34", "25–34", "Adult"),
    MID_ADULT("35-54", "35–54", "Adult"),
    MATURE("55+", "55+", "Mature");

    /** What TalkBack reads: plain words, no symbols. */
    val accessibilityLabel: String
        get() = when (this) {
            UNDER_13 -> "Under 13"
            MATURE -> "55 or over, Mature"
            else -> "${id.replace("-", " to ")}, $small"
        }
}

enum class AgeOutcome { OK, BLOCKED }

object FirstRun {
    /** The age screen's Continue. A device that ever chose Under 13 stays blocked, whatever is picked now. */
    fun chooseAge(store: FirstRunStore, choice: AgeChoice): AgeOutcome {
        if (store.isBlocked()) return AgeOutcome.BLOCKED
        if (choice == AgeChoice.UNDER_13) {
            store.blockUnder13()
            return AgeOutcome.BLOCKED
        }
        store.writeDraft(store.readDraft().copy(ageRange = choice.id))
        return AgeOutcome.OK
    }

    /** A draft cleaned to the server's lists (anything else dropped); null when nothing is left. */
    fun cleanAnswers(draft: LearnerAnswers): LearnerAnswers? =
        LearnerAnswers.parse(draft.jsonPatch()).takeUnless { it.isEmpty }

    /** The answers to save after sign-in; null when this device is blocked or nothing was answered. */
    fun answersToSend(store: FirstRunStore): LearnerAnswers? =
        if (store.isBlocked()) null else cleanAnswers(store.readDraft())

    // ------------------------------------------------------------ steps

    enum class Mode { NEW, COMPLETE }
    enum class QuestionStep { NAME, COURSE, ABOUT, GOAL, LEVEL, TIME, AGE, INTERESTS }

    /** The counted questions ("Question 3 of 8"). Complete your profile skips the course (and sign-in). */
    fun questionSteps(mode: Mode): List<QuestionStep> =
        if (mode == Mode.NEW) QuestionStep.entries else QuestionStep.entries.filter { it != QuestionStep.COURSE }

    // ------------------------------------------------------------ the room

    private val courseRooms = mapOf("es" to "coffee", "fr" to "restaurant", "en" to "smalltalk")
    private val goalRooms = mapOf(
        "travel" to "airport", "work" to "office", "school" to "classroom", "family" to "apartment",
        "exam" to "library", "fun" to "gallery",
    )

    /** Answers change the room: the course picks its room, then the goal moves him (Travel: the airport). */
    fun room(course: String?, goal: String?): String =
        goal?.let(goalRooms::get) ?: course?.let(courseRooms::get) ?: "room-light"

    private val courseNames = mapOf("en" to "English", "fr" to "French", "es" to "Spanish")
    fun courseName(course: String): String = courseNames[course] ?: "English"
    val courseOrder = listOf("en", "fr", "es")

    fun greeting(course: String, name: String?): String {
        val n = name?.trim().orEmpty()
        return when (course) {
            "es" -> if (n.isEmpty()) "¡Hola!" else "¡Hola, $n!"
            "fr" -> if (n.isEmpty()) "Bonjour !" else "Bonjour, $n !"
            else -> if (n.isEmpty()) "Hello!" else "Hello, $n!"
        }
    }

    /** "Food, travel and music" from interest labels. */
    fun listInWords(items: List<String>): String =
        if (items.size <= 1) items.joinToString("") else items.dropLast(1).joinToString(", ") + " and " + items.last()

    // ------------------------------------------------------------ choices

    /** [icon] is a semantic name (the web's FirstRunIcons); the app maps it to its own icon. */
    data class Choice(val id: String, val label: String, val icon: String, val sub: String? = null)

    val goalChoices = listOf(
        Choice("travel", "Travel", "plane", "Travel mode"),
        Choice("work", "Work", "brief", "Work mode"),
        Choice("school", "School", "cap", "School mode"),
        Choice("family", "Family", "home", "Family mode"),
        Choice("exam", "An exam", "medal", "Exam mode"),
        Choice("fun", "Just for fun", "smile", "Fun mode"),
    )
    val levelChoices = listOf(
        Choice("new", "I'm brand new", "seed", "Start from the very beginning"),
        Choice("some", "I know some", "sprout", "Words and simple sentences"),
        Choice("confident", "I'm fairly confident", "tree", "I can hold a conversation"),
    )
    val timeChoices = listOf(5 to "Casual", 10 to "Regular", 15 to "Serious", 20 to "Intense")
    val interestChoices = listOf(
        Choice("food", "Food", "food"),
        Choice("travel", "Travel", "plane"),
        Choice("sport", "Sport", "ball"),
        Choice("music", "Music", "music"),
        Choice("movies", "Movies & TV", "film"),
        Choice("business", "Business", "brief"),
        Choice("tech", "Tech", "chip"),
        Choice("nature", "Nature", "leaf"),
        Choice("art", "Art", "brush"),
        Choice("family", "Family", "people"),
    )
    val heardChoices = listOf(
        Choice("app_store", "App Store", "store"),
        Choice("search", "Search", "search"),
        Choice("youtube", "YouTube", "film"),
        Choice("social", "Instagram or TikTok", "share"),
        Choice("friend", "A friend", "people"),
        Choice("podcast", "Podcast", "pod"),
    )

    /** The placement hint under the level choices (only for "some" and "confident"). */
    fun levelHint(level: String?, mode: Mode): String? {
        if (level != "some" && level != "confident") return null
        return if (mode == Mode.NEW) "After you sign in, a 3-minute placement test can find your exact starting point."
        else "At the end, a 3-minute placement test can find your exact starting point."
    }

    /** The plan card on the sign-in screen. */
    fun planSummary(draft: LearnerAnswers, course: String): List<String> {
        val goal = goalChoices.firstOrNull { it.id == draft.goal }?.label?.lowercase()
        val level = levelChoices.firstOrNull { it.id == draft.level }?.label
        val head = listOfNotNull(courseName(course) + (goal?.let { " for $it" } ?: ""), level).joinToString(" · ")
        val lines = mutableListOf(head, "${draft.dailyMinutes ?: 10} minutes a day")
        val interests = draft.interests.orEmpty().mapNotNull { id -> interestChoices.firstOrNull { it.id == id }?.label?.lowercase() }
        if (interests.isNotEmpty()) lines += listInWords(interests).replaceFirstChar { it.uppercase() }
        return lines
    }

    /** Meet Hector's first benefit line: up to three interests, then "your week". */
    fun hectorTopics(interests: List<String>): String {
        val topics = interests.mapNotNull { id -> interestChoices.firstOrNull { it.id == id }?.label?.lowercase() }.take(3)
        return if (topics.isEmpty()) "About anything you like" else "About " + listInWords(topics + "your week")
    }

    // ------------------------------------------------------------ first taste

    data class MiniQuestion(val prompt: String, val choices: List<String>, val answer: Int, val why: String, val say: String)

    /** Two real questions per course, answered on the device before any account. */
    val miniLessons: Map<String, List<MiniQuestion>> = mapOf(
        "es" to listOf(
            MiniQuestion("Let's try one! How do you say “good morning”?", listOf("Buenas noches", "Buenos días", "Hasta luego"), 1,
                "“Buenos días” is how you greet someone until lunchtime.", "Buenos días"),
            MiniQuestion("And this one: what does “gracias” mean?", listOf("Please", "Thank you", "Sorry"), 1,
                "“Gracias” is thank you. “Muchas gracias” is thank you very much.", "Gracias"),
        ),
        "fr" to listOf(
            MiniQuestion("Let's try one! How do you say “good morning”?", listOf("Bonsoir", "Bonjour", "Au revoir"), 1,
                "“Bonjour” is good morning and hello, all day until the evening.", "Bonjour"),
            MiniQuestion("And this one: what does “merci” mean?", listOf("Please", "Thank you", "Sorry"), 1,
                "“Merci” is thank you. “Merci beaucoup” is thank you very much.", "Merci"),
        ),
        "en" to listOf(
            MiniQuestion("Let's try one! Which is a morning greeting?", listOf("Good night", "Good morning", "See you later"), 1,
                "“Good morning” is a greeting until about noon. “Good night” is for bedtime.", "Good morning"),
            MiniQuestion("And this one: which is the polite way to ask?", listOf("Give me water.", "Could I have some water, please?", "Water now."), 1,
                "“Could I have…, please?” is polite and natural in cafés and shops.", "Could I have some water, please?"),
        ),
    )

    fun praise(course: String, name: String): String {
        val word = when (course) { "es" -> "¡Muy bien"; "fr" -> "Très bien"; else -> "Well done" }
        return if (name.isEmpty()) "$word!" else "$word, $name!"
    }

    /** Text for on-device speech: the curly quotes the bubbles use are dropped. */
    fun spoken(text: String): String = text.replace("“", "").replace("”", "")

    // ------------------------------------------------------------ plan

    /** Where the plan starts until the placement test (offered for "some" and "confident") says otherwise. */
    fun startLevel(level: String?): String = when (level) { "some" -> "A2"; "confident" -> "B1"; else -> "A1" }

    data class PlanNode(val title: String, val room: String)
    data class Plan(val nodes: List<PlanNode>, val goalUnitTitle: String, val goalDate: LocalDate)

    /** The first three units at the starting level, and when the second is done at [dailyMinutes] a day. */
    fun plan(units: List<CourseUnit>, level: String?, dailyMinutes: Int?, now: Instant, timing: LessonTiming?, unitRooms: Map<String, String>): Plan {
        val start = startLevel(level)
        val atLevel = units.filter { it.level == start }
        val first = (atLevel.ifEmpty { units }).take(3)
        val minutes = first.take(2).flatMap { it.lessons }.sumOf { lesson ->
            timing?.estimateMinutes(lesson.questions.map { it.typeKey }, 0) ?: 1
        }
        val days = max(1, ceil(minutes.toDouble() / (dailyMinutes ?: 10)).toInt())
        val goal = now.plusSeconds(days * 86_400L).atOffset(ZoneOffset.UTC).toLocalDate()
        return Plan(
            nodes = first.map { PlanNode(it.title, LessonStage.roomId(it.id, unitRooms)) },
            goalUnitTitle = first.getOrNull(1)?.title ?: first.firstOrNull()?.title ?: "",
            goalDate = goal,
        )
    }

    private val monthNames = listOf(
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    )

    /** "8 November" (the web's en-GB day and month). */
    fun formatDay(day: LocalDate): String = "${day.dayOfMonth} ${monthNames[day.monthValue - 1]}"

    // ------------------------------------------------------------ after the first run

    enum class FinishTarget { LESSON, HECTOR }
    enum class Destination { HECTOR, PLACEMENT, LEARN }

    /** Where a learner goes after the first run: the placement test for "some" and "confident", else Learn. */
    fun destination(target: FinishTarget, level: String?, placementTaken: Boolean): Destination = when {
        target == FinishTarget.HECTOR -> Destination.HECTOR
        (level == "some" || level == "confident") && !placementTaken -> Destination.PLACEMENT
        else -> Destination.LEARN
    }

    /** Meet Hector's trial line from the store's offer; null (no line) without a free trial the learner can get. */
    fun trialLine(days: Int?): String? {
        if (days == null || days < 1) return null
        return "$days ${if (days == 1) "day" else "days"} free, then your plan's price. Cancel any time."
    }

    fun hectorButton(hasTrial: Boolean): String = if (hasTrial) "Try a free call with Hector" else "See what Hector can do"

    /**
     * A Play billing period ("P7D", "P1W", "P1M", "P1Y") in days: a week is 7, a month 30, a year 365. Null for a
     * period that is missing, malformed or zero.
     */
    fun trialDays(isoPeriod: String?): Int? {
        val m = Regex("^P(\\d+)([DWMY])$").matchEntire(isoPeriod?.trim().orEmpty()) ?: return null
        val n = m.groupValues[1].toIntOrNull()?.takeIf { it >= 1 } ?: return null
        return when (m.groupValues[2]) { "D" -> n; "W" -> n * 7; "M" -> n * 30; else -> n * 365 }
    }

    /** The longest free trial among the store's packages (each from the offer Play gives this account), or null. */
    fun trialDays(isoPeriods: List<String?>): Int? = isoPeriods.mapNotNull(::trialDays).maxOrNull()

    // ------------------------------------------------------------ Complete your profile

    /**
     * What Complete your profile starts from: the account's answers, the public name (first word, never a Learner-XXXX
     * handle) when no name was answered, and the leaderboard country. A country already shown on the leaderboard was
     * the learner's own choice, so the flag starts on: saving with it off would clear that country.
     */
    fun completeProfilePrefill(profile: LearnerProfile, displayName: String?, leaderboardCountry: String?): LearnerAnswers {
        val a = profile.answers
        val name = a.name ?: displayName?.takeUnless { DisplayNameOnboarding.isLearnerHandle(it) }
            ?.split(" ")?.firstOrNull()?.let(LearnerAnswers::cleanName)
        return a.copy(
            name = name,
            country = a.country ?: leaderboardCountry,
            showFlag = a.showFlag == true || leaderboardCountry != null,
        )
    }

    // ------------------------------------------------------------ under 13 (the owner-approved wording)

    const val UNDER_13_TITLE = "Thanks for wanting to learn with me!"
    const val UNDER_13_BODY =
        "Learn With Alphonso is for learners aged 13 and over, so we can't make an account for you yet. Come back when you're 13. I'll be here!"
}

/**
 * Complete your profile's Not now holds for the rest of this launch even when saving it failed, so the gate cannot
 * send the learner straight back. In memory only; the saved dismissedAt keeps it away on later launches.
 */
object CompleteProfileSkip {
    @Volatile var skippedThisLaunch: Boolean = false
        private set

    fun skipThisLaunch() { skippedThisLaunch = true }
    fun reset() { skippedThisLaunch = false }
}
