package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * The voice engine's phase as hands-free sees it: the same seven phases as iOS's `VoicePhase`
 * (the engine's [TurnPhase] plus the conversation's thinking and speaking, and a failure).
 */
enum class VoicePhase { IDLE, REQUESTING_PERMISSION, RECORDING, TRANSCRIBING, THINKING, SPEAKING, FAILED }

/**
 * Hands-free conversation for Hector and Practice: instead of holding the mic, the learner talks and the turn ends on
 * its own after a pause, then the next turn starts listening once the partner has finished replying.
 *
 * A port of iOS's `HandsFreeLoop.swift`, number for number. Pure and clock-free: the app feeds it the voice engine's
 * phase and the recorder's level (dBFS) with a timestamp in seconds, and performs the effects through the existing
 * [ConversationTurnEngine] (`BeginTurn` is a press, `EndTurn` a release, `CancelTurn` an interruption). Nothing here
 * touches audio.
 *
 * Safety and privacy rules it enforces (each pauses hands-free; one tap resumes):
 * - a failure, a refused microphone, a phone call, or lost earbuds;
 * - a turn in which nobody speaks for `noSpeechTimeout` (cancelled, nothing sent);
 * - a turn still going after `maxTurn` (cancelled, nothing sent: continuous sound for that long is a TV or a crowd far
 *   more often than a learner);
 * - a turn whose transcript came back empty (background noise, not speech);
 * - `maxTurnsWithoutTouch` turns in a row without the learner touching the screen.
 * So a noisy room cannot keep sending bystanders' audio indefinitely.
 */
class HandsFreeLoop(val tuning: Tuning = Tuning.HECTOR) {
    data class Tuning(
        /** How far above the measured background level counts as speech. */
        val speechAboveFloor: Double = 14.0,
        /** The background is measured over the first moment of each turn (the quietest sample wins). */
        val calibration: Double = 0.3,
        /**
         * The background is never taken as louder than this (dBFS), so speech that starts at once cannot raise the
         * threshold above normal speaking levels.
         */
        val maximumBackground: Double = -35.0,
        /** Speech must be at least this loud whatever the background (dBFS). */
        val minimumSpeechLevel: Double = -42.0,
        /** Loud for this long before it counts as speech (filters taps and clicks). */
        val speechOnset: Double = 0.2,
        /** Quiet for this long after speech ends the turn. */
        val endOfTurnSilence: Double = 1.2,
        /** Nothing said for this long: cancel the turn and pause hands-free. */
        val noSpeechTimeout: Double = 8.0,
        /** A turn still going after this is cancelled and hands-free pauses. */
        val maxTurn: Double = 30.0,
        /** Readings below this are the recorder warming up (it reports -160 before any audio), not the room. */
        val ignoreBelow: Double = -100.0,
        /** Turns in a row without a touch before hands-free pauses. */
        val maxTurnsWithoutTouch: Int = 20,
    ) {
        companion object {
            /** Hector: a free-form tutor with no stars, so a short pause ends the turn (1.2 s of quiet). */
            val HECTOR = Tuning()

            /**
             * Practice: a half sentence that gets sent is judged short or wrong and costs stars, and learners pause to
             * find a word, so the turn ends only after 2.5 s of quiet. The no-speech, long-turn and
             * turns-without-touch limits are the same as Hector's.
             */
            val PRACTICE = Tuning(endOfTurnSilence = 2.5)
        }
    }

    sealed interface Event {
        data object Enable : Event
        data object Disable : Event

        /** The learner tapped pause or resume. */
        data object TogglePause : Event

        /** The voice engine moved to a new phase. */
        data class Phase(val phase: VoicePhase) : Event

        /** One recorder level sample while recording, with its time in seconds. */
        data class Level(val dBFS: Double, val at: Double) : Event

