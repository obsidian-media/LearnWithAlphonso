package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.goal.GoalCacheStore

/**
 * Keeps the learning-goal offline cache in the app's SharedPreferences. The keys already include the user id and
 * course (GoalCache.key), so one account never reads another's entry.
 */
class GoalPrefsStore(private val prefs: SharedPreferences) : GoalCacheStore {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    override fun remove(key: String) { prefs.edit().remove(key).apply() }
}
