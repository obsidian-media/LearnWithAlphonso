package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.serialization.Serializable

/**
 * Port of WidgetSharing.swift: the small, flattened snapshot the app writes
 * for the home-screen streak widget. One-directional: the app writes, the
 * widget only reads.
 */
@Serializable
data class StreakWidgetSnapshot(
    val streak: Int,
    val longestStreak: Int,
    val studiedToday: Boolean,
    val updatedAtMillis: Long,
    /**
     * The app's theme when this was written, the stored raw value ("royal" or "meadow"). Missing in a snapshot
     * written before the widget knew themes: it reads as Royal (resolveStreakWidgetLook).
     */
    val theme: String? = null,
    /** The learner's last active local day when this was written, so [asOf] can end the streak on a day the app is not opened. */
    val lastActiveDate: String? = null,
    /** The streak freezes when written, so [asOf] can tell a protected streak from a lapsed one. Null reads as none. */
    val streakFreezes: Int? = null,
    /** Missed days that the freezes cover: the widget shows the streak with the protected line. */
    val isStreakProtected: Boolean = false,
    /** user_progress.day_basis when written (StreakRule's one-time UTC bridge). */
    val dayBasis: String? = null,
) {
    /** The same numbers under another theme: what the app writes when the learner changes theme. */
    fun withTheme(theme: String?): StreakWidgetSnapshot = copy(theme = theme)

    /**
     * This snapshot as it should read at [nowMillis] (asOf in WidgetSharing.swift): "Studied today" only on the local
     * day it was written, and the streak as the server's own rule reads it then (StreakDisplay): alive only by a
     * freeze reads as protected, a run the next lesson would restart reads 0.
     */
    fun asOf(nowMillis: Long, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): StreakWidgetSnapshot {
        val studied = studiedToday && localDateString(nowMillis, zone) == localDateString(updatedAtMillis, zone)
        val shown = StreakDisplay.shown(streak, lastActiveDate, streakFreezes, dayBasis, nowMillis, zone)
        return copy(streak = shown.streak, studiedToday = studied, isStreakProtected = shown.state == StreakDisplay.State.PROTECTED)
    }
}

const val STREAK_WIDGET_PREFS = "alphonso.widget"
const val STREAK_WIDGET_SNAPSHOT_KEY = "streakWidgetSnapshot"

/** studiedToday follows the learner's local day, like the streak it is paired with. */
fun makeStreakWidgetSnapshot(
    streak: Int,
    longestStreak: Int,
    lastActiveDate: String?,
    nowMillis: Long,
    zone: java.time.ZoneId = java.time.ZoneId.systemDefault(),
    theme: String? = null,
    streakFreezes: Int? = null,
    dayBasis: String? = null,
): StreakWidgetSnapshot =
    StreakWidgetSnapshot(
        streak, longestStreak, lastActiveDate == localDateString(nowMillis, zone), nowMillis, theme,
        lastActiveDate = lastActiveDate, streakFreezes = streakFreezes, dayBasis = dayBasis,
    ).asOf(nowMillis, zone)

/** The widget's words, the same on both platforms (the iOS Kit's StreakWidgetCopy). */
object StreakWidgetCopy {
    fun caption(streak: Int): String = if (streak == 1) "day in a row" else "days in a row"

    /** The best streak is never below the current one, so a longest that lags it still reads sensibly. */
    fun best(streak: Int, longestStreak: Int): String = "Best: ${maxOf(streak, longestStreak)}"

    const val STUDIED_TODAY = "Studied today"
    const val NOT_STUDIED_YET = "Not studied yet"
    const val EMPTY = "Open Alphonso to start your streak"
}

/** The two sizes: the 2x2 face and the 4x2 face (Alphonso and the best streak). iOS: systemSmall and systemMedium. */
enum class StreakWidgetFamily { SMALL, MEDIUM }

/** The width at which a resizable widget switches to the wide face. A 3x2 widget is about 180 dp, a 4x2 about 250 or more. */
const val STREAK_WIDGET_WIDE_MIN_DP = 220f

fun streakWidgetFamilyForWidth(widthDp: Float): StreakWidgetFamily =
    if (widthDp >= STREAK_WIDGET_WIDE_MIN_DP) StreakWidgetFamily.MEDIUM else StreakWidgetFamily.SMALL

/**
 * How much of the design system number size the streak number gets, so a long streak still fits the 2x2 face beside
 * the flame (34 sp digits need about 102 dp for three of them in the 86 dp left). The iOS view scales to fit instead.
 */
fun streakNumberScale(streak: Int): Float = when {
    streak >= 1000 -> 0.5f
    streak >= 100 -> 0.7f
    else -> 1f
}

/** What each size draws; the iOS Kit's StreakWidgetLayout. */
data class StreakWidgetLayout(val showsAlphonso: Boolean, val showsBest: Boolean, val isEmpty: Boolean) {
    companion object {
        /** Alphonso and the best line belong to the wide widget with a streak to show; the empty state is the same at every size. */
        fun resolve(family: StreakWidgetFamily, hasSnapshot: Boolean): StreakWidgetLayout {
            val wide = hasSnapshot && family == StreakWidgetFamily.MEDIUM
            return StreakWidgetLayout(showsAlphonso = wide, showsBest = wide, isEmpty = !hasSnapshot)
        }
    }
}

/** The widget has exactly three looks: Royal light, Royal night (the system is dark) and Meadow (always light). */
enum class StreakWidgetLook { ROYAL_LIGHT, ROYAL_NIGHT, MEADOW_LIGHT }

/**
 * The look for a snapshot's stored theme on a system in light or dark mode: Meadow ignores dark mode (owner decision
 * 2026-11-14), a missing or unknown theme is Royal.
 */
fun resolveStreakWidgetLook(theme: String?, systemDark: Boolean): StreakWidgetLook = when {
    theme == "meadow" -> StreakWidgetLook.MEADOW_LIGHT
    systemDark -> StreakWidgetLook.ROYAL_NIGHT
    else -> StreakWidgetLook.ROYAL_LIGHT
}
