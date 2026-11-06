import manifest from "../../../public/avatar/manifest.json";
import hectorManifest from "../../../public/hector/manifest.json";
import type { EarSide } from "./idle";
import type { Brows } from "./lipsync";
import type { Viseme } from "./visemes";

/** A layer's place on the square canvas, as fractions of its side. */
export type LayerRect = { x: number; y: number; w: number; h: number };

/** The room a character stands in when a scenario has no picture of its own. */
export type DefaultRoom = { light: string; dark: string };

/**
 * A character the call can show: his name, where his art folder is served from, the placement of his layers (read
 * from that folder's manifest.json), and his default room. The viseme, plan and state logic does not know which
 * character it is driving. Alphonso is the only kit shipped; Hector's will be another value of this type.
 */
export type CharacterKit = {
  id: string;
  displayName: string;
  /** Where the kit's files are served from: same-origin, so the CSP's `img-src 'self'` needs no change. */
  basePath: string;
  /**
   * `expression` is the group that shows his mood (neutral / raised / lowered): Alphonso's eyebrows, Hector's eyes
   * behind his goggles. Ears and the glint are optional: a kit without them has no ear twitch or glint.
   */
  rects: {
    mouth: LayerRect;
    expression: LayerRect;
    earLeft?: LayerRect;
    earRight?: LayerRect;
    glint?: LayerRect;
  };
  /** The file of each expression state. */
  expressionFiles: Record<Brows, string>;
  defaultRoom: DefaultRoom;
};

type Manifest = { layers: Record<string, LayerRect> };

/** Builds a kit from its manifest: the layer names are the kit format's (mouth-*, brows-*, ear-*, glint-mask). */
export function kitFromManifest(
  manifest: Manifest,
  meta: Pick<CharacterKit, "id" | "displayName" | "basePath" | "defaultRoom"> & {
    /** The layer-name prefix of the expression group: "brows" for Alphonso. */
    expressionPrefix?: string;
  },
): CharacterKit {
  const rect = (name: string): LayerRect | undefined => manifest.layers[name];
  const { expressionPrefix = "brows", ...rest } = meta;
  const ears = rect("ear-left-neutral") && rect("ear-right-neutral");
  return {
    ...rest,
    rects: {
      mouth: rect("mouth-ah")!,
      expression: rect(`${expressionPrefix}-neutral`)!,
      earLeft: ears ? rect("ear-left-neutral") : undefined,
      earRight: ears ? rect("ear-right-neutral") : undefined,
      glint: rect("glint-mask"),
    },
    expressionFiles: {
      neutral: `${expressionPrefix}-neutral.webp`,
      raised: `${expressionPrefix}-raised.webp`,
      lowered: `${expressionPrefix}-lowered.webp`,
    },
  };
}

export const ALPHONSO_KIT: CharacterKit = kitFromManifest(manifest, {
  id: "alphonso",
  displayName: "Alphonso",
  basePath: "/avatar",
  defaultRoom: { light: "/avatar/scenes/room-light.webp", dark: "/avatar/scenes/room-dark.webp" },
});

/** Hector's kit: no ears and no glint, and an `eyes-*` expression group behind his goggles. */
export const HECTOR_KIT: CharacterKit = kitFromManifest(hectorManifest, {
  id: "hector",
  displayName: "Hector",
  basePath: "/hector",
  expressionPrefix: "eyes",
  // The default study room for now.
  defaultRoom: ALPHONSO_KIT.defaultRoom,
});

export const AVATAR_BASE_PATH = ALPHONSO_KIT.basePath;
export const MOUTH_RECT = ALPHONSO_KIT.rects.mouth;
export const BROWS_RECT = ALPHONSO_KIT.rects.expression;
export const GLINT_RECT = ALPHONSO_KIT.rects.glint!;

export const BASE_FILE = "base.webp";
export const GLINT_MASK_FILE = "glint-mask.webp";

/** null for a closed mouth: the base art already shows it. */
export function mouthFile(viseme: Viseme): string | null {
  return viseme === "closed" ? null : `mouth-${viseme}.webp`;
}

export function browsFile(brows: Brows): string {
  return `brows-${brows}.webp`;
}

/** For a kit that has ear layers (none of the shipped kits does). */
export function earFile(side: EarSide, twitching: boolean): string {
  return `ear-${side}-${twitching ? "twitch" : "neutral"}.webp`;
}

export const MOUTH_SHAPES: readonly Exclude<Viseme, "closed">[] = [
  "half",
  "talk",
  "ah",
  "oh",
  "ee",
  "fv",
];
export const BROWS_STATES: readonly Brows[] = ["neutral", "raised", "lowered"];

export const ALL_FILE_NAMES: readonly string[] = [
  BASE_FILE,
  GLINT_MASK_FILE,
  ...MOUTH_SHAPES.map((s) => mouthFile(s)!),
  ...BROWS_STATES.map(browsFile),
];

/** "Show Alphonso while practising": same key and default as the iOS setting. */
export const AVATAR_PREFERENCE_KEY = "showAlphonsoWhilePractising";
export const AVATAR_PREFERENCE_DEFAULT = true;
