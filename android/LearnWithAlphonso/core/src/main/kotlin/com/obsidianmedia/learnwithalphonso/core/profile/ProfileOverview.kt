package com.obsidianmedia.learnwithalphonso.core.profile

import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.logic.LEAGUES
import com.obsidianmedia.learnwithalphonso.core.logic.LEAGUE_THRESHOLDS
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import java.time.DayOfWeek
import java.time.LocalDate
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The Profile screen's rules (visual round 6, part 4; src/lib/profile-overview.ts on the web, ProfileOverview.swift on
 * iOS). The rows are read in one batch (ProfileOverviewClient.kt); everything the screen shows is derived here, so no
 * number is typed into a view. A day is the UTC date of the server clock, the same day the streak counts.
 */
data class ProfileActivityDay(val day: String, val xp: Int)
data class ProfileSpeechDay(val day: String, val seconds: Int)
data class ProfileCompletion(val lessonId: String, val language: String, val correct: Int, val total: Int)
data class ProfileWeakItem(val label: String, val display: String, val lapses: Int, val repetitions: Int)
data class ProfileWeaknessEvent(val category: String, val eventType: String, val createdAt: String)
data class ProfileCourseProgress(val course: String, val xp: Int, val cefrLevel: String, val leagueTier: String)
data class ProfileAchievementRow(val id: String, val progress: Int, val unlockedAt: String?)

data class ProfileOverviewData(
    val today: String,
    val course: String,
    val displayName: String? = null,
    val avatarSeed: String? = null,
    /** Set only while the learner's flag is on. */
    val country: String? = null,
    val courses: List<ProfileCourseProgress> = emptyList(),
    val streak: Int = 0,
    val longestStreak: Int = 0,
    val streakFreezes: Int = 0,
    val completions: List<ProfileCompletion> = emptyList(),
    val activity: List<ProfileActivityDay> = emptyList(),
    val bestDayXp: Int = 0,
    val speech: List<ProfileSpeechDay> = emptyList(),
    val weakItems: List<ProfileWeakItem> = emptyList(),
    val savedWords: Int = 0,
    val weaknessEvents: List<ProfileWeaknessEvent> = emptyList(),
    val achievements: List<ProfileAchievementRow> = emptyList(),
    val friends: List<FriendProgress> = emptyList(),
)

object ProfileMath {
    const val HEAT_MAP_MONTHS = 3
    const val FRIENDS_WEEK_DAYS = 7
    val LEVEL_ORDER = listOf("A1", "A2", "B1", "B2", "C1", "C2")

    private fun date(day: String): LocalDate = LocalDate.parse(day)
    fun addDays(day: String, n: Int): String = date(day).plusDays(n.toLong()).toString()

    /** Today as the streak counts it: the UTC calendar date. */
    fun streakToday(nowMillis: Long = System.currentTimeMillis()): String =
        java.time.Instant.ofEpochMilli(nowMillis).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()

    /** Monday of the week holding [day]. */
    fun weekStart(day: String): String = date(day).with(DayOfWeek.MONDAY).toString()

    /** Exactly [HEAT_MAP_MONTHS] calendar months ending today: the day after the same date 3 months ago (clamped). */
    fun threeMonthsWindow(today: String): Pair<String, String> =
        Pair(date(today).minusMonths(HEAT_MAP_MONTHS.toLong()).plusDays(1).toString(), today)

    data class HeatCell(val day: String, val xp: Int, val level: Int, val inRange: Boolean)
    data class HeatMap(val weeks: List<List<HeatCell>>, val activeDays: Int, val start: String, val end: String)

    /** Monday-first week columns over the 3-month window. Level is the day's XP against the learner's best day in it. */
    fun heatMap(today: String, rows: List<ProfileActivityDay>): HeatMap {
        val (start, end) = threeMonthsWindow(today)
        val xpByDay = HashMap<String, Int>()
        for (r in rows) if (r.day in start..end) xpByDay[r.day] = (xpByDay[r.day] ?: 0) + r.xp
        val maxXp = xpByDay.values.maxOrNull() ?: 0
        val weeks = ArrayList<List<HeatCell>>()
        var w = weekStart(start)
        while (w <= end) {
            weeks.add((0 until 7).map { i ->
                val day = addDays(w, i)
                val inRange = day in start..end
                val xp = if (inRange) xpByDay[day] ?: 0 else 0
                val level = if (xp > 0 && maxXp > 0) min(4, max(1, ceil(4.0 * xp / maxXp).toInt())) else 0
                HeatCell(day, xp, level, inRange)
            })
            w = addDays(w, 7)
        }
        return HeatMap(weeks, xpByDay.values.count { it > 0 }, start, end)
    }

