/**
 * V3 package 4a: on-device text-to-speech for "listening comprehension"
 * format questions (an mc question with `audioText` set -- see
 * curriculum.ts's doc comment). Deliberately the Web Speech API, not a
 * new vendor call: this repo already avoids new per-request TTS costs
 * where a free platform capability covers the need (same reasoning as
 * 3a's pronunciation-clarity heuristic reusing Deepgram's existing
 * confidence score instead of a new phoneme-scoring vendor). Isolated
 * into its own module, rather than called inline from the UI, so tests
 * can mock this module instead of shimming SpeechSynthesisUtterance,
 * which jsdom doesn't implement.
 */
/**
 * Whether this browser can speak at all.
 *
 * Callers need this because `speak` failing is invisible: it returns silently,
 * leaving an inert play button. That was survivable while one question used
 * audio as a garnish, but a `listening` question is unanswerable without it --
 * the learner would be guessing one-in-four and losing a heart for it. UI that
 * depends on audio must offer a readable fallback when this is false.
 */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: string, rate = 1): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  // Cancel any still-playing utterance first -- otherwise tapping "play"
  // again while the first is still speaking queues rather than replaces.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * Whether the device has a voice for `lang` ("fr-FR"): the same primary language is enough. The browser may not have
 * loaded its voices yet (an empty list, then a `voiceschanged` event); that reads as "maybe", so a button is not
 * hidden before the answer is known. False only when speech is missing or the loaded voices have none for the language.
 */
export function hasVoiceFor(lang: string): boolean {
  if (!canSpeak()) return false;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return true;
  const primary = lang.toLowerCase().split("-")[0];
  return voices.some((v) => v.lang.toLowerCase().split(/[-_]/)[0] === primary);
}

/** Stops any device speech now (the correction card's fix, or any other line). */
export function cancelSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/**
 * Speaks `text` with the device voice and reports how it went, so a caller can tell a line that was heard from one the
 * browser refused (iOS Safari refuses speech that does not start from a tap). Returns false where the device cannot
 * speak at all.
 */
export function speakWithCallbacks(
  text: string,
  lang: string,
  cb: { onStart?: () => void; onEnd: () => void; onError: (reason?: string) => void },
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onstart = () => cb.onStart?.();
    utterance.onend = () => cb.onEnd();
    utterance.onerror = (e) => {
      // A line cut off by cancelSpeech() is a skip, not a failure.
      const reason = (e as { error?: string }).error;
      if (reason === "canceled" || reason === "interrupted") return;
      cb.onError(reason);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
