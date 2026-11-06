package com.obsidianmedia.learnwithalphonso.audio

import android.content.Context
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffect
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectGate
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectHaptic
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectRequest
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectsPreference
import com.obsidianmedia.learnwithalphonso.ui.lesson.Speech
import java.util.concurrent.ConcurrentHashMap

/**
 * Plays the short sound effects (Kenney.nl, CC0) from a SoundPool. The rules (the Settings switch, never over Alphonso
 * or Hector, once per key) are core's SoundEffectGate; this class only makes the sounds.
 *
 * Audio: USAGE_ASSISTANCE_SONIFICATION, so effects ride the system/sonification volume, and nothing plays unless the
 * ringer is in normal mode (silent and vibrate are silent). No audio focus is requested, so an effect never pauses the
 * learner's music, the podcast or a voice.
 */
class SoundEffectsPlayer(context: Context, private val prefs: SharedPreferences) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val pool = SoundPool.Builder()
        .setMaxStreams(3)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    private val sounds: Map<SoundEffect, Int> = SoundEffect.entries.associateWith { pool.load(context, rawId(it), 1) }
    private val main = Handler(Looper.getMainLooper())

    /** Screens that play a voice register a probe; any true one means a voice is playing and the effect is skipped. */
    private val voiceProbes = ConcurrentHashMap<String, () -> Boolean>()

    private val gate = SoundEffectGate(
        isEnabled = {
            prefs.getBoolean(SoundEffectsPreference.KEY, SoundEffectsPreference.DEFAULT) &&
                audioManager.ringerMode == AudioManager.RINGER_MODE_NORMAL
        },
        isVoiceActive = { Speech.isSpeakingNow() || voiceProbes.values.any { runCatching { it() }.getOrDefault(false) } },
    )

    fun registerVoiceProbe(id: String, probe: () -> Boolean) { voiceProbes[id] = probe }
    fun unregisterVoiceProbe(id: String) { voiceProbes.remove(id) }

    /** Plays one effect now. Never throws. */
    fun play(effect: SoundEffect, key: String? = null) {
        if (!gate.shouldPlay(effect, key)) return
        val id = sounds[effect] ?: return
        runCatching { pool.play(id, 1f, 1f, 1, 0, 1f) }
    }

    /** Plays a moment's cues at their times, each under its own key; its haptics fire with them (not gated by the switch). */
    fun play(request: SoundEffectRequest, haptic: (SoundEffectHaptic) -> Unit = {}) {
        for (cue in request.cues) {
            val key = request.key?.let { "$it-${cue.effect.name}" }
            val fire = {
                cue.effect.haptic?.let(haptic)
                play(cue.effect, key)
            }
            if (cue.delayMs <= 0) fire() else main.postDelayed(fire, cue.delayMs)
        }
    }

    /** How long the call-start sound still has to play: a call's opening line waits this long. */
    fun callCueRemainingMs(): Long = gate.callCueRemainingMs()

    private fun rawId(effect: SoundEffect): Int = when (effect) {
        SoundEffect.RIGHT -> R.raw.sfx_right
        SoundEffect.WRONG -> R.raw.sfx_wrong
        SoundEffect.LESSON_COMPLETE -> R.raw.sfx_lesson_complete
        SoundEffect.XP -> R.raw.sfx_xp
        SoundEffect.HEART_LOST -> R.raw.sfx_heart_lost
        SoundEffect.TAP -> R.raw.sfx_tap
        SoundEffect.CALL_START -> R.raw.sfx_call_start
        SoundEffect.CALL_END -> R.raw.sfx_call_end
        SoundEffect.ACHIEVEMENT -> R.raw.sfx_achievement
    }
}

/** A light haptic through the view, so it follows the system's touch-feedback setting. */
fun View.playHaptic(haptic: SoundEffectHaptic) {
    val constant = when (haptic) {
        SoundEffectHaptic.SUCCESS ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
        SoundEffectHaptic.WARNING ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
    }
    performHapticFeedback(constant)
}

@Composable
fun rememberHaptics(): (SoundEffectHaptic) -> Unit {
    val view = LocalView.current
    return remember(view) { { haptic: SoundEffectHaptic -> view.playHaptic(haptic) } }
}
