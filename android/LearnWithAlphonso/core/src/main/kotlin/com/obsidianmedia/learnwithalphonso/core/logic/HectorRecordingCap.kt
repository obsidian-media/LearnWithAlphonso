package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * How long one tap-to-record turn with Hector may run before it is stopped and sent. A held button was bounded by the
 * finger; a tapped one is not, so a forgotten tap must not leave the microphone open. Mirrored on iOS
 * (HectorRecordingCap.swift) and web (src/lib/hector-recording-cap.ts); keep the three equal.
 */
object HectorRecordingCap {
    const val SECONDS = 60
    const val MILLIS = SECONDS * 1000L
}
