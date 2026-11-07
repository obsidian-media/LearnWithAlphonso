package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.profile.ProfileAchievementRow
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileActivityDay
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileCompletion
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileCourseProgress
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileOverviewData
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileSpeechDay
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileWeakItem
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileWeaknessEvent
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileLeagueStanding
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileLearningDay
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileSkillDay
import io.ktor.http.HttpMethod
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The Profile's one batched read (visual round 6, part 4): the same tables and filters as the web's getProfileOverview
 * (src/lib/profile.functions.ts), fired together. RLS returns the caller's own rows only.
 */
suspend fun ProgressSyncClient.fetchProfileOverview(
    userId: String, course: String, nowMillis: Long = System.currentTimeMillis(),
): ProfileOverviewData = coroutineScope {
    val today = ProfileMath.streakToday(nowMillis)
    val from = ProfileMath.weekStart(ProfileMath.threeMonthsWindow(today).first)
    val me = "eq.$userId"
    suspend fun rows(table: String, query: Map<String, String>, extra: List<Pair<String, String>> = emptyList()) =
        rowsOf(http.rest(HttpMethod.Get, table, query + ("user_id" to me), queryList = extra))

    val profile = async { rowsOf(http.rest(HttpMethod.Get, "profiles", mapOf("select" to "display_name,avatar_seed,country", "id" to me))) }
    val langs = async { rows("language_progress", mapOf("select" to "language,xp,cefr_level,league_tier")) }
    val prog = async { rows("user_progress", mapOf("select" to "streak,longest_streak,streak_freezes")) }
    val comps = async { rows("lesson_completions", mapOf("select" to "lesson_id,language,correct,total")) }
    val acts = async { rows("activity_days", mapOf("select" to "day,xp_earned", "day" to "gte.$from", "order" to "day.asc")) }
    val best = async { rows("activity_days", mapOf("select" to "xp_earned", "order" to "xp_earned.desc", "limit" to "1")) }
    val speech = async { rows("speech_days", mapOf("select" to "day,speech_seconds", "day" to "gte.${ProfileMath.weekStart(today)}")) }
    val weak = async {
        rows("review_items", mapOf("select" to "weakness_label,weakness_display,lapses,repetitions", "language" to "eq.$course", "source" to "eq.weakness"))
    }
    val saved = async {
        val response = http.rest(
            HttpMethod.Get, "review_items",
            mapOf("select" to "item_key", "user_id" to me, "language" to "eq.$course", "source" to "eq.saved_word", "limit" to "1"),
            headers = mapOf("Prefer" to "count=exact"),
        )
        http.requireSuccess(response)
        response.headers["Content-Range"]?.substringAfter('/')?.toIntOrNull() ?: 0
    }
    val events = async { rows("weakness_events", mapOf("select" to "category,event_type,created_at", "order" to "created_at.asc")) }
    val achievements = async { rows("user_achievements", mapOf("select" to "achievement_id,progress,unlocked_at")) }
    // The friends board is secondary: if it fails the rest of Profile still shows.
    val friends = async { try { fetchFriendsProgress() } catch (e: CancellationException) { throw e } catch (e: Exception) { emptyList() } }

    // Profile data reads are secondary too: a failure leaves that part empty, never the whole screen.
    suspend fun <T> secondary(fallback: T, block: suspend () -> T): T =
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { fallback }
    val learning = async {
        secondary(emptyList()) {
            rows("learning_days", mapOf("select" to "day,lesson_seconds,practice_seconds", "day" to "gte.${ProfileMath.weekStart(today)}"))
                .mapNotNull { r -> ProfileLearningDay(r.string("day") ?: return@mapNotNull null, r.int("lesson_seconds") ?: 0, r.int("practice_seconds") ?: 0) }
        }
    }
    val mastered = async {
        secondary(0) {
            val response = http.rest(
                HttpMethod.Get, "mastered_words",
                mapOf("select" to "item_key", "user_id" to me, "language" to "eq.$course", "limit" to "1"),
                headers = mapOf("Prefer" to "count=exact"),
            )
            http.requireSuccess(response)
            response.headers["Content-Range"]?.substringAfter('/')?.toIntOrNull() ?: 0
        }
    }
    val league = async {
        secondary<ProfileLeagueStanding?>(null) {
            val r = rowsOf(http.rpc("get_my_league_standing", buildJsonObject { put("_course", course) })).firstOrNull()
            val tier = r?.string("league_tier")
            val start = r?.string("week_start")
            val end = r?.string("week_end")
            if (r == null || tier == null || start == null || end == null) null
            else ProfileLeagueStanding(tier, r.int("rank") ?: 0, r.int("size") ?: 0, start, end, r.int("week_xp") ?: 0)
        }
    }
    val zone = async {
        secondary<String?>(null) { rows("learner_time_zones", mapOf("select" to "time_zone")).firstOrNull()?.string("time_zone") }
    }
    val skills = async {
        secondary(emptyList()) {
            rows("skill_days", mapOf("select" to "day,skill,right_answers,total_answers", "day" to "gte.${ProfileMath.addDays(today, -(ProfileMath.SKILL_WINDOW_DAYS - 1))}"))
                .mapNotNull { r ->
                    ProfileSkillDay(r.string("day") ?: return@mapNotNull null, r.string("skill") ?: return@mapNotNull null, r.int("right_answers") ?: 0, r.int("total_answers") ?: 0)
                }
        }
    }

    val p = profile.await().firstOrNull()
    val u = prog.await().firstOrNull()
    ProfileOverviewData(
        today = today,
        course = course,
        displayName = p?.string("display_name"),
        avatarSeed = p?.string("avatar_seed"),
        country = p?.string("country"),
        courses = langs.await().mapNotNull { r ->
            ProfileCourseProgress(r.string("language") ?: return@mapNotNull null, r.int("xp") ?: 0, r.string("cefr_level") ?: "A1", r.string("league_tier") ?: "bronze")
        },
        streak = u?.int("streak") ?: 0,
        longestStreak = u?.int("longest_streak") ?: 0,
        streakFreezes = u?.int("streak_freezes") ?: 0,
        completions = comps.await().mapNotNull { r ->
            ProfileCompletion(r.string("lesson_id") ?: return@mapNotNull null, r.string("language") ?: return@mapNotNull null, r.int("correct") ?: 0, r.int("total") ?: 0)
        },
        activity = acts.await().mapNotNull { r -> ProfileActivityDay(r.string("day") ?: return@mapNotNull null, r.int("xp_earned") ?: 0) },
        bestDayXp = best.await().firstOrNull()?.int("xp_earned") ?: 0,
        speech = speech.await().mapNotNull { r -> ProfileSpeechDay(r.string("day") ?: return@mapNotNull null, r.int("speech_seconds") ?: 0) },
        weakItems = weak.await().mapNotNull { r ->
            val label = r.string("weakness_label")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val display = r.string("weakness_display")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            ProfileWeakItem(label, display, r.int("lapses") ?: 0, r.int("repetitions") ?: 0)
        },
        savedWords = saved.await(),
        weaknessEvents = events.await().mapNotNull { r ->
            ProfileWeaknessEvent(r.string("category") ?: return@mapNotNull null, r.string("event_type") ?: return@mapNotNull null, r.string("created_at") ?: return@mapNotNull null)
        },
        achievements = achievements.await().mapNotNull { r ->
            ProfileAchievementRow(r.string("achievement_id") ?: return@mapNotNull null, r.int("progress") ?: 0, r.string("unlocked_at"))
        },
        friends = friends.await(),
        learning = learning.await(),
        masteredWords = mastered.await(),
        league = league.await(),
        timeZone = zone.await(),
        skills = skills.await(),
    )
}
