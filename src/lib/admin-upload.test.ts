import { describe, expect, it } from "vitest";
import { sniffAudioType, MAX_UPLOAD_BYTES, validateUpload } from "./admin-upload";

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

// Review Focus #3. The podcast-audio bucket is public-read and served
// from a URL under our own domain. Trusting the extension is how it ends
// up serving an HTML file to someone who was told it was an episode.
describe("sniffAudioType", () => {
  it("recognises an ID3-tagged MP3", () => {
    expect(sniffAudioType(bytes(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00))).toBe("mp3");
  });

  it("recognises a bare MPEG frame sync", () => {
    // Not every MP3 carries an ID3 tag; a bare frame starts 0xFF 0xFB.
    expect(sniffAudioType(bytes(0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00))).toBe("mp3");
  });

  it("recognises an MP4/M4A ftyp box", () => {
    expect(
      sniffAudioType(bytes(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20)),
    ).toBe("mp4");
  });

  it("rejects HTML regardless of what it is named", () => {
    // The whole point: `<!DOCTYPE html>` saved as episode.mp3.
    expect(sniffAudioType(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50))).toBeNull();
  });

  it("rejects a PNG", () => {
    // A real file of a real type that is still not audio -- the check is
    // an allowlist of known-good signatures, not a denylist of bad ones.
    expect(sniffAudioType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
  });

  it("rejects a truncated ID3 header that would otherwise match", () => {
    // This pins the minimum-length guard, and the obvious version of
    // this test does NOT. `sniffAudioType(bytes(0xff))` returns null
    // with the guard removed too -- head[1] is undefined, `undefined &
    // 0xe0` is 0, and every later branch misses -- so it passes for a
    // reason that has nothing to do with the guard. Mutating
    // `byteLength < 8` to `< 1` left it green.
    //
    // These three bytes ARE the ID3 signature, so without the guard they
    // are reported as a complete MP3. Three bytes is not an episode.
    expect(sniffAudioType(bytes(0x49, 0x44, 0x33))).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(sniffAudioType(bytes())).toBeNull();
  });
});

describe("validateUpload", () => {
  const mp3 = bytes(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00);

  it("accepts a real MP3 within the cap", () => {
    expect(validateUpload(mp3, mp3.byteLength)).toBeNull();
  });

  it("accepts a file exactly at the cap", () => {
    // Pins the boundary as inclusive. An off-by-one here refuses a file
    // the UI just told the admin was acceptable.
    expect(validateUpload(mp3, MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("rejects a file over the cap even when it is real audio", () => {
    expect(validateUpload(mp3, MAX_UPLOAD_BYTES + 1)).toMatch(/too large/i);
  });

  it("rejects non-audio content", () => {
    expect(validateUpload(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50), 8)).toMatch(
      /not an audio file/i,
    );
  });

  it("rejects an empty file", () => {
    // Zero bytes is under the cap and is not audio; the message must be
    // the content one, not a silent pass.
    expect(validateUpload(bytes(), 0)).toMatch(/not an audio file/i);
  });
});
