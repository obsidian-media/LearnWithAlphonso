package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The two themes: Royal (navy and gold, the default) and Meadow (green). Raw values match the web's THEME_NAMES, the
 * iOS Kit's DSPaletteID and the profiles.theme CHECK constraint, so a value round-trips unchanged. Each has a light
 * and a night appearance (the night one follows the system); Meadow has only a light one.
 *
 * Studio Ink, Manuscript and Canopy are gone: a stored value that is one of them, or unknown, means Royal (resolve).
 */
enum class AlphonsoThemeId(val raw: String, val displayName: String) {
    ROYAL("royal", "Royal"),
    MEADOW("meadow", "Meadow");

    companion object {
        val DEFAULT = ROYAL

        /** Any stored raw value to a theme: Meadow stays Meadow, everything else (retired, unknown, null) is Royal. */
        fun resolve(raw: String?): AlphonsoThemeId = if (raw == MEADOW.raw) MEADOW else ROYAL
    }
}

/** Which bundled font file a theme's display or body text resolves from. */
enum class AlphonsoFontFace { FRAUNCES, GEIST, BALOO2 }

/** One theme's resolved tokens; hex values are copied from AlphonsoTheme.swift verbatim. */
data class AlphonsoPalette(
    val surface: Color,
    val parchment: Color,
    val ink: Color,
    val inkSoft: Color,
    val moss: Color,
    val mossDeep: Color,
    val ember: Color,
    val emberSoft: Color,
    val destructive: Color,
    val hairline: Color,
    /** Text on a moss-filled surface. */
    val onPrimary: Color,
    /** Text on an ember-filled surface. */
    val onAccent: Color,
    /** Text on the moss-to-mossDeep gradient banner. */
    val onMossGradient: Color,
    val isDark: Boolean,
    val displayFont: AlphonsoFontFace,
    val sansFont: AlphonsoFontFace,
)

private fun rgb(hex: Long): Color = Color(0xFF000000L or hex)
private fun rgba(hex: Long, alpha: Float): Color = rgb(hex).copy(alpha = alpha)

object AlphonsoPalettes {
    /** Light variant of each theme. */
    val light: Map<AlphonsoThemeId, AlphonsoPalette> = mapOf(
        AlphonsoThemeId.MEADOW to AlphonsoPalette(
            surface = rgb(0xF5F0E8), parchment = rgb(0xEDE4D8), ink = rgb(0x112418), inkSoft = rgb(0x435147),
            moss = rgb(0x2F6243), mossDeep = rgb(0x153C25), ember = rgb(0xD75928), emberSoft = rgb(0xF6CFB0),
            destructive = rgb(0xE7000B), hairline = rgba(0x112418, 0.1f),
            onPrimary = rgb(0xF5F0E8), onAccent = rgb(0xF5F0E8), onMossGradient = rgb(0xF5F0E8),
            isDark = false, displayFont = AlphonsoFontFace.FRAUNCES, sansFont = AlphonsoFontFace.GEIST,
        ),
        AlphonsoThemeId.ROYAL to AlphonsoPalette(
            surface = rgb(0xFBF6EC), parchment = rgb(0xFFFFFF), ink = rgb(0x141B3D), inkSoft = rgb(0x5A5873),
            moss = rgb(0x1D2B64), mossDeep = rgb(0x141B3D), ember = rgb(0xE4573F), emberSoft = rgb(0xFDD3CA),
            destructive = rgb(0xE7000B), hairline = rgba(0x141B3D, 0.1f),
            onPrimary = rgb(0xFBF6EC), onAccent = rgb(0x141B3D), onMossGradient = rgb(0xFBF6EC),
            isDark = false, displayFont = AlphonsoFontFace.BALOO2, sansFont = AlphonsoFontFace.GEIST,
        ),
    )

    /** Night variant. Royal only: Meadow has no night look and stays light, even in dark mode (owner decision 2026-11-14). */
    val dark: Map<AlphonsoThemeId, AlphonsoPalette> = mapOf(
        AlphonsoThemeId.ROYAL to AlphonsoPalette(
            surface = rgb(0x0E1330), parchment = rgb(0x161C40), ink = rgb(0xECE7F5), inkSoft = rgb(0xA9AEC9),
            moss = rgb(0xC9D2F7), mossDeep = rgb(0x9AA8E8), ember = rgb(0xE4573F), emberSoft = rgb(0x4F2117),
            destructive = rgb(0xFF0B16), hairline = rgba(0xFFFFFF, 0.1f),
            onPrimary = rgb(0x0E1330), onAccent = rgb(0x0E1330), onMossGradient = rgb(0x0E1330),
            isDark = true, displayFont = AlphonsoFontFace.BALOO2, sansFont = AlphonsoFontFace.GEIST,
        ),
    )

    /** Whether the theme draws its night look when the system is dark: Royal does; Meadow never does. */
    fun usesNight(themeId: AlphonsoThemeId, systemDark: Boolean): Boolean = themeId == AlphonsoThemeId.ROYAL && systemDark

    /** Royal follows the system setting (night values when the system is dark); Meadow is always its light values. */
    fun resolve(themeId: AlphonsoThemeId, systemDark: Boolean): AlphonsoPalette {
        if (usesNight(themeId, systemDark)) dark[themeId]?.let { return it }
        return light[themeId] ?: light.getValue(AlphonsoThemeId.ROYAL)
    }

    /**
     * How the status and navigation bars are drawn: Meadow is held to light bars (dark icons) whatever the system
     * says; Royal follows the system as before.
     */
    fun systemBars(themeId: AlphonsoThemeId): SystemBars = if (themeId == AlphonsoThemeId.MEADOW) SystemBars.LIGHT else SystemBars.FOLLOW_SYSTEM
}

/** See AlphonsoPalettes.systemBars. */
enum class SystemBars { LIGHT, FOLLOW_SYSTEM }
