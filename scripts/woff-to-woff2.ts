/**
 * Converts a WOFF 1.0 font to WOFF 2.0 with no extra dependency: Node's zlib has both the inflate WOFF 1 needs and
 * the Brotli WOFF 2 needs. Every table is stored with the null transform (glyf/loca transform version 3, the rest
 * version 0), which the WOFF 2 spec allows; the saving comes from Brotli over one shared stream.
 *
 *   bun scripts/woff-to-woff2.ts public/fonts/figtree-variable.woff [more.woff ...]
 *
 * Writes <name>.woff2 next to each input. Verify in a browser (Chromium's OTS sanitiser rejects a bad file):
 * src/lib/fonts-woff2.test.ts checks the structure; the PR notes how it was checked in Chromium.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants, inflateSync } from "node:zlib";

type Table = { tag: string; data: Buffer };

/** WOFF 2 "known table" tags, in spec order; a known tag is written as its 6-bit index. */
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

export function readWoff1(buf: Buffer): { flavor: number; tables: Table[] } {
  if (buf.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = buf.toString("latin1", o, o + 4);
    const offset = buf.readUInt32BE(o + 4);
    const compLength = buf.readUInt32BE(o + 8);
    const origLength = buf.readUInt32BE(o + 12);
    const raw = buf.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength)
      throw new Error(`table ${tag}: length ${data.length} != ${origLength}`);
    tables.push({ tag, data });
  }
  return { flavor, tables };
}

function base128(n: number): Buffer {
  const bytes: number[] = [];
  do {
    bytes.unshift(n & 0x7f);
    n = Math.floor(n / 128);
  } while (n > 0);
  for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
  return Buffer.from(bytes);
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

/** Size of the plain sfnt the WOFF 2 decodes to (header + directory + 4-byte padded tables). */
function sfntSize(tables: Table[]): number {
  return 12 + 16 * tables.length + tables.reduce((s, t) => s + pad4(t.data.length), 0);
}

export function encodeWoff2(flavor: number, input: Table[]): Buffer {
  // Tag order, except loca sits straight after glyf (the WOFF 2 spec pairs them in the directory).
  const sorted = [...input].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const loca = sorted.find((t) => t.tag === "loca");
  const tables = sorted.filter((t) => t !== loca);
  if (loca) tables.splice(tables.findIndex((t) => t.tag === "glyf") + 1, 0, loca);
  const dir: Buffer[] = [];
  for (const t of tables) {
    const known = KNOWN_TAGS.indexOf(t.tag);
    // Transform version: 3 = null transform for glyf/loca; 0 = null transform for every other table.
    const version = t.tag === "glyf" || t.tag === "loca" ? 3 : 0;
    const flags = (version << 6) | (known >= 0 ? known : 63);
    const parts = [Buffer.from([flags])];
    if (known < 0) parts.push(Buffer.from(t.tag, "latin1"));
    parts.push(base128(t.data.length));
    dir.push(Buffer.concat(parts));
  }
  const directory = Buffer.concat(dir);
  const stream = Buffer.concat(tables.map((t) => t.data));
  const compressed = brotliCompressSync(stream, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
      [constants.BROTLI_PARAM_SIZE_HINT]: stream.length,
    },
  });
  const headerSize = 48;
  const total = pad4(headerSize + directory.length + compressed.length);
  const header = Buffer.alloc(headerSize);
  header.write("wOF2", 0, "latin1");
  header.writeUInt32BE(flavor, 4);
  header.writeUInt32BE(total, 8);
  header.writeUInt16BE(tables.length, 12);
  header.writeUInt16BE(0, 14);
  header.writeUInt32BE(sfntSize(tables), 16);
  header.writeUInt32BE(compressed.length, 20);
  header.writeUInt16BE(1, 24); // majorVersion
  header.writeUInt16BE(0, 26); // minorVersion
  // metaOffset/metaLength/metaOrigLength/privOffset/privLength stay 0: no metadata or private block.
  const out = Buffer.alloc(total);
  header.copy(out, 0);
  directory.copy(out, headerSize);
  compressed.copy(out, headerSize + directory.length);
  return out;
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("usage: bun scripts/woff-to-woff2.ts <font.woff> [...]");
  for (const file of files) {
    const src = readFileSync(file);
    const { flavor, tables } = readWoff1(src);
    const out = encodeWoff2(flavor, tables);
    const dest = file.replace(/\.woff$/, ".woff2");
    writeFileSync(dest, out);
    console.log(`${dest}: ${src.length} -> ${out.length} bytes`);
  }
}
