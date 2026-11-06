package com.obsidianmedia.learnwithalphonso.ui.lesson

import android.content.Context
import android.speech.tts.TextToSpeech
import com.obsidianmedia.learnwithalphonso.core.content.Course
import java.util.Locale

val Course.speechLocale: Locale get() = when (this) { Course.ENGLISH -> Locale.US; Course.FRENCH -> Locale.FRANCE; Course.SPANISH -> Locale("es", "ES") }

/** One TextToSpeech per process, the Android counterpart of the shared AVSpeechSynthesizer. */
class Speech(context: Context) {
    private var ready = false
    private val tts = TextToSpeech(context.applicationContext) { status -> ready = status == TextToSpeech.SUCCESS }

    fun speak(text: String, course: Course) {
        if (!ready) return
        tts.stop()
        tts.language = course.speechLocale
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "alphonso-${text.hashCode()}")
    }

    /** True while a line is being spoken; the sound effects wait for it to finish. */
    val isSpeaking: Boolean get() = ready && runCatching { tts.isSpeaking }.getOrDefault(false)

    companion object {
        @Volatile private var shared: Speech? = null

        /** Whether the shared voice is speaking, without starting a TextToSpeech just to ask. */
        fun isSpeakingNow(): Boolean = shared?.isSpeaking ?: false
        fun get(context: Context): Speech = shared ?: synchronized(this) { shared ?: Speech(context).also { shared = it } }
    }
}
