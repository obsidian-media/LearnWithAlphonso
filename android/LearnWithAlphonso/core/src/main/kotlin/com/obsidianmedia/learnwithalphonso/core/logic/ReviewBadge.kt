package com.obsidianmedia.learnwithalphonso.core.logic

/** Port of ReviewBadge.swift: the Learn tab's due-review count label. */
object ReviewBadge {
    fun text(dueCount: Int): String? = when {
        dueCount <= 0 -> null
        dueCount > 99 -> "99+"
        else -> dueCount.toString()
    }
}
