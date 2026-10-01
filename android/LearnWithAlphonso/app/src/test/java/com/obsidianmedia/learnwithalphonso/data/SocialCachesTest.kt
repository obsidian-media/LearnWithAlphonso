package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.logic.LeaderboardSnapshotEntry
import com.obsidianmedia.learnwithalphonso.core.logic.NudgeCooldown
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A minimal in-memory SharedPreferences: only the string operations the caches use. */
class MemoryPrefs : SharedPreferences {
    val map = HashMap<String, Any?>()
    override fun getAll() = map
    override fun getString(key: String, defValue: String?) = map[key] as String? ?: defValue
    override fun getStringSet(key: String, defValues: MutableSet<String>?) = defValues
    override fun getInt(key: String, defValue: Int) = defValue
    override fun getLong(key: String, defValue: Long) = defValue
    override fun getFloat(key: String, defValue: Float) = defValue
    override fun getBoolean(key: String, defValue: Boolean) = defValue
    override fun contains(key: String) = map.containsKey(key)
    override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
        private val pending = HashMap<String, Any?>()
        private val removals = HashSet<String>()
        override fun putString(key: String, value: String?) = apply { pending[key] = value }
        override fun putStringSet(key: String, values: MutableSet<String>?) = this
        override fun putInt(key: String, value: Int) = this
        override fun putLong(key: String, value: Long) = this
        override fun putFloat(key: String, value: Float) = this
        override fun putBoolean(key: String, value: Boolean) = this
        override fun remove(key: String) = apply { removals.add(key) }
        override fun clear() = apply { removals.addAll(map.keys) }
        override fun commit(): Boolean { apply(); return true }
        override fun apply() { removals.forEach { map.remove(it) }; map.putAll(pending) }
    }
    override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
    override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) = Unit
}

class SocialCachesTest {
    @Test
    fun `leaderboard snapshot round-trips and clears`() {
        val prefs = MemoryPrefs()
        val cache = LeaderboardSnapshotCache(prefs)
        assertNull(cache.lastSnapshot)
        cache.lastSnapshot = listOf(LeaderboardSnapshotEntry("u1", 100), LeaderboardSnapshotEntry("u2", 90))
        assertEquals(listOf(LeaderboardSnapshotEntry("u1", 100), LeaderboardSnapshotEntry("u2", 90)), LeaderboardSnapshotCache(prefs).lastSnapshot)
        cache.lastSnapshot = null
        assertNull(cache.lastSnapshot)
    }

    @Test
    fun `nudge cooldown persists across cache instances`() {
        // Review Focus 2.
        val prefs = MemoryPrefs()
        var now = 1_758_000_000_000L
        val first = NudgeCooldownCache(prefs) { now }
        assertTrue(first.canNudge("f1"))
        first.recordNudge("f1")
        val second = NudgeCooldownCache(prefs) { now }
        assertFalse(second.canNudge("f1"))
        assertTrue(second.canNudge("f2"))
        now += NudgeCooldown.COOLDOWN_MS - 1
        assertFalse(second.canNudge("f1"))
        now += 1
        assertTrue(second.canNudge("f1"))
    }

    @Test
    fun `recap and league tier caches round-trip`() {
        val prefs = MemoryPrefs()
        val recap = WeeklyRecapCache(prefs)
        assertNull(recap.lastRecapLeagueTier)
        recap.lastRecapLeagueTier = "silver"
        assertEquals("silver", WeeklyRecapCache(prefs).lastRecapLeagueTier)
        val tier = LeagueTierCache(prefs)
        tier.lastKnownTier = "ruby"
        assertEquals("ruby", prefs.getString(LeagueTierCache.KEY, null))
        tier.lastKnownTier = null
        assertNull(tier.lastKnownTier)
    }
}
