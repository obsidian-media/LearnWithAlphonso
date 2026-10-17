package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * AI consent strings, the same text as the iOS Kit's AIConsentCopy.swift and src/lib/ai-consent-copy.ts
 * (src/lib/ai-consent-copy-parity.test.ts checks every line below against the web copy).
 */
object AiConsentCopy {
    const val sheetTitle = "How Alphonso uses AI"
    const val sheetBody = "To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to NVIDIA (AI replies and grading). Nothing is sent until you allow it, and you can turn this off at any time in Settings."
    const val allow = "Allow"
    const val notNow = "Not now"
    const val privacyLink = "Read our Privacy Policy"
    const val saveFailed = "Couldn't save your choice. Check your connection and try again."
    const val gateTitle = "AI practice is off"
    const val gateBody = "This feature sends your voice or answers to our speech and AI providers. Allow it to continue."
    const val gateAction = "Review and allow"
    const val checkFailedTitle = "Couldn't check your AI setting"
    const val checkFailedBody = "Check your connection and try again."
    const val retry = "Try again"
    const val settingsTitle = "AI features"
    const val settingsFooter = "When this is on, Alphonso sends your voice to Deepgram and your conversation text and written answers to NVIDIA so the tutor can reply, transcribe and grade. When it's off, nothing is sent, and lessons, review and placement keep working."
    const val speakFallbackNoConsent = "Speaking answers use AI, which is turned off. Type the phrase instead."
    const val useVoiceInstead = "Use your voice instead"
    const val turnOnAiGrading = "Turn on AI grading"
    const val localGradingNote = "Checked against our answer list only."
    const val reportAction = "Report this response"
    const val reportThanks = "Thanks. We'll review this response."
    const val reportFailed = "Couldn't send your report. Check your connection and try again."
    const val reportReviewNote = "We review reports within 24 hours."

    /** Shown in place of the check-failed pair when the device has no connection (iOS and Android only; the web has no offline mode). */
    const val offlineTitle = "You're offline"
    const val offlineBody = "This needs a connection. Reconnect and try again."

    /** The typing fallback says why voice is off, never "offline" when the reason is consent. */
    fun speakFallback(micUnavailable: Boolean, isConnected: Boolean, hasAiConsent: Boolean): String = when {
        micUnavailable -> "The microphone isn't available. Type the phrase instead."
        !isConnected -> "You're offline, so speech can't be checked. Type the phrase instead."
        !hasAiConsent -> speakFallbackNoConsent
        else -> "Type the phrase instead."
    }
}

/**
 * What the learner's AI setting is, as far as this device can tell. A failed read is [UNAVAILABLE] and offers a retry;
 * it is NEVER [DENIED], because a database blip must not tell someone who consented that AI is off.
 */
enum class AiConsentStatus { LOADING, GRANTED, DENIED, UNAVAILABLE }

enum class AiConsentSurface { PLACEMENT, LESSON, REVIEW, SAVE_WORD, HECTOR, CONVERSATION, CAMPAIGN }

enum class AiItemMode {
    /** Graded or answered on device only, nothing offered. */
    LOCAL,

    /** AI is used (the learner allowed it). */
    AI,

    /** Local now, with an inline way to turn AI on. */
    LOCAL_WITH_OPT_IN,
}

/**
 * Which screens may be walled by consent, and how each item behaves without it. Placement never uses AI. Lesson and
 * review work fully without consent, item by item. Port of AIConsentPolicy.swift.
 */
object AiConsentPolicy {
    fun blocksWholeScreen(surface: AiConsentSurface): Boolean = when (surface) {
        AiConsentSurface.HECTOR, AiConsentSurface.CONVERSATION, AiConsentSurface.CAMPAIGN -> true
        AiConsentSurface.PLACEMENT, AiConsentSurface.LESSON, AiConsentSurface.REVIEW, AiConsentSurface.SAVE_WORD -> false
    }

