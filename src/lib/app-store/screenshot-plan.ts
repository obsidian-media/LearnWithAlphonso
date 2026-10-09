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