    enum class RingState { DONE, MISSED, TODAY, FUTURE }
    data class RingDay(val day: String, val xp: Int, val seconds: Int, val state: RingState)
    data class Week(val days: List<RingDay>, val activeDays: Int, val minutesSpoken: Int)

    /** This week, Monday to Sunday. A day is done when it earned XP: the rule that keeps the streak alive. */
    fun weekRings(today: String, activity: List<ProfileActivityDay>, speech: List<ProfileSpeechDay>): Week {
        val monday = weekStart(today)
        val xp = HashMap<String, Int>().also { m -> activity.forEach { m[it.day] = (m[it.day] ?: 0) + it.xp } }
        val spoken = HashMap<String, Int>().also { m -> speech.forEach { m[it.day] = (m[it.day] ?: 0) + it.seconds } }
        val days = (0 until 7).map { i ->
            val day = addDays(monday, i)
            val dayXp = xp[day] ?: 0
            val state = when {
                day > today -> RingState.FUTURE
                dayXp > 0 -> RingState.DONE
                day == today -> RingState.TODAY
                else -> RingState.MISSED
            }
            RingDay(day, dayXp, if (day > today) 0 else spoken[day] ?: 0, state)
        }
        return Week(days, days.count { it.xp > 0 }, (days.sumOf { it.seconds } / 60.0).roundToInt())
    }

    data class BigNumbers(
        val streak: Int, val longestStreak: Int, val courseXp: Int, val xpThisWeek: Int,
        val wordsLearned: Int, val savedWords: Int, val lessonsDone: Int, val accuracyPct: Int?,
    )

    /** [vocabTerms] maps a finished lesson id to the words it teaches (the app's content), so this stays pure. */
    fun bigNumbers(o: ProfileOverviewData, vocabTerms: (String) -> List<String>): BigNumbers {
        val mine = o.completions.filter { it.language == o.course }
        val correct = mine.sumOf { it.correct }
        val total = mine.sumOf { it.total }
        val monday = weekStart(o.today)
        return BigNumbers(
            streak = o.streak,
            longestStreak = o.longestStreak,
            courseXp = o.courses.firstOrNull { it.course == o.course }?.xp ?: 0,
            xpThisWeek = o.activity.filter { it.day >= monday && it.day <= o.today }.sumOf { it.xp },
            wordsLearned = mine.flatMap { vocabTerms(it.lessonId) }.map { it.lowercase() }.toSet().size,
            savedWords = o.savedWords,
            lessonsDone = mine.size,
            accuracyPct = if (total > 0) (100.0 * correct / total).roundToInt() else null,
        )
    }

    data class Records(val bestDayXp: Int, val bestStreak: Int, val perfectLessons: Int)

    fun personalRecords(o: ProfileOverviewData) =
        Records(o.bestDayXp, o.longestStreak, o.completions.count { it.total > 0 && it.correct == it.total })

    data class LevelProgress(val level: String, val next: String?, val done: Int, val total: Int, val pct: Int, val unitsLeft: Int)

    /** [units] is each unit's lesson ids for the learner's level in this course. */
    fun levelProgress(cefr: String, units: List<List<String>>, completed: Set<String>): LevelProgress {
        val level = if (cefr in LEVEL_ORDER) cefr else "A1"
        val lessons = units.flatten()
        val finished = lessons.count { it in completed }
        return LevelProgress(
            level, LEVEL_ORDER.getOrNull(LEVEL_ORDER.indexOf(level) + 1), finished, lessons.size,
            if (lessons.isEmpty()) 0 else (100.0 * finished / lessons.size).roundToInt(),
            units.count { u -> !u.all { it in completed } },
        )
    }

    /** The weak spots to fix first: the most-missed, then the least-practised. */
    fun weakSpots(items: List<ProfileWeakItem>, n: Int = 3): Pair<List<ProfileWeakItem>, Int> =
        Pair(items.sortedWith(compareByDescending<ProfileWeakItem> { it.lapses }.thenBy { it.repetitions }).take(n), items.size)

    /** Open weakness categories, most open first (detected minus resolved). */
    fun openMemoryCategories(events: List<ProfileWeaknessEvent>): List<String> {
        class Acc(var open: Int, var last: String)
        val by = LinkedHashMap<String, Acc>()
        for (e in events) {
            val v = by.getOrPut(e.category) { Acc(0, e.createdAt) }
            v.open += if (e.eventType == "detected") 1 else -1
            if (e.createdAt > v.last) v.last = e.createdAt
        }
        return by.entries.filter { it.value.open > 0 }
            .sortedWith(compareByDescending<Map.Entry<String, Acc>> { it.value.open }.thenByDescending { it.value.last }.thenBy { it.key })
            .map { it.key }
    }

    sealed class HectorCard {
        data class Pro(val topics: List<String>) : HectorCard()
        data class Teaser(val topics: List<String>) : HectorCard()
    }

