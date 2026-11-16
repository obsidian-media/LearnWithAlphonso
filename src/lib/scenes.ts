import data from "../data/scenes.json";

/** A rendered background for a main screen (src/data/scenes.json; the Kit's ScreenScene mirrors it). */
export type Scene = "complete" | "hector" | "learn" | "listen" | "practice" | "profile";
/** A full-body character cut-out that stands in a scene. */
export type Figure = "alphonso-proud" | "alphonso-waving" | "hector-waving";

/** A short looping video of a whole scene with its character in it, made from a scene + figure first frame. */
export type Clip = "hector" | "learn";

export const SCENES = data.scenes as Scene[];
/** The scenes that have a Royal-night picture (night-<name>.jpg). "complete" has none: Lesson complete stays light. */
export const NIGHT_SCENES = data.night as Scene[];
export const CLIPS = data.clips as Clip[];
export const FIGURES = data.figures as Figure[];

/**
 * The picture behind a screen. `night` is true only in the Royal night look (src/lib/theme.ts resolveDsLook): Meadow
 * never gets it, even when the device is dark, and a scene without a night picture keeps its day one.
 */
export function sceneSrc(scene: Scene, night = false): string {
  return night && NIGHT_SCENES.includes(scene)
    ? `/scenes/night-${scene}.jpg`
    : `/scenes/${scene}.jpg`;
}

export function figureSrc(figure: Figure): string {
  return `/figures/${figure}.png`;
}

export function clipSrc(clip: Clip): string {
  return `/clips/${clip}.mp4`;
}

/** The clip's first frame: the still shown before it plays and, under Reduce Motion, instead of it. */
export function clipPoster(clip: Clip): string {
  return `/clips/${clip}.jpg`;
}
