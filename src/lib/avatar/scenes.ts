/**
 * The room behind Alphonso in the Practice call. One image per scenario, keyed by scenario id; everything else
 * (campaigns, free talk) gets the default study room. This lookup is the only place that knows which scenario has
 * art: add an id to SCENES_WITH_ART when its file lands in public/avatar/scenes/.
 */
export const SCENARIO_SCENE_IDS = [
  "coffee",
  "interview",
  "airport",
  "doctor",
  "smalltalk",
  "restaurant",
  "hotel",
  "directions",
  "apartment",
  "returns",
  "negotiation",
  "debate",
] as const;

/** Scenario ids that have their own image in public/avatar/scenes/. A scenario missing here gets the default room. */
const SCENES_WITH_ART: ReadonlySet<string> = new Set<string>(SCENARIO_SCENE_IDS);

export const DEFAULT_SCENE = "room";
const BASE = "/avatar/scenes";

export type SceneArt = {
  id: string;
  /** The light-mode image. */
  light: string;
  /** The dark-mode image: the default room has its own evening version; a scenario's image is dimmed instead. */
  dark: string;
  /** true when `dark` is the same image as `light` and needs the evening overlay. */
  dimInDark: boolean;
};

export function sceneArt(
  scenarioId: string | null | undefined,
  withArt: ReadonlySet<string> = SCENES_WITH_ART,
): SceneArt {
  if (scenarioId && withArt.has(scenarioId)) {
    const file = `${BASE}/${scenarioId}.webp`;
    return { id: scenarioId, light: file, dark: file, dimInDark: true };
  }
  return {
    id: DEFAULT_SCENE,
    light: `${BASE}/room-light.webp`,
    dark: `${BASE}/room-dark.webp`,
    dimInDark: false,
  };
}

/** The evening overlay on a scenario image in dark mode: navy #16203c, multiplied, at 50%. */
export const EVENING_OVERLAY = "rgba(22, 32, 60, 0.5)";
