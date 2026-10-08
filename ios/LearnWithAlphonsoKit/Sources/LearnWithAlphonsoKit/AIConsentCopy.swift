/// AI consent and report strings. src/lib/ai-consent-copy.ts holds the same text
/// (src/lib/ai-consent-copy-parity.test.ts).
public enum AIConsentCopy {
    public static let sheetTitle = "How Alphonso uses AI"
    public static let sheetBody = "To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to NVIDIA (AI replies and grading). Nothing is sent until you allow it, and you can turn this off at any time in Settings."
    public static let allow = "Allow"
    public static let notNow = "Not now"
    public static let privacyLink = "Read our Privacy Policy"
    public static let saveFailed = "Couldn't save your choice. Check your connection and try again."
    public static let gateTitle = "AI practice is off"
    public static let gateBody = "This feature sends your voice or answers to our speech and AI providers. Allow it to continue."
    public static let gateAction = "Review and allow"
    public static let checkFailedTitle = "Couldn't check your AI setting"
    public static let checkFailedBody = "Check your connection and try again."
    public static let retry = "Try again"
    public static let settingsTitle = "AI features"
    public static let settingsFooter = "When this is on, Alphonso sends your voice to Deepgram and your conversation text and written answers to NVIDIA so the tutor can reply, transcribe and grade. When it's off, nothing is sent, and lessons, review and placement keep working."
    public static let speakFallbackNoConsent = "Speaking answers use AI, which is turned off. Type the phrase instead."
    public static let useVoiceInstead = "Use your voice instead"
    public static let turnOnAiGrading = "Turn on AI grading"
    public static let localGradingNote = "Checked against our answer list only."
    public static let reportAction = "Report this response"
    public static let reportThanks = "Thanks. We'll review this response."
    public static let reportFailed = "Couldn't send your report. Check your connection and try again."
    public static let reportReviewNote = "We review reports within 24 hours."

    /// The typing fallback says why voice is off, never "offline" when the reason is consent.
    public static func speakFallback(micUnavailable: Bool, isConnected: Bool, hasAIConsent: Bool) -> String {
        if micUnavailable { return "The microphone isn't available. Type the phrase instead." }
        if !isConnected { return "You're offline, so speech can't be checked. Type the phrase instead." }
        if !hasAIConsent { return speakFallbackNoConsent }
        return "Type the phrase instead."
    }
}
