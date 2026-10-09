/**
 * Replace, never append: Apple allows at most 10 per set, and a mix of old and new UI in one
 * listing is a metadata-accuracy risk.
 */
export function planScreenshotReplacement(
  existing: { id: string; fileName: string }[],
  files: string[],
): { deleteIds: string[]; uploadOrder: string[] } {
  const pngs = files.filter((f) => f.toLowerCase().endsWith(".png"));
  if (pngs.length > 10) throw new Error(`${pngs.length} screenshots; Apple allows 10 per set`);
  if (pngs.length < 3) throw new Error("need at least 3 screenshots");
  const bad = pngs.filter((f) => !/^\d{2}[a-z]?-[a-z0-9-]+\.png$/i.test(f));
  if (bad.length)
    throw new Error(`screenshots must be numbered like 01-learn.png: ${bad.join(", ")}`);
  return { deleteIds: existing.map((e) => e.id), uploadOrder: [...pngs].sort() };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452) return null; // "IHDR"
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Portrait sizes App Store Connect accepts for each display type (landscape is the same pair swapped). */
const ACCEPTED_SIZES: Record<string, [number, number][]> = {
  APP_IPHONE_67: [
    [1290, 2796],
    [1284, 2778],
  ],
  APP_IPHONE_69: [
    [1320, 2868],
    [1290, 2796],
    [1260, 2736],
  ],
  APP_IPHONE_65: [
    [1242, 2688],
    [1284, 2778],
  ],
};

/** Problems with one screenshot file, found before the existing set is touched. */
export function screenshotFileProblems(
  fileName: string,
  bytes: Uint8Array,
  displayType: string,
): string[] {
  if (bytes.length === 0) return [`${fileName}: empty file`];
  const size = pngSize(bytes);
  if (!size) return [`${fileName}: not a PNG`];
  const accepted = ACCEPTED_SIZES[displayType];
  if (!accepted) return [`${fileName}: no known sizes for display type ${displayType}`];
  const ok = accepted.some(
    ([w, h]) => (size.width === w && size.height === h) || (size.width === h && size.height === w),
  );
  return ok
    ? []
    : [`${fileName}: ${size.width}x${size.height} is not an accepted size for ${displayType}`];
}
