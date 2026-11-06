import { describe, expect, it } from "vitest";
import { headerDurationSeconds } from "./audio-duration";

/** A minimal PCM WAV header (44 bytes) followed by `dataBytes` of silence. */
function wav(seconds: number, sampleRate = 16_000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const dataBytes = Math.round(seconds * byteRate);
  const buf = new ArrayBuffer(44 + Math.min(dataBytes, 64));
  const v = new DataView(buf);
  const ascii = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, (channels * bitsPerSample) / 8, true);
  v.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(buf);
}

function box(type: string, body: Uint8Array) {
  const out = new Uint8Array(8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, out.length);
  [...type].forEach((c, i) => v.setUint8(4 + i, c.charCodeAt(0)));
  out.set(body, 8);
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** ftyp + moov(mvhd) + mdat, the shape of an iOS/Android .m4a recording. */
function mp4(seconds: number, timescale = 44_100, version: 0 | 1 = 0, mvhdFirst = true) {
  const mvhdBody = new Uint8Array(version === 0 ? 100 : 112);
  const v = new DataView(mvhdBody.buffer);
  v.setUint8(0, version);
  if (version === 0) {
    v.setUint32(12, timescale);
    v.setUint32(16, Math.round(seconds * timescale));
  } else {
    v.setUint32(20, timescale);
    v.setBigUint64(24, BigInt(Math.round(seconds * timescale)));
  }
  const mvhd = box("mvhd", mvhdBody);
  const trak = box("trak", new Uint8Array(16));
  const moov = box("moov", mvhdFirst ? concat(mvhd, trak) : concat(trak, mvhd));
  const ftyp = box("ftyp", new TextEncoder().encode("M4A isomM4A mp42"));
  return concat(ftyp, moov, box("mdat", new Uint8Array(32)));
}

describe("headerDurationSeconds", () => {
  it("reads a PCM WAV's length from its data size and byte rate", () => {
    expect(headerDurationSeconds(wav(12.5))).toBeCloseTo(12.5, 3);
    expect(headerDurationSeconds(wav(600, 8_000))).toBeCloseTo(600, 3);
  });

  it("reads an MP4/M4A's length from mvhd, version 0 and 1, wherever mvhd sits in moov", () => {
    expect(headerDurationSeconds(mp4(7.25))).toBeCloseTo(7.25, 3);
    expect(headerDurationSeconds(mp4(1320, 1000, 1))).toBeCloseTo(1320, 3);
    expect(headerDurationSeconds(mp4(95, 48_000, 0, false))).toBeCloseTo(95, 3);
  });

  it("returns null when the header does not say (streamed WAV, fragmented MP4, WebM, junk)", () => {
    const streamed = wav(10);
    new DataView(streamed.buffer).setUint32(40, 0xffffffff, true);
    expect(headerDurationSeconds(streamed)).toBeNull();
    expect(headerDurationSeconds(mp4(0))).toBeNull();
    expect(headerDurationSeconds(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]))).toBeNull();
    expect(headerDurationSeconds(new Uint8Array(600))).toBeNull();
    expect(headerDurationSeconds(new TextEncoder().encode("x".repeat(600)))).toBeNull();
  });

  it("never reads past the buffer on a truncated or lying header", () => {
    const short = mp4(5).slice(0, 40);
    expect(headerDurationSeconds(short)).toBeNull();
    const lying = mp4(5);
    new DataView(lying.buffer).setUint32(0, 0x7fffffff);
    expect(() => headerDurationSeconds(lying)).not.toThrow();
    const zeroRate = wav(5);
    new DataView(zeroRate.buffer).setUint32(28, 0, true);
    expect(headerDurationSeconds(zeroRate)).toBeNull();
  });
});
