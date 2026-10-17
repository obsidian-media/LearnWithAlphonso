package com.obsidianmedia.learnwithalphonso.data

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.content.CourseKeyValueStore

/** The active course, remembered per account in the app's preferences. */
class PrefsCourseStore(private val prefs: SharedPreferences) : CourseKeyValueStore {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) = prefs.edit().putString(key, value).apply()
}
