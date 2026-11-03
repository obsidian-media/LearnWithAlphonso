import availablePoses from "../data/mascot-poses-available.json";
import moments from "../data/mascot-moments.json";

export type Mascot = "alphonso" | "hector";
export type MascotMoment = keyof typeof moments.moments;

export const MASCOT_MOMENTS = Object.keys(moments.moments) as MascotMoment[];

/**
 * The art for a moment: the pose image when it is bundled ("alphonso-proud"),
 * otherwise the mascot's base image, so a missing pose never shows a broken image.
 */
export function mascotArt(
  moment: MascotMoment,
  available: readonly string[] = availablePoses as string[],
): { mascot: Mascot; src: string } {
  const { mascot, pose } = moments.moments[moment] as { mascot: Mascot; pose: string };
  const name = `${mascot}-${pose}`;
  return {
    mascot,
    src: available.includes(name) ? `/mascots/${name}.png` : `/mascots/${mascot}.png`,
  };
}
