import { UNIT_ROOMS } from "../data/unit-rooms";

/**
 * The lesson's stage (visual round 6, the A+B mix): the unit's own room from the room map, with Alphonso standing
 * in it and reacting. The iOS LessonStage and Android's LessonStage keep the same rules.
 */

/** Alphonso's five expressions, cut from the realistic kit with identical framing so a swap is a crossfade. */
export const LESSON_EXPRESSIONS = ["talk", "neutral", "happy", "hmm", "wow"] as const;
export type LessonExpression = (typeof LESSON_EXPRESSIONS)[number];

export function expressionSrc(expression: LessonExpression): string {
  return `/alphonso/lesson/${expression}.webp`;
}

/** Alphonso's study by day: the room for a unit the map does not know. */
export const FALLBACK_ROOM = "room-light";

export function roomSrcForUnit(unitId: string | undefined): string {
  const room = (unitId && UNIT_ROOMS[unitId]) || FALLBACK_ROOM;
  return `/avatar/scenes/${room}.webp`;
}

/** He asks; he listens once you pick; he smiles when you are right and goes "hmm" when you are not. */
export function lessonExpression({
  picked,
  verdict,
}: {
  picked: boolean;
  verdict: "right" | "wrong" | null;
}): LessonExpression {
  if (verdict === "right") return "happy";
  if (verdict === "wrong") return "hmm";
  return picked ? "neutral" : "talk";
}

export type RoomLayout = {
  size: "full" | "long" | "small";
  roomHeight: number;
  alphonsoWidth: number;
};

/** Below this height (pt / CSS px) the phone counts as small. */
export const SMALL_PHONE_HEIGHT = 700;
/** A prompt longer than this runs past two lines of the bubble's 22 pt display type. */
export const LONG_PROMPT_CHARS = 60;

/**
 * The room's size from the spec: 380 with Alphonso 270 wide; 300 and 220 when the question runs past two lines;
 * 224 and 180 on a phone under 700 tall. A height of 0 (server render, before the browser answers) counts as tall.
 */
export function roomLayout({
  viewportHeight,
  prompt,
}: {
  viewportHeight: number;
  prompt: string;
}): RoomLayout {
  if (viewportHeight > 0 && viewportHeight < SMALL_PHONE_HEIGHT)
    return { size: "small", roomHeight: 224, alphonsoWidth: 180 };
  if (prompt.length > LONG_PROMPT_CHARS)
    return { size: "long", roomHeight: 300, alphonsoWidth: 220 };
  return { size: "full", roomHeight: 380, alphonsoWidth: 270 };
}
