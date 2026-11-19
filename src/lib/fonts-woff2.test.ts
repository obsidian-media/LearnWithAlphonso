import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
const root = path.resolve(import.meta.dirname, "../..");
const tokens = JSON.parse(readFileSync(path.join(root, "design/tokens.json"), "utf8"));
const fonts = Object.values(tokens.fonts as Record<string, { web: string }>).map((f) => f.web);

/** Reads a WOFF 2 file written with null transforms (scripts/woff-to-woff2.ts) back into its tables. */
function readWoff2(buf: Buffer) {
  expect(buf.toString("latin1", 0, 4)).toBe("wOF2");
  expect(buf.readUInt32BE(8)).toBe(buf.length);
  const numTables = buf.readUInt16BE(12);
  const compressedLength = buf.readUInt32BE(20);
  let o = 48;
  const dir: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[o++];
    let tag: string;
    if ((flags & 63) === 63) {
      tag = buf.toString("latin1", o, o + 4);
      o += 4;
    } else tag = `#${flags & 63}`;
    let length = 0;
    let b: number;
    do {
      b = buf[o++];
      length = length * 128 + (b & 0x7f);
    } while (b & 0x80);
    dir.push({ tag, length });
  }
  const stream = brotliDecompressSync(buf.subarray(o, o + compressedLength));
  return { dir, stream };
}

describe("web fonts", () => {
  it("are WOFF 2 files the CSS loads as woff2", () => {
    const css = readFileSync(path.join(root, "src/styles/ds-tokens.generated.css"), "utf8");
    for (const f of fonts) {
      expect(f).toMatch(/\.woff2$/);
      expect(existsSync(path.join(root, "public/fonts", f)), f).toBe(true);
      expect(css).toContain(`url("/fonts/${f}") format("woff2")`);
    }
    expect(css).not.toMatch(/format\("woff"\)/);
  });

  it("decode to a complete font: every table present and the stream exactly the tables' size", () => {
    for (const f of fonts) {
      const { dir, stream } = readWoff2(readFileSync(path.join(root, "public/fonts", f)));
      expect(dir.length, f).toBeGreaterThan(8);
      expect(stream.length, f).toBe(dir.reduce((s, t) => s + t.length, 0));
      // glyf (known index 10) is followed by loca (11), as the spec pairs them.
      const glyf = dir.findIndex((t) => t.tag === "#10");
      expect(glyf, f).toBeGreaterThanOrEqual(0);
      expect(dir[glyf + 1]?.tag, f).toBe("#11");
      // head (index 1) starts with version 1.0 and carries the 0x5F0F3CF5 magic number at offset 12.
      let off = 0;
      for (const t of dir) {
        if (t.tag === "#1") {
          expect(stream.readUInt32BE(off + 12), f).toBe(0x5f0f3cf5);
        }
        off += t.length;
      }
    }
  });
});
