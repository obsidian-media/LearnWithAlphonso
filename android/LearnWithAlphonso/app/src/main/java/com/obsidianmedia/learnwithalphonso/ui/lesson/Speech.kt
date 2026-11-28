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

    /** True when the line was handed to the engine; false while the engine is still starting (nothing was said). */
    fun speak(text: String, course: Course, rate: Float = 1f): Boolean {
        if (!ready) return false
        tts.stop()
        tts.language = course.speechLocale
        tts.setSpeechRate(rate)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "alphonso-${text.hashCode()}")
        return true
    }

    /** Whether the device has a voice for the course. Unknown (the engine is still starting) counts as yes, so a button is not hidden early. */
    fun canSpeak(course: Course): Boolean = !ready || runCatching { tts.isLanguageAvailable(course.speechLocale) >= TextToSpeech.LANG_AVAILABLE }.getOrDefault(true)

    fun stop() { if (ready) runCatching { tts.stop() } }

    /** True while a line is being spoken; the sound effects wait for it to finish. */
    val isSpeaking: Boolean get() = ready && runCatching { tts.isSpeaking }.getOrDefault(false)

    companion object {
        @Volatile private var shared: Speech? = null

        /** Whether the shared voice is speaking, without starting a TextToSpeech just to ask. */
        /** Stops the shared voice if one exists, without starting an engine just to stop it. */
        fun stopIfStarted() { shared?.stop() }
        fun isSpeakingNow(): Boolean = shared?.isSpeaking ?: false
        fun get(context: Context): Speech = shared ?: synchronized(this) { shared ?: Speech(context).also { shared = it } }
    }
}
