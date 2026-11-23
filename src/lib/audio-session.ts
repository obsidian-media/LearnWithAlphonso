/**
 * A tiny shared audio session for the web app: one thing speaks at a time. A call or a story narration (the "voice")
 * and the podcast each register how to stop themselves; starting one stops the other, so a phone never plays a podcast
 * under Hector. No React and no state beyond the registry, so any module can claim the session.
 */
export type AudioOwner = "voice" | "podcast";

const stoppers = new Map<AudioOwner, () => void>();

/** Registers how `owner` stops itself. Returns the unregister function. */
export function registerAudioOwner(owner: AudioOwner, stop: () => void): () => void {
  stoppers.set(owner, stop);
  return () => {
    if (stoppers.get(owner) === stop) stoppers.delete(owner);
  };
}

/** `owner` is about to play: every other owner stops first. */
export function claimAudioSession(owner: AudioOwner): void {
  for (const [other, stop] of [...stoppers]) {
    if (other === owner) continue;
    try {
      stop();
    } catch {
      /* one owner failing to stop must not block the one that is starting */
    }
  }
}
