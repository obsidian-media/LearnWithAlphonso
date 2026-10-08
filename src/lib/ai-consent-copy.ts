/** Every AI consent and AI report string. The Kit's AIConsentCopy.swift holds the same text (ai-consent-copy-parity.test.ts). */
export const AI_CONSENT_COPY = {
  sheetTitle: "How Alphonso uses AI",
  sheetBody:
    "To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to NVIDIA (AI replies and grading). Nothing is sent until you allow it, and you can turn this off at any time in Settings.",
  allow: "Allow",
  notNow: "Not now",
  privacyLink: "Read our Privacy Policy",
  saveFailed: "Couldn't save your choice. Check your connection and try again.",
  gateTitle: "AI practice is off",
  gateBody:
    "This feature sends your voice or answers to our speech and AI providers. Allow it to continue.",
  gateAction: "Review and allow",
  settingsTitle: "AI features",
  settingsFooter:
    "When this is on, Alphonso sends your voice to Deepgram and your conversation text and written answers to NVIDIA so the tutor can reply, transcribe and grade. When it's off, nothing is sent, and lessons, review and placement keep working.",
  speakFallbackNoConsent: "Speaking answers use AI, which is turned off. Type the phrase instead.",
  useVoiceInstead: "Use your voice instead",
  turnOnAiGrading: "Turn on AI grading",
  localGradingNote: "Checked against our answer list only.",
  reportAction: "Report this response",
  reportThanks: "Thanks. We'll review this response.",
  reportFailed: "Couldn't send your report. Check your connection and try again.",
  reportReviewNote: "We review reports within 24 hours.",
} as const;

/** content_reports.context is capped at 8192 BYTES; accented text is 2 to 3 bytes a character. */
export const AI_REPORT_MESSAGE_MAX = 2500;

export const AI_REPORT_REASONS = [
  { value: "ai_inappropriate", label: "Inappropriate or offensive" },
  { value: "ai_harmful", label: "Harmful or unsafe" },
  { value: "ai_incorrect", label: "Wrong or misleading" },
  { value: "ai_other", label: "Something else" },
] as const;
export type AiReportReason = (typeof AI_REPORT_REASONS)[number]["value"];