        /**
         * A wall-clock beat while recording (seconds on the same clock as the levels), sent whether or not a level was
         * readable. A muted mic or a failing level read gives no usable level, so the no-speech and max-turn limits
         * must still fire from the clock alone (Android only; iOS reads a level every beat).
         */
        data class Tick(val at: Double) : Event

        /** The finished turn's transcript was empty: it was noise, not speech. */
        data object TurnHadNoWords : Event

        /** A phone call, another app, or the earbuds being removed took the audio. */
        data object AudioInterrupted : Event
    }

    enum class Effect { BEGIN_TURN, END_TURN, CANCEL_TURN }

    sealed interface Status {
        data object Off : Status

        /** Waiting for the partner, or for the voice engine to be ready. */
        data object Waiting : Status
        data object Listening : Status

        /** Speech detected in this turn. */
        data object Hearing : Status

        /** Paused by the learner, after a failure, or after nobody spoke. */
        data class Paused(val reason: PauseReason) : Status
    }

    enum class PauseReason { BY_LEARNER, NO_SPEECH, FAILURE, LONG_TURN, NO_WORDS, TURN_LIMIT, INTERRUPTED }

    var status: Status = Status.Off
        private set
    private var phase = VoicePhase.IDLE
    private var turnStartedAt: Double? = null
    private var backgroundLevel: Double? = null
    private var loudSince: Double? = null
    private var lastLoudAt: Double? = null
    private var heardSpeech = false
    /** True once a real (above ignoreBelow) reading has arrived this turn; before that, sub-floor readings are warm-up. */
    private var warmedUp = false
    private var turnEnding = false
    private var wallStartedAt: Double? = null
    private var turnsWithoutTouch = 0

    val isOn: Boolean get() = status != Status.Off

    private val isRecording: Boolean get() = phase == VoicePhase.RECORDING

    fun handle(event: Event): List<Effect> = when (event) {
        Event.Enable -> {
            if (status != Status.Off) emptyList()
            else {
                status = Status.Waiting
                turnsWithoutTouch = 0
                startIfReady()
            }
        }

        Event.Disable -> {
            val wasRecording = isRecording
            status = Status.Off
            resetTurn()
            if (wasRecording) listOf(Effect.CANCEL_TURN) else emptyList()
        }

        Event.TogglePause -> when (status) {
            Status.Off -> emptyList()
            is Status.Paused -> {
                status = Status.Waiting
                turnsWithoutTouch = 0
                startIfReady()
            }
            Status.Waiting, Status.Listening, Status.Hearing -> {
                val wasRecording = isRecording
                status = Status.Paused(PauseReason.BY_LEARNER)
                resetTurn()
                if (wasRecording) listOf(Effect.CANCEL_TURN) else emptyList()
            }
        }

        Event.TurnHadNoWords -> {
            if (isOn && status !is Status.Paused) status = Status.Paused(PauseReason.NO_WORDS)
            emptyList()
        }

        Event.AudioInterrupted -> {
            if (isOn && status !is Status.Paused) {
                // The voice engine cancels the recording or reply itself; this only stops the next turn.
                status = Status.Paused(PauseReason.INTERRUPTED)
                resetTurn()
            }
            emptyList()
        }

        is Event.Phase -> onPhase(event.phase)
        is Event.Level -> onLevel(event.dBFS, event.at)
        is Event.Tick -> onTick(event.at)
    }

    private fun onTick(at: Double): List<Effect> {
        if (!isRecording || !(status == Status.Listening || status == Status.Hearing) || turnEnding) return emptyList()
        val started = turnStartedAt ?: wallStartedAt ?: at.also { wallStartedAt = it }
        if (at - started >= tuning.maxTurn) {
            turnEnding = true
            status = Status.Paused(if (heardSpeech) PauseReason.LONG_TURN else PauseReason.NO_SPEECH)
            return listOf(Effect.CANCEL_TURN)
        }
        if (!heardSpeech && at - started >= tuning.noSpeechTimeout) {
            turnEnding = true
            status = Status.Paused(PauseReason.NO_SPEECH)
            return listOf(Effect.CANCEL_TURN)
        }
        return emptyList()
    }

