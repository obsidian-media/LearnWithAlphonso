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
export function speak(text: string, lang: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  // Cancel any still-playing utterance first -- otherwise tapping "play"
  // again while the first is still speaking queues rather than replaces.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
