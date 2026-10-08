import sharp from "sharp";

export const TARGET_LONG_EDGE = 700;

/**
 * Orientation-corrected, fit inside 700x700, never enlarged, white-flattened,
 * JPEG q80. sharp drops all metadata (EXIF/GPS/ICC) unless asked to keep it.
 * Script-only: never import this from app code.
 */
export async function resizeToJpeg(
  input: Uint8Array,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: TARGET_LONG_EDGE,
      height: TARGET_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}
