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

    /** The palette the user picked (visual round 6), or null until they pick one. */
    private var chosenPalette: AlphonsoPaletteId? = AlphonsoPaletteId.fromRaw(prefs.getString(PALETTE_KEY, null))
    private val _palette = MutableStateFlow(chosenPalette ?: AlphonsoPaletteId.forTheme(_theme.value))

    /** The design system palette: the user's pick, or until then the one closest to their theme. */
    val palette: StateFlow<AlphonsoPaletteId> = _palette.asStateFlow()

    fun setTheme(id: AlphonsoThemeId) {
        if (id == _theme.value) return
        _theme.value = id
        prefs.edit().putString(KEY, id.raw).apply()
        if (chosenPalette == null) _palette.value = AlphonsoPaletteId.forTheme(id)
    }

    /** Stored next to the theme. */
    fun setPalette(id: AlphonsoPaletteId) {
        chosenPalette = id
        _palette.value = id
        prefs.edit().putString(PALETTE_KEY, id.raw).apply()
    }

    /** Server value wins when present and valid (server > local > default), once per sign-in. */
    fun hydrateFromServer(serverValue: String?) {
        AlphonsoThemeId.fromRaw(serverValue)?.let(::setTheme)
    }

    private companion object {
        const val KEY = "alphonso.theme"
        const val PALETTE_KEY = "alphonso.palette"
    }
}
