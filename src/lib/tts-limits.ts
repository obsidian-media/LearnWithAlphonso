/**
 * The most text one /api/tts request may speak. A tutor turn is a few sentences, so this is generous for real use and
 * bounds what a single (or scripted) call can cost. Over the cap the request is refused, not shortened: a half-spoken
 * reply would be worse than a clear error, so a reply that is meant to be spoken is kept under it where it is written
 * (see sentence-trim.ts).
 */
export const TTS_MAX_CHARS = 600;
