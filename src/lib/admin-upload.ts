/**
 * Content-based checks for admin audio upload.
 *
 * The extension is never consulted. The podcast-audio bucket is
 * public-read and served from a URL under our own domain, so an HTML
 * file accepted as "episode.mp3" is a stored-XSS-shaped problem wearing
 * an audio filename.
 */

/** 60 MB. About two hours at 64 kbps mono, far above any real episode. */
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

/**
 * Identifies audio from its leading bytes, or null when it is not audio
 * this system accepts.
 *
 * Recognises ID3-tagged MP3, a bare MPEG frame sync, and the MP4/M4A
 * `ftyp` box. Anything else -- including a perfectly valid file of some
 * other kind -- is refused. An allowlist of known-good signatures is the
 * only version of this check that stays correct as new formats appear;
 * a denylist of bad ones is wrong the moment someone invents a new one.
 */
export function sniffAudioType(head: Uint8Array): "mp3" | "mp4" | null {
  if (head.byteLength < 8) return null;
  // "ID3"
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return "mp3";
  // MPEG audio frame sync: eleven set bits.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  // "ftyp" at offset 4.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "mp4";
  return null;
}

/** A human-readable problem, or null when the upload is acceptable. */
export function validateUpload(head: Uint8Array, totalBytes: number): string | null {
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return `That file is too large (${Math.round(totalBytes / 1024 / 1024)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  }
  if (sniffAudioType(head) === null) {
    return "That is not an audio file. Upload an MP3 or M4A.";
  }
  return null;
}
