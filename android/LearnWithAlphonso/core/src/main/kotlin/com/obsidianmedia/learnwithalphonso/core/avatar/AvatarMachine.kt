package com.obsidianmedia.learnwithalphonso.core.avatar

enum class Reaction { HAPPY, ENCOURAGING }

/** What the reply said about the learner's last turn. Anything unknown reads as [NONE]. */
enum class ReplyVerdict(val wire: String) {
    CORRECT("correct"), CORRECTED("corrected"), NONE("none");

    companion object {
        fun fromWire(wire: String?): ReplyVerdict = when (wire) {
            "correct" -> CORRECT
            "corrected" -> CORRECTED
            else -> NONE
        }
    }
}

/** The avatar's mode. [label] is what the fixtures and the state pill use. */
enum class AvatarMode(val label: String, val callLabel: String) {
    IDLE("idle", "Listening"),
    LISTENING("listening", "Listening to you"),
    THINKING("thinking", "Thinking"),
    SPEAKING("speaking", "Speaking"),
    REACTING_HAPPY("reacting:happy", "Nice!"),
    REACTING_ENCOURAGING("reacting:encouraging", "Let's fix that"),
}

/** The voice session's phase, as on iOS (VoicePhase). [generation] tells two turns apart. */
enum class PhaseKind { IDLE, REQUESTING_PERMISSION, RECORDING, TRANSCRIBING, THINKING, SPEAKING, FAILED }
data class VoicePhase(val kind: PhaseKind, val generation: Int = 0)

/** What the avatar's face shows right now. Body motion (breathing, sway, ears, glint) is separate. */
data class AvatarPose(val mouth: Viseme, val brows: Brows)

/** Where the reply's audio is, and the plan for its words. */
data class SpeechPosition(val plan: LipSyncPlan, val time: Double)

/**
 * The avatar's state machine. It follows the voice session's phase (so interruptions come for free) and turns it plus
 * a few inputs into a face. The learner talking never moves his mouth.
 */
class AvatarMachine {
    var mode: AvatarMode = AvatarMode.IDLE
        private set
    private var lastPhase: VoicePhase? = null
    private var browsRaisedUntil = Double.NEGATIVE_INFINITY
    private var reactionUntil = Double.NEGATIVE_INFINITY
    /** The reaction waiting for the reply to finish: played when the session goes quiet after it, dropped otherwise. */
    private var pendingReaction: Reaction? = null

    /** Call every frame with the session's current phase; only a change does anything. */
    fun update(phase: VoicePhase, now: Double) {
        if (phase == lastPhase) return
        lastPhase = phase
        val next = when (phase.kind) {
            PhaseKind.IDLE, PhaseKind.FAILED -> AvatarMode.IDLE
            PhaseKind.REQUESTING_PERMISSION, PhaseKind.RECORDING -> AvatarMode.LISTENING
            PhaseKind.TRANSCRIBING, PhaseKind.THINKING -> AvatarMode.THINKING
            PhaseKind.SPEAKING -> AvatarMode.SPEAKING
        }
        mode = next
        if (next != AvatarMode.LISTENING) browsRaisedUntil = Double.NEGATIVE_INFINITY
        // The reaction comes after the reply has been spoken (or shown, when it has no audio): the session is quiet
        // again and the reply was a real answer. Any other move (a new press, a failure) drops it.
        val reaction = pendingReaction
        if (phase.kind == PhaseKind.IDLE && reaction != null) {
            pendingReaction = null
            react(reaction, now)
        } else if (!replyIsInFlight(phase.kind)) {
            pendingReaction = null
        }
    }

    private fun replyIsInFlight(kind: PhaseKind) = kind == PhaseKind.TRANSCRIBING || kind == PhaseKind.THINKING || kind == PhaseKind.SPEAKING

    /** A moment of the learner's voice while they hold the button. */
    fun heard(levelDBFS: Double, now: Double) {
        if (mode != AvatarMode.LISTENING || !(levelDBFS > LOUD_THRESHOLD_DBFS)) return
        browsRaisedUntil = now + LOUD_BROW_HOLD
    }

    /** The reply's verdict. Call once, when the reply arrives: right gets a happy face, corrected an encouraging one. */
    fun replyArrived(verdict: ReplyVerdict) {
        pendingReaction = when (verdict) {
            ReplyVerdict.CORRECT -> Reaction.HAPPY
            ReplyVerdict.CORRECTED -> Reaction.ENCOURAGING
            ReplyVerdict.NONE -> null
        }
    }

    /** A short reaction to the learner's answer. */
    fun react(reaction: Reaction, now: Double) {
        mode = if (reaction == Reaction.HAPPY) AvatarMode.REACTING_HAPPY else AvatarMode.REACTING_ENCOURAGING
        reactionUntil = now + REACTION_DURATION
    }

    fun pose(now: Double, speech: SpeechPosition?): AvatarPose = when (mode) {
        AvatarMode.IDLE -> AvatarPose(Viseme.CLOSED, Brows.NEUTRAL)
        AvatarMode.LISTENING -> AvatarPose(Viseme.CLOSED, if (now < browsRaisedUntil) Brows.RAISED else Brows.NEUTRAL)
        AvatarMode.THINKING -> AvatarPose(Viseme.CLOSED, Brows.LOWERED)
        AvatarMode.SPEAKING ->
            if (speech == null) AvatarPose(Viseme.CLOSED, Brows.NEUTRAL)
            else AvatarPose(speech.plan.visemeAt(speech.time), speech.plan.browsAt(speech.time))
        AvatarMode.REACTING_HAPPY ->
            if (now < reactionUntil) AvatarPose(Viseme.EE, Brows.RAISED) else AvatarPose(Viseme.CLOSED, Brows.NEUTRAL)
        AvatarMode.REACTING_ENCOURAGING ->
            if (now < reactionUntil) AvatarPose(Viseme.TALK, Brows.NEUTRAL) else AvatarPose(Viseme.CLOSED, Brows.NEUTRAL)
    }

    companion object {
        /** Brows stay up this long after a loud moment. */
        const val LOUD_BROW_HOLD = 0.5
        /** Average input level above which the learner counts as loud, in dBFS. */
        const val LOUD_THRESHOLD_DBFS = -20.0
        /** A reaction (happy or encouraging) lasts about this long. */
        const val REACTION_DURATION = 1.2
    }
}
