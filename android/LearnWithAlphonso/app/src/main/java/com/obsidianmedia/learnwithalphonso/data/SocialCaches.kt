package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.logic.LeaderboardSnapshotEntry
import com.obsidianmedia.learnwithalphonso.core.logic.NudgeCooldown
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

/** Ports of the small UserDefaults caches in the iOS app, over SharedPreferences. */

@Serializable
private data class SnapshotEntryJson(val userId: String, val xp: Int)

/** The last global weekly leaderboard, for overtake detection between visits. */
class LeaderboardSnapshotCache(private val prefs: SharedPreferences) {
    var lastSnapshot: List<LeaderboardSnapshotEntry>?
        get() = prefs.getString(KEY, null)?.let { raw ->
            runCatching { ContentJson.json.decodeFromString(ListSerializer(SnapshotEntryJson.serializer()), raw) }.getOrNull()
                ?.map { LeaderboardSnapshotEntry(it.userId, it.xp) }
        }
        set(value) {
            if (value == null) prefs.edit().remove(KEY).apply()
            else prefs.edit().putString(KEY, ContentJson.json.encodeToString(ListSerializer(SnapshotEntryJson.serializer()), value.map { SnapshotEntryJson(it.userId, it.xp) })).apply()
        }

    private companion object { const val KEY = "lastGlobalWeeklyLeaderboardSnapshot" }
}

/** The league tier shown at the last weekly recap, so a promotion is celebrated once. */
class WeeklyRecapCache(private val prefs: SharedPreferences) {
    var lastRecapLeagueTier: String?
        get() = prefs.getString(KEY, null)
        set(value) { prefs.edit().apply { if (value == null) remove(KEY) else putString(KEY, value) }.apply() }

    private companion object { const val KEY = "lastRecapLeagueTier" }
}

/** The league tier the lesson player last saw, for the promotion overlay. */
class LeagueTierCache(private val prefs: SharedPreferences) {
    var lastKnownTier: String?
        get() = prefs.getString(KEY, null)
        set(value) { prefs.edit().apply { if (value == null) remove(KEY) else putString(KEY, value) }.apply() }

    companion object { const val KEY = "lastKnownLeagueTier" }
}

/** One nudge per friend per 24 hours, persisted so process death does not reset it (Plan 2 Review Focus 2). */
class NudgeCooldownCache(private val prefs: SharedPreferences, private val now: () -> Long = System::currentTimeMillis) {
    private val serializer = MapSerializer(String.serializer(), Long.serializer())

    private fun timestamps(): Map<String, Long> =
        prefs.getString(KEY, null)?.let { raw -> runCatching { ContentJson.json.decodeFromString(serializer, raw) }.getOrNull() } ?: emptyMap()

    fun canNudge(friendId: String): Boolean = NudgeCooldown.canNudge(timestamps()[friendId], now())

    fun recordNudge(friendId: String) {
        val next = timestamps() + (friendId to now())
        prefs.edit().putString(KEY, ContentJson.json.encodeToString(serializer, next)).apply()
    }

    private companion object { const val KEY = "nudgeCooldowns" }
}
