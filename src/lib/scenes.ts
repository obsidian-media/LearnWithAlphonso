import data from "../data/scenes.json";

/** A rendered background for a main screen (src/data/scenes.json; the Kit's ScreenScene mirrors it). */
export type Scene = "complete" | "hector" | "learn" | "listen" | "practice" | "profile";
/** A full-body character cut-out that stands in a scene. */
export type Figure = "alphonso-proud" | "alphonso-waving" | "hector-waving";

/** A short looping video of a whole scene with its character in it, made from a scene + figure first frame. */
export type Clip = "complete" | "hector" | "learn";

export const SCENES = data.scenes as Scene[];
export const CLIPS = data.clips as Clip[];
export const FIGURES = data.figures as Figure[];

export function sceneSrc(scene: Scene): string {
  return `/scenes/${scene}.jpg`;
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
