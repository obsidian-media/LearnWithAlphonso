/**
 * One way to flatten text before a safety check looks at it, so a filter cannot be walked around with look-alike
 * characters or odd spacing: NFKC folds full-width letters and digits and other compatibility forms to plain ones,
 * invisible characters (zero-width, soft hyphen, BOM, direction marks) are removed, and every run of whitespace,
 * including no-break and other Unicode spaces, becomes one ordinary space. Case is kept; callers fold it themselves.
 */
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

export function normalizeForScan(input: string): string {
  return input.replace(INVISIBLE, "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