    private fun onPhase(next: VoicePhase): List<Effect> {
        // Always recorded, even while off, so turning hands-free on mid-reply waits for the reply to end.
        val previous = phase
        phase = next
        if (!isOn) return emptyList()
        return when (next) {
            VoicePhase.RECORDING -> {
                if (status is Status.Paused) return listOf(Effect.CANCEL_TURN)
                resetTurn()
                status = Status.Listening
                emptyList()
            }
            VoicePhase.FAILED -> {
                resetTurn()
                status = Status.Paused(PauseReason.FAILURE)
                emptyList()
            }
            VoicePhase.IDLE -> {
                resetTurn()
                if (status is Status.Paused) return emptyList()
                // Permission refused or the recorder never started: asking again would loop forever.
                if (previous == VoicePhase.REQUESTING_PERMISSION) {
                    status = Status.Paused(PauseReason.FAILURE)
                    return emptyList()
                }
                // A turn just finished (reply played, or no reply audio): listen again.
                if (previous != VoicePhase.IDLE) status = Status.Waiting
                startIfReady()
            }
            VoicePhase.REQUESTING_PERMISSION, VoicePhase.TRANSCRIBING, VoicePhase.THINKING, VoicePhase.SPEAKING -> {
                if (status is Status.Paused) return emptyList()
                status = Status.Waiting
                emptyList()
            }
        }
    }

    private fun onLevel(dBFS: Double, at: Double): List<Effect> {
        if (!isRecording || !(status == Status.Listening || status == Status.Hearing) || turnEnding) return emptyList()
        // Sub-floor readings are warm-up only until the first real reading; after that they are digital silence
        // (noise-gated headset, muted route): quiet, and the time checks must still run.
        val silent = dBFS < tuning.ignoreBelow
        if (silent && !warmedUp) return emptyList()
        warmedUp = true
        if (turnStartedAt == null) turnStartedAt = at
        val started = turnStartedAt ?: at

        // The background is the quietest level heard: during calibration, and afterwards only while nobody has
        // spoken. It can fall but never rise, and is capped, so the learner's own voice never becomes the floor.
        if (!silent && (at - started < tuning.calibration || !heardSpeech)) {
            backgroundLevel = minOf(backgroundLevel ?: dBFS, dBFS, tuning.maximumBackground)
        }
        val threshold = maxOf(tuning.minimumSpeechLevel, (backgroundLevel ?: tuning.maximumBackground) + tuning.speechAboveFloor)
        if (at - started < tuning.calibration) {
            // Still measuring the room: nothing counts as speech yet.
            loudSince = null
        } else if (!silent && dBFS >= threshold) {
            if (loudSince == null) loudSince = at
            lastLoudAt = at
            val since = loudSince
            if (since != null && at - since >= tuning.speechOnset) {
                heardSpeech = true
                status = Status.Hearing
            }
        } else {
            loudSince = null
        }

        if (at - started >= tuning.maxTurn) {
            turnEnding = true
            status = Status.Paused(if (heardSpeech) PauseReason.LONG_TURN else PauseReason.NO_SPEECH)
            return listOf(Effect.CANCEL_TURN)
        }
        val last = lastLoudAt
        if (heardSpeech && last != null && at - last >= tuning.endOfTurnSilence) {
            turnEnding = true
            return listOf(Effect.END_TURN)
        }
        if (!heardSpeech && at - started >= tuning.noSpeechTimeout) {
            turnEnding = true
            status = Status.Paused(PauseReason.NO_SPEECH)
            return listOf(Effect.CANCEL_TURN)
        }
        return emptyList()
    }