    /**
     * "Hector noticed". Pro: the open weakness categories Hector is primed with. Free: a teaser built ONLY from the
     * learner's own weak spots on this course; it never reads Hector's memory, and with no weak spot there is no card.
     */
    fun hectorCard(pro: Boolean, weakItems: List<ProfileWeakItem>, weaknessEvents: List<ProfileWeaknessEvent>): HectorCard? {
        if (pro) {
            val topics = openMemoryCategories(weaknessEvents).take(2).map { it.replace("-", " ") }
            return if (topics.isEmpty()) null else HectorCard.Pro(topics)
        }
        val topics = weakSpots(weakItems, 2).first.map { it.display }
        return if (topics.isEmpty()) null else HectorCard.Teaser(topics)
    }

    /** "a", "a and b", "a, b and c". */
    fun joinTopics(topics: List<String>): String =
        if (topics.size <= 1) topics.firstOrNull() ?: "" else topics.dropLast(1).joinToString(", ") + " and " + topics.last()

    fun achievementStats(o: ProfileOverviewData): Map<String, Int> = mapOf(
        "streak" to o.streak,
        // A badge unlocks when any one course's XP passes the threshold.
        "xp" to (o.courses.maxOfOrNull { it.xp } ?: 0),
        "perfect" to personalRecords(o).perfectLessons,
        "lessons" to o.completions.size,
        "league" to (o.achievements.filter { it.id.startsWith("league_") }.maxOfOrNull { it.progress } ?: 0),
        "freeze" to o.streakFreezes,
    )

    /** The locked badge closest to done. The team badge is granted by the server only, so never "in reach". */
    fun nextAchievement(stats: Map<String, Int>, unlocked: Set<String>, catalog: List<Achievement>): Pair<Achievement, Int>? {
        var best: Triple<Achievement, Int, Double>? = null
        for (a in catalog) {
            if (a.category == "team" || a.id in unlocked || a.threshold <= 0) continue
            val value = stats[a.category] ?: 0
            val ratio = value.toDouble() / a.threshold
            if (ratio >= 1) continue
            if (best == null || ratio > best.third) best = Triple(a, value, ratio)
        }
        return best?.let { Pair(it.first, it.second) }
    }

    data class LeagueStatus(val tier: String, val next: String?, val xpToNext: Int)

    /** Tiers are promoted by this course's XP passing LEAGUE_THRESHOLDS, never demoted. */
    fun leagueStatus(tier: String, courseXp: Int): LeagueStatus {
        val idx = max(0, LEAGUES.indexOf(tier))
        val next = LEAGUES.getOrNull(idx + 1)
        return LeagueStatus(tier, next, if (next == null) 0 else max(0, LEAGUE_THRESHOLDS[idx + 1] - courseXp))
    }

    /** The friends board's week: the last 7 days including today. */
    fun rollingWeekXp(today: String, activity: List<ProfileActivityDay>): Int {
        val from = addDays(today, -(FRIENDS_WEEK_DAYS - 1))
        return activity.filter { it.day >= from && it.day <= today }.sumOf { it.xp }
    }

    data class FriendWeekRow(val key: String, val displayName: String, val avatarSeed: String, val weekXp: Int, val isYou: Boolean)

    fun friendsWeek(friends: List<FriendProgress>, meName: String, meSeed: String, meWeekXp: Int, max: Int = 5): List<FriendWeekRow> {
        val rows = (friends.map { FriendWeekRow(it.userId, it.displayName, it.avatarSeed, it.weekXp, false) } +
            FriendWeekRow("you", meName, meSeed, meWeekXp, true))
            .sortedWith(compareByDescending<FriendWeekRow> { it.weekXp }.thenByDescending { it.isYou })
        if (rows.size <= max) return rows
        val you = rows.indexOfFirst { it.isYou }
        return if (you < max) rows.take(max) else rows.take(max - 1) + rows[you]
    }

    /** The learner's flag, only while they turned it on (profiles.country is set only then). null hides it. */
    fun flagEmoji(country: String?, showFlag: Boolean = true): String? {
        val code = country?.uppercase() ?: return null
        if (!showFlag || code.length != 2 || !code.all { it in 'A'..'Z' }) return null
        return code.map { String(Character.toChars(127397 + it.code)) }.joinToString("")
    }

    const val SHARE_APP_NAME = "Learn with Alphonso"

    /** Every line of text on the share card: real stats only, no link. */
    fun shareCardLines(name: String, courseLabel: String, level: String, streak: Int, minutesSpoken: Int, xpThisWeek: Int): List<String> = listOf(
        SHARE_APP_NAME, "$name's week", "$courseLabel $level",
        streak.toString(), "day streak",
        minutesSpoken.toString(), if (minutesSpoken == 1) "minute spoken" else "minutes spoken",
        xpThisWeek.toString(), "XP this week",
    )
}
