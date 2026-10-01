package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The four themes the web app defines in src/styles.css and iOS mirrors in
 * AlphonsoTheme.swift. Raw values match the web's THEME_NAMES and the
 * profiles.theme CHECK constraint, so a value round-trips unchanged.
 */
enum class AlphonsoThemeId(val raw: String, val displayName: String) {
    MEADOW("meadow", "Meadow"),
    STUDIO_INK("studio-ink", "Studio Ink"),
    MANUSCRIPT("manuscript", "Manuscript"),
    CANOPY("canopy", "Canopy");

    companion object {
        val DEFAULT = CANOPY
        fun fromRaw(raw: String?): AlphonsoThemeId? = entries.firstOrNull { it.raw == raw }
    }
}

/** Which bundled font file a theme's display or body text resolves from. */
enum class AlphonsoFontFace { FRAUNCES, GEIST, INSTRUMENT_SERIF, INSTRUMENT_SANS, NEWSREADER, SOURCE_SANS3, BALOO2 }

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
    /** Light variant of each theme. Studio Ink has no light variant and lives here as its only form. */
    val light: Map<AlphonsoThemeId, AlphonsoPalette> = mapOf(
        AlphonsoThemeId.MEADOW to AlphonsoPalette(
            surface = rgb(0xF5F0E8), parchment = rgb(0xEDE4D8), ink = rgb(0x112418), inkSoft = rgb(0x435147),
            moss = rgb(0x2F6243), mossDeep = rgb(0x153C25), ember = rgb(0xD75928), emberSoft = rgb(0xF6CFB0),
            destructive = rgb(0xE7000B), hairline = rgba(0x112418, 0.1f),
            onPrimary = rgb(0xF5F0E8), onAccent = rgb(0xF5F0E8), onMossGradient = rgb(0xF5F0E8),
            isDark = false, displayFont = AlphonsoFontFace.FRAUNCES, sansFont = AlphonsoFontFace.GEIST,
        ),
        AlphonsoThemeId.STUDIO_INK to AlphonsoPalette(
            surface = rgb(0x0B0D12), parchment = rgb(0x13161C), ink = rgb(0xF5F1EA), inkSoft = rgb(0xAAA49A),
            moss = rgb(0x0072D5), mossDeep = rgb(0x004699), ember = rgb(0x0072D5), emberSoft = rgb(0x002E5D),
            destructive = rgb(0xF8000C), hairline = rgba(0xFFFFFF, 0.1f),
            onPrimary = rgb(0x0B0D12), onAccent = rgb(0x0B0D12), onMossGradient = rgb(0xF5F1EA),
            isDark = true, displayFont = AlphonsoFontFace.INSTRUMENT_SERIF, sansFont = AlphonsoFontFace.INSTRUMENT_SANS,
        ),
        AlphonsoThemeId.MANUSCRIPT to AlphonsoPalette(
            surface = rgb(0xF3F5F8), parchment = rgb(0xE9EBEE), ink = rgb(0x0F1216), inkSoft = rgb(0x4A4D53),
            moss = rgb(0x8D1828), mossDeep = rgb(0x650014), ember = rgb(0x8D1828), emberSoft = rgb(0xEDC1C0),
            destructive = rgb(0xE7000B), hairline = rgba(0x0F1216, 0.12f),
            onPrimary = rgb(0xF3F5F8), onAccent = rgb(0xF3F5F8), onMossGradient = rgb(0xF3F5F8),
            isDark = false, displayFont = AlphonsoFontFace.NEWSREADER, sansFont = AlphonsoFontFace.SOURCE_SANS3,
        ),
        AlphonsoThemeId.CANOPY to AlphonsoPalette(
            surface = rgb(0xEFFAF4), parchment = rgb(0xDCF3E8), ink = rgb(0x05261A), inkSoft = rgb(0x406052),
            moss = rgb(0x0C6944), mossDeep = rgb(0x133F2B), ember = rgb(0xE4573F), emberSoft = rgb(0xFDD3CA),
            destructive = rgb(0xE7000B), hairline = rgba(0x05261A, 0.1f),
            onPrimary = rgb(0xEFFAF4), onAccent = rgb(0x05261A), onMossGradient = rgb(0xEFFAF4),
            isDark = false, displayFont = AlphonsoFontFace.BALOO2, sansFont = AlphonsoFontFace.GEIST,
        ),
    )

    /** Dark variant of each light theme. Studio Ink is already dark and is deliberately absent. */
    val dark: Map<AlphonsoThemeId, AlphonsoPalette> = mapOf(
        AlphonsoThemeId.MEADOW to AlphonsoPalette(
            surface = rgb(0x0C1810), parchment = rgb(0x15261B), ink = rgb(0xF4F1EC), inkSoft = rgb(0xB9B0A2),
            moss = rgb(0x2F6243), mossDeep = rgb(0x153C25), ember = rgb(0xD75928), emberSoft = rgb(0x4F3017),
            destructive = rgb(0xFF0A15), hairline = rgba(0xFFFFFF, 0.1f),
            onPrimary = rgb(0xF4F1EC), onAccent = rgb(0x0C1810), onMossGradient = rgb(0xF4F1EC),
            isDark = true, displayFont = AlphonsoFontFace.FRAUNCES, sansFont = AlphonsoFontFace.GEIST,
        ),
        AlphonsoThemeId.MANUSCRIPT to AlphonsoPalette(
            surface = rgb(0x0E1115), parchment = rgb(0x181D23), ink = rgb(0xECEFF4), inkSoft = rgb(0xA2ABB9),
            moss = rgb(0x8D1828), mossDeep = rgb(0x650014), ember = rgb(0x8D1828), emberSoft = rgb(0x4F1817),
            destructive = rgb(0xFB000C), hairline = rgba(0xFFFFFF, 0.1f),
            onPrimary = rgb(0xECEFF4), onAccent = rgb(0xECEFF4), onMossGradient = rgb(0xECEFF4),
            isDark = true, displayFont = AlphonsoFontFace.NEWSREADER, sansFont = AlphonsoFontFace.SOURCE_SANS3,
        ),
        AlphonsoThemeId.CANOPY to AlphonsoPalette(
            surface = rgb(0x0C1813), parchment = rgb(0x15261F), ink = rgb(0xECF4EF), inkSoft = rgb(0xA2B9AC),
            moss = rgb(0x0C6944), mossDeep = rgb(0x133F2B), ember = rgb(0xE4573F), emberSoft = rgb(0x4F2117),
            destructive = rgb(0xFF0B16), hairline = rgba(0xFFFFFF, 0.1f),
            onPrimary = rgb(0xECF4EF), onAccent = rgb(0x0C1813), onMossGradient = rgb(0xECF4EF),
            isDark = true, displayFont = AlphonsoFontFace.BALOO2, sansFont = AlphonsoFontFace.GEIST,
        ),
    )

    /** Studio Ink ignores the system setting; every other theme follows it. */
    fun resolve(themeId: AlphonsoThemeId, systemDark: Boolean): AlphonsoPalette {
        if (themeId == AlphonsoThemeId.STUDIO_INK) return light.getValue(AlphonsoThemeId.STUDIO_INK)
        if (systemDark) dark[themeId]?.let { return it }
        return light[themeId] ?: light.getValue(AlphonsoThemeId.MEADOW)
    }
}
