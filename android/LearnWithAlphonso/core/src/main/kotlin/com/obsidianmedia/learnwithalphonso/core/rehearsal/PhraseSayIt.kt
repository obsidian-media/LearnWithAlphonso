package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.logic.PhraseCheck
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.AiErrorCopy
import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import kotlinx.coroutines.CancellationException

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

    const val TAP_AGAIN = "Tap Say it again"
    const val OFFLINE = "You're offline. You can still hear each phrase."

    /**
     * The check's upload, with its failures turned into the app's existing user copy (the turn engine shows only the
     * exception's message). A consent refusal and a cancellation pass through untouched: the engine and the screen act on those.
     */
    suspend fun transcribe(call: suspend () -> SttResult): SttResult = try {
        call()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if ((e as? AiConversationError.Server)?.code == "ai-consent-required") throw e
        throw IllegalStateException(AiErrorCopy.userMessage(e), e)
    }

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
