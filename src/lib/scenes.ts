import data from "../data/scenes.json";

/** A rendered background for a main screen (src/data/scenes.json; the Kit's ScreenScene mirrors it). */
export type Scene = "complete" | "hector" | "learn" | "listen" | "practice" | "profile";
/** A full-body character cut-out that stands in a scene. */
export type Figure = "alphonso-proud" | "alphonso-waving" | "hector-waving";

export const SCENES = data.scenes as Scene[];
export const FIGURES = data.figures as Figure[];

export function sceneSrc(scene: Scene): string {
  return `/scenes/${scene}.jpg`;
}

export function figureSrc(figure: Figure): string {
  return `/figures/${figure}.png`;
}
