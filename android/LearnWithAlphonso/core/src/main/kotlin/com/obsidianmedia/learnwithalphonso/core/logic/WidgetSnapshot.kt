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
)

const val STREAK_WIDGET_PREFS = "alphonso.widget"
const val STREAK_WIDGET_SNAPSHOT_KEY = "streakWidgetSnapshot"

/** studiedToday follows the UTC date convention of the streak math it is paired with. */
fun makeStreakWidgetSnapshot(streak: Int, longestStreak: Int, lastActiveDate: String?, nowMillis: Long): StreakWidgetSnapshot =
    StreakWidgetSnapshot(streak, longestStreak, lastActiveDate == utcDateString(nowMillis), nowMillis)
