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
    private val _theme = MutableStateFlow(AlphonsoThemeId.resolve(prefs.getString(KEY, null)))
    val theme: StateFlow<AlphonsoThemeId> = _theme.asStateFlow()

    private val _palette = MutableStateFlow(AlphonsoPaletteId.forTheme(_theme.value))

    /** The design system palette: the theme's own, Royal or Meadow. */
    val palette: StateFlow<AlphonsoPaletteId> = _palette.asStateFlow()

    init {
        // A retired value (Studio Ink, Manuscript, Canopy) is moved to Royal for good, silently.
        val saved = prefs.getString(KEY, null)
        if (saved != null && saved != _theme.value.raw) prefs.edit().putString(KEY, _theme.value.raw).apply()
        if (prefs.contains(PALETTE_KEY)) prefs.edit().remove(PALETTE_KEY).apply()
    }

    fun setTheme(id: AlphonsoThemeId) {
        if (id == _theme.value) return
        _theme.value = id
        prefs.edit().putString(KEY, id.raw).apply()
        _palette.value = AlphonsoPaletteId.forTheme(id)
    }

    /** The account's value wins when there is one (account > device > default); a retired value means Royal. */
    fun hydrateFromServer(serverValue: String?) {
        if (serverValue == null) return
        setTheme(AlphonsoThemeId.resolve(serverValue))
    }

    private companion object {
        const val KEY = "alphonso.theme"
        const val PALETTE_KEY = "alphonso.palette"
    }
}
