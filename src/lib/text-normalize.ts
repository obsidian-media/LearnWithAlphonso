/**
 * One way to flatten text before a safety check looks at it, so a filter cannot be walked around with look-alike
 * characters or odd spacing: NFKC folds full-width letters and digits and other compatibility forms to plain ones,
 * invisible characters (zero-width, soft hyphen, BOM, direction marks, variation selectors) are removed, and every run
 * of whitespace, including no-break and other Unicode spaces, becomes one ordinary space. Case is kept; callers fold
 * it themselves.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
];

const isInvisible = (code: number): boolean =>
  INVISIBLE_RANGES.some(([lo, hi]) => code >= lo && code <= hi);

export function normalizeForScan(input: string): string {
  let out = "";
  for (const ch of input) if (!isInvisible(ch.codePointAt(0)!)) out += ch;
  return out.normalize("NFKC").replace(/\s+/g, " ").trim();
}
