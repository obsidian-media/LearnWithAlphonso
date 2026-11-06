/**
 * The length an audio file's own header states, in seconds, or null when the header does not say.
 *
 * Read before transcription only to refuse a recording that is plainly too long (the apps' .m4a and any PCM WAV).
 * A header can lie, so this never decides what is charged: the speech provider's reported duration does.
 * WebM (the web recorder) carries no usable duration while recording, so it returns null.
 */
export function headerDurationSeconds(bytes: Uint8Array): number | null {
  try {
    return wavDuration(bytes) ?? mp4Duration(bytes);
  } catch {
    return null;
  }
}

const tag = (b: Uint8Array, o: number) =>
  o + 4 <= b.length ? String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!) : "";

function wavDuration(b: Uint8Array): number | null {
  if (tag(b, 0) !== "RIFF" || tag(b, 8) !== "WAVE") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let byteRate = 0;
  for (let o = 12; o + 8 <= b.length;) {
    const id = tag(b, o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt " && o + 20 <= b.length) byteRate = v.getUint32(o + 16, true);
    if (id === "data") {
      if (!byteRate || size === 0 || size === 0xffffffff) return null;
      return size / byteRate;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}

function mp4Duration(b: Uint8Array): number | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /** Children of [start, end): [type, bodyStart, boxEnd]. Stops at anything malformed. */
  const boxes = function* (start: number, end: number) {
    for (let o = start; o + 8 <= end;) {
      let size = v.getUint32(o);
      let header = 8;
      if (size === 1) {
        if (o + 16 > end) return;
        size = Number(v.getBigUint64(o + 8));
        header = 16;
      } else if (size === 0) {
        size = end - o;
      }
      if (size < header) return;
      const boxEnd = Math.min(o + size, end);
      yield [tag(b, o + 4), o + header, boxEnd] as const;
      o += size;
    }
  };
  for (const [type, body, end] of boxes(0, b.length)) {
    if (type !== "moov") continue;
    for (const [inner, mv, mvEnd] of boxes(body, end)) {
      if (inner !== "mvhd") continue;
      const version = b[mv];
      let timescale: number;
      let duration: number;
      if (version === 1) {
        if (mv + 32 > mvEnd) return null;
        timescale = v.getUint32(mv + 20);
        duration = Number(v.getBigUint64(mv + 24));
      } else {
        if (mv + 20 > mvEnd) return null;
        timescale = v.getUint32(mv + 12);
        duration = v.getUint32(mv + 16);
      }
      if (!timescale || !duration || duration === 0xffffffff) return null;
      return duration / timescale;
    }
    return null;
  }
  return null;
}
