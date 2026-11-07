package com.obsidianmedia.learnwithalphonso.core.sound

/**
 * The app's short sound effects (Kenney.nl, CC0; see THIRD_PARTY_NOTICES.md). The files ship as res/raw/<resourceName>.mp3.
 * This file is the pure logic; the app's SoundEffectsPlayer plays them.
 */
enum class SoundEffect(val resourceName: String, val durationMs: Long, val haptic: SoundEffectHaptic?) {
    RIGHT("sfx_right", 480, SoundEffectHaptic.SUCCESS),
    WRONG("sfx_wrong", 320, SoundEffectHaptic.WARNING),
    LESSON_COMPLETE("sfx_lesson_complete", 1160, SoundEffectHaptic.SUCCESS),
    XP("sfx_xp", 70, null),
    HEART_LOST("sfx_heart_lost", 180, null),
    TAP("sfx_tap", 70, null),
    CALL_START("sfx_call_start", 730, null),
    CALL_END("sfx_call_end", 720, null),
    ACHIEVEMENT("sfx_achievement", 300, SoundEffectHaptic.SUCCESS),
}

/** The light haptic that goes with a moment on a phone; it follows the system's touch-feedback setting. */
enum class SoundEffectHaptic { SUCCESS, WARNING }

/** The Settings "Sound effects" switch, stored on this device. On by default; off is completely silent. */
object SoundEffectsPreference {
    const val KEY = "soundEffectsEnabled"
    const val DEFAULT = true
}

data class SoundEffectCue(val effect: SoundEffect, val delayMs: Long)

object SoundEffectCues {
    /** A right or wrong answer; a lost heart follows the wrong-answer sound rather than playing over it. */
    fun verdict(correct: Boolean, losesHeart: Boolean): List<SoundEffectCue> = when {
        correct -> listOf(SoundEffectCue(SoundEffect.RIGHT, 0))
        losesHeart -> listOf(
            SoundEffectCue(SoundEffect.WRONG, 0),
            SoundEffectCue(SoundEffect.HEART_LOST, SoundEffect.WRONG.durationMs),
        )
        else -> listOf(SoundEffectCue(SoundEffect.WRONG, 0))
    }

    /** The complete screen: the jingle with the confetti, XP once it is over, the achievement as its card lands (1.7 s). */
    fun finish(xp: Int, unlocked: Int): List<SoundEffectCue> = buildList {
        add(SoundEffectCue(SoundEffect.LESSON_COMPLETE, 0))
        if (xp > 0) add(SoundEffectCue(SoundEffect.XP, 1200))
        if (unlocked > 0) add(SoundEffectCue(SoundEffect.ACHIEVEMENT, 1700))
    }
}

/**
 * Decides whether an effect plays: never with the switch off, never while Alphonso or Hector is speaking, and once per
 * key (so a recomposition cannot double it). Used on the main thread.
 */
class SoundEffectGate(
    private val isEnabled: () -> Boolean,
    private val isVoiceActive: () -> Boolean,
    private val nowMs: () -> Long = System::currentTimeMillis,
    /** The Settings switch alone (default: same as [isEnabled]); haptics follow it, so off is no haptics either. */
    isSwitchOn: (() -> Boolean)? = null,
) {
    private val switchOn: () -> Boolean = isSwitchOn ?: isEnabled
    private val playedKeys = mutableSetOf<String>()
    private var callCueEndsAt = 0L

    fun shouldPlay(effect: SoundEffect, key: String?): Boolean {
        if (!isEnabled()) return false
        if (key != null && key in playedKeys) return false
        if (isVoiceActive()) return false
        if (key != null) playedKeys += key
        if (effect == SoundEffect.CALL_START) callCueEndsAt = nowMs() + effect.durationMs
        return true
    }

    /** Whether an effect's haptic fires: only with the Sound effects switch on, and only for effects that have one. */
    fun shouldVibrate(effect: SoundEffect): Boolean = effect.haptic != null && switchOn()

    /** How long the call-start sound still has to play: the opening line waits this long. */
    fun callCueRemainingMs(): Long = maxOf(0L, callCueEndsAt - nowMs())
}

/** A moment's effects for the player: its cues, and the key that makes it play once (null: every time, e.g. a tap). */
data class SoundEffectRequest(val cues: List<SoundEffectCue>, val key: String?)
