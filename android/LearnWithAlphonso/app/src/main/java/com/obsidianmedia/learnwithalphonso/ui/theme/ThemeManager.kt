package com.obsidianmedia.learnwithalphonso.ui.theme

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Shared theme state: the Android equivalent of the web's theme store and
 * iOS's AlphonsoThemeManager. Local first (SharedPreferences, instant);
 * syncing to profiles.theme is the settings screen's job.
 */
class ThemeManager(private val prefs: SharedPreferences) {
    private val _theme = MutableStateFlow(AlphonsoThemeId.fromRaw(prefs.getString(KEY, null)) ?: AlphonsoThemeId.DEFAULT)
    val theme: StateFlow<AlphonsoThemeId> = _theme.asStateFlow()

    fun setTheme(id: AlphonsoThemeId) {
        if (id == _theme.value) return
        _theme.value = id
        prefs.edit().putString(KEY, id.raw).apply()
    }

    /** Server value wins when present and valid (server > local > default), once per sign-in. */
    fun hydrateFromServer(serverValue: String?) {
        AlphonsoThemeId.fromRaw(serverValue)?.let(::setTheme)
    }

    private companion object {
        const val KEY = "alphonso.theme"
    }
}