    private fun startIfReady(): List<Effect> {
        if (status != Status.Waiting) return emptyList()
        // The voice engine accepts a new press from idle or after a failure.
        if (phase != VoicePhase.IDLE && phase != VoicePhase.FAILED) return emptyList()
        turnsWithoutTouch += 1
        if (turnsWithoutTouch > tuning.maxTurnsWithoutTouch) {
            status = Status.Paused(PauseReason.TURN_LIMIT)
            return emptyList()
        }
        return listOf(Effect.BEGIN_TURN)
    }

    private fun resetTurn() {
        turnStartedAt = null
        backgroundLevel = null
        loudSince = null
        lastLoudAt = null
        heardSpeech = false
        warmedUp = false
        turnEnding = false
        wallStartedAt = null
    }
}

/** Learner-facing copy for hands-free mode: the same words as iOS's `HandsFreeCopy`. */
object HandsFreeCopy {
    const val TOGGLE = "Hands-free"
    const val FIRST_USE_TITLE = "Talk without holding the button"

    /**
     * Remembers that the once-per-device note was shown. v2: the copy gained "Best with earbuds or a quiet room.",
     * so everyone who saw the first version sees the new line once. Hector and Practice share it.
     */
    const val NOTE_SEEN_KEY = "handsFree.safetyNoteSeen.v2"

    /**
     * The iOS note says it also works "with the screen locked"; here it stops when the screen turns off, so the
     * sentence says that instead and the rest is word for word.
     */
    fun firstUseBody(partner: String): String =
        "$partner listens after each reply and answers when you pause, while the screen is on. It pauses after 8 seconds of quiet, after background noise, and after 20 turns, and anything it hears is sent for transcription like a held recording. Don't use it while driving or anywhere you need your full attention. Best with earbuds or a quiet room."

    const val FIRST_USE_CONFIRM = "Turn on hands-free"
    const val CANCEL = "Cancel"
    const val LISTENING = "Listening. Just talk."
    const val HEARING = "Hearing you..."
    fun waiting(partner: String) = "$partner is replying..."
    const val PAUSED_BY_LEARNER = "Hands-free is paused."
    const val PAUSED_NO_SPEECH = "Paused because nobody spoke. Tap Resume to keep talking."
    const val PAUSED_FAILURE = "Paused after a problem. Tap Resume to try again."
    const val PAUSED_LONG_TURN = "Paused after a very long turn. Tap Resume to keep talking."
    const val PAUSED_NO_WORDS = "Paused because it only heard background noise. Tap Resume to keep talking."
    const val PAUSED_TURN_LIMIT = "Paused after 20 turns. Tap Resume to keep talking."
    const val PAUSED_INTERRUPTED = "Paused because the audio was interrupted. Tap Resume to keep talking."
    const val PAUSE = "Pause"
    const val RESUME = "Resume"

    fun statusLine(status: HandsFreeLoop.Status, partner: String = "Hector"): String? = when (status) {
        HandsFreeLoop.Status.Off -> null
        HandsFreeLoop.Status.Waiting -> waiting(partner)
        HandsFreeLoop.Status.Listening -> LISTENING
        HandsFreeLoop.Status.Hearing -> HEARING
        is HandsFreeLoop.Status.Paused -> when (status.reason) {
            HandsFreeLoop.PauseReason.BY_LEARNER -> PAUSED_BY_LEARNER
            HandsFreeLoop.PauseReason.NO_SPEECH -> PAUSED_NO_SPEECH
            HandsFreeLoop.PauseReason.FAILURE -> PAUSED_FAILURE
            HandsFreeLoop.PauseReason.LONG_TURN -> PAUSED_LONG_TURN
            HandsFreeLoop.PauseReason.NO_WORDS -> PAUSED_NO_WORDS
            HandsFreeLoop.PauseReason.TURN_LIMIT -> PAUSED_TURN_LIMIT
            HandsFreeLoop.PauseReason.INTERRUPTED -> PAUSED_INTERRUPTED
        }
    }
}
