package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.logic.PhraseCheck

/**
 * The words under a phrase after "Say it" in the phrasebook. They describe how clearly the learner was UNDERSTOOD, never a
 * pronunciation score, and stay neutral in tone (no "wrong", no red). The same three lines on every platform; mirrors
 * src/lib/say-it-copy.ts.
 */
object PhraseSayIt {
    const val CHECKING = "Checking how clearly that came across…"
    const val LISTENING = "Listening…"
    const val FRAMING = "Say a phrase to hear how clearly you were understood."
    const val NOT_YET = "Not understood yet: try again"
    const val MIC_OFF = "Microphone access is off. Turn it on in Settings > Apps > Learn with Alphonso > Permissions. You can still hear each phrase."
    const val CHECK_FAILED = "Couldn't check that just now. You can still hear the phrase."

    /** The mic button's TalkBack name. */
    fun micLabel(phrase: String): String = "Say: $phrase"

    fun resultText(check: PhraseCheck.Outcome): String = when (check.result) {
        PhraseCheck.Result.CLEAR -> "Understood clearly"
        PhraseCheck.Result.MOSTLY -> when (check.listenAgain.size) {
            0 -> "Mostly understood"
            1 -> "Mostly understood: listen to “${check.listenAgain[0]}” again"
            else -> "Mostly understood: listen to “${check.listenAgain[0]}” and “${check.listenAgain[1]}” again"
        }
        PhraseCheck.Result.NOT_YET -> NOT_YET
    }
}