    fun translateMode(surface: AiConsentSurface, consentGranted: Boolean): AiItemMode = when (surface) {
        AiConsentSurface.PLACEMENT -> AiItemMode.LOCAL
        AiConsentSurface.LESSON, AiConsentSurface.REVIEW -> if (consentGranted) AiItemMode.AI else AiItemMode.LOCAL_WITH_OPT_IN
        AiConsentSurface.SAVE_WORD, AiConsentSurface.HECTOR, AiConsentSurface.CONVERSATION, AiConsentSurface.CAMPAIGN ->
            if (consentGranted) AiItemMode.AI else AiItemMode.LOCAL
    }

    /**
     * Whether a lesson or review translate card offers "Turn on AI grading". Only when the account itself said no: a
     * setting that is loading or could not be read must not look like "AI is off" or offer the sheet.
     */
    fun offersAiGradingOptIn(surface: AiConsentSurface, status: AiConsentStatus): Boolean =
        status == AiConsentStatus.DENIED && translateMode(surface, consentGranted = false) == AiItemMode.LOCAL_WITH_OPT_IN

    fun speakMode(surface: AiConsentSurface, consentGranted: Boolean): AiItemMode = translateMode(surface, consentGranted)
}

/**
 * Whether a written translation may be sent to the server (and on to the AI grader). This is where consent is
 * enforced for lesson translations: the lesson is never walled, the curated-phrasing verdict simply stands.
 */
object TranslationGradingPolicy {
    fun mayAskServer(isConnected: Boolean, hasAccessToken: Boolean, hasAiConsent: Boolean): Boolean =
        isConnected && hasAccessToken && hasAiConsent
}

/** What a whole-screen AI gate shows. */
enum class AiConsentGatePrompt {
    /** The setting is off: offer the consent sheet. */
    CONSENT,

    /** The setting could not be read: offer a retry, never the sheet. */
    RETRY,
}

sealed interface AiConsentGatePresentation {
    /** Not known yet: nothing is mounted and nothing is asked. */
    data object Spinner : AiConsentGatePresentation

    /** The screen is not mounted; only the prompt is shown. */
    data class Prompt(val prompt: AiConsentGatePrompt) : AiConsentGatePresentation

    /** The screen is mounted. [covered] is the prompt laid over it, if any; the screen itself stays in place. */
    data class Content(val covered: AiConsentGatePrompt?) : AiConsentGatePresentation
}

object AiConsentGate {
    /**
     * @param hasBeenShown the screen has been mounted before in this visit. Once it has, it is never unmounted, so a
     * live conversation keeps its transcript when consent is withdrawn elsewhere.
     * @param didRefresh this gate's own read of the account has finished. A remembered "denied" from before it is not
     * trusted for a first decision, so a learner who consented elsewhere is never asked again.
     */
    fun presentation(status: AiConsentStatus, hasBeenShown: Boolean, didRefresh: Boolean): AiConsentGatePresentation {
        if (hasBeenShown) {
            return when (status) {
                AiConsentStatus.GRANTED, AiConsentStatus.LOADING -> AiConsentGatePresentation.Content(null)
                AiConsentStatus.DENIED -> AiConsentGatePresentation.Content(AiConsentGatePrompt.CONSENT)
                AiConsentStatus.UNAVAILABLE -> AiConsentGatePresentation.Content(AiConsentGatePrompt.RETRY)
            }
        }
        return when (status) {
            AiConsentStatus.GRANTED -> AiConsentGatePresentation.Content(null)
            AiConsentStatus.LOADING -> AiConsentGatePresentation.Spinner
            AiConsentStatus.UNAVAILABLE -> AiConsentGatePresentation.Prompt(AiConsentGatePrompt.RETRY)
            AiConsentStatus.DENIED -> if (didRefresh) AiConsentGatePresentation.Prompt(AiConsentGatePrompt.CONSENT) else AiConsentGatePresentation.Spinner
        }
    }
}
