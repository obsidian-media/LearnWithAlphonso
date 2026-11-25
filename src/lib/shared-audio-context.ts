/**
 * One AudioContext for every microphone-level reader (the hands-free sampler and the "You" level bars), instead of a
 * context each. On iOS an AudioContext that stays running keeps the audio session in play-and-record, which can route
 * a reply to the earpiece or play it quietly; so the context is suspended before a reply plays (`suspendAudioContext`)
 * and resumed by the next reader (`acquireAudioContext`, which must first run inside the learner's tap or press).
 */
function contextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

let shared: AudioContext | null = null;

/** The shared context, created if needed and resumed. Null where the browser has none. */
export function acquireAudioContext(): AudioContext | null {
  const Ctx = contextClass();
  if (!Ctx) return null;
  try {
    if (!shared || shared.state === "closed") shared = new Ctx();
    void shared.resume?.()?.catch?.(() => {});
    return shared;
  } catch {
    shared = null;
    return null;
  }
}

/** Frees the audio session for playback. The next acquire resumes it. */
export function suspendAudioContext(): void {
  const ctx = shared;
  if (!ctx || ctx.state !== "running") return;
  try {
    void ctx.suspend?.()?.catch?.(() => {});
  } catch {
    /* nothing to free */
  }
}

/** Closes the shared context (hands-free stopped, the call was left). */
export function closeAudioContext(): void {
  const ctx = shared;
  shared = null;
  try {
    void ctx?.close?.()?.catch?.(() => {});
  } catch {
    /* already closed */
  }
}
