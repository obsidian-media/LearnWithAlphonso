import { describe, expect, it } from "vitest";
import {
  sniffAudioType,
  MAX_UPLOAD_BYTES,
  validateUpload,
  stagingPathFor,
  contentTypeFor,
} from "./admin-upload";

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

describe("stagingPathFor", () => {
  // The live object must never hold unverified bytes. Uploading onto
  // audio_path and deleting on failure destroyed a published episode's
  // audio on one mis-click, with no versioning and no backup to recover
  // from, while the row stayed published and pointing at nothing.
  it("differs from the live path", () => {
    expect(stagingPathFor("en/a1/coffee/ordering.mp3")).not.toBe("en/a1/coffee/ordering.mp3");
  });

  it("keeps the live path as a prefix, so an orphan is traceable", () => {
    // A staging object left behind by an interrupted upload should be
    // obviously attributable to its episode when someone browses the
    // bucket, not a loose uuid nobody can place.
    expect(stagingPathFor("en/a1/coffee/ordering.mp3")).toContain("en/a1/coffee/ordering.mp3");
  });

  it("is stable, so a retry overwrites its own staging object", () => {
    expect(stagingPathFor("a/b.mp3")).toBe(stagingPathFor("a/b.mp3"));
  });
});

describe("contentTypeFor", () => {
  // The sniffed type used to be discarded and everything parsed as
  // audio/mpeg, while the file picker advertised M4A.
  it("maps each sniffed kind to its real media type", () => {
    expect(contentTypeFor("mp3")).toBe("audio/mpeg");
    expect(contentTypeFor("mp4")).toBe("audio/mp4");
  });

  it("never returns a non-audio type", () => {
    // The stored Content-Type is what the bucket serves with. Anything
    // but audio/* here reopens the hole byte-sniffing exists to close.
    for (const kind of ["mp3", "mp4"] as const) {
      expect(contentTypeFor(kind)).toMatch(/^audio\//);
    }
  });
});
