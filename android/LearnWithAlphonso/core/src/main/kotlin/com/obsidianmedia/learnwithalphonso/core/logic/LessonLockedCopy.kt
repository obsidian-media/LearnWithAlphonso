package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * What the lesson screen shows, instead of the lesson, when start-lesson-session refuses it as not unlocked yet
 * (409 lesson-locked): the same words as the web's lesson page, and a way back to Learn. Shown before play, so no
 * attempt is ever played and then refused at the finish. LessonLockedCopy.swift is the iOS twin.
 */
object LessonLockedCopy {
    const val TITLE = "Finish the earlier lessons first"
    const val MESSAGE = "This lesson opens once the ones before it are done."
    const val BACK_TITLE = "Back to Learn"
}
