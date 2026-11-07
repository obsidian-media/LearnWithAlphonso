import { SKILLS, type Skill, type SkillScore } from "./profile-data";

/**
 * The Skills radar's rules (visual round 6.1, mock option 1). Pure: it takes the per-skill scores from skillScores and
 * says what to draw. Nothing here invents a value: a skill with too few answers has no vertex.
 */
export const MIN_SKILL_ANSWERS = 5;
/** How many skills must have enough answers before a shape is drawn; below that the page shows the empty state. */
export const MIN_SKILLS_FOR_RADAR = 3;

export const SKILL_LABEL: Record<Skill, string> = {
  listening: "Listening",
  speaking: "Speaking",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
};

export type RadarSkill = {
  skill: Skill;
  label: string;
  answered: number;
  /** 0-100, or null while the skill has fewer than MIN_SKILL_ANSWERS answers. */
  pct: number | null;
  /** Answers still needed before this skill is scored. */
  needed: number;
};

export type RadarModel =
  | { ready: false; skills: RadarSkill[]; scored: number }
  | { ready: true; skills: RadarSkill[]; scored: number; lowest: RadarSkill };

export function radarModel(scores: SkillScore[]): RadarModel {
  const skills: RadarSkill[] = SKILLS.map((skill) => {
    const s = scores.find((x) => x.skill === skill);
    const answered = s?.answered ?? 0;
    const enough = answered >= MIN_SKILL_ANSWERS && s?.pct != null;
    return {
      skill,
      label: SKILL_LABEL[skill],
      answered,
      pct: enough ? (s!.pct as number) : null,
      needed: Math.max(0, MIN_SKILL_ANSWERS - answered),
    };
  });
  const scored = skills.filter((s) => s.pct !== null);
  if (scored.length < MIN_SKILLS_FOR_RADAR) return { ready: false, skills, scored: scored.length };
  const lowest = scored.reduce((a, b) => ((b.pct as number) < (a.pct as number) ? b : a));
  return { ready: true, skills, scored: scored.length, lowest };
}

/** The point on axis `i` of `n` at radius `r` around the centre (c, c); axis 0 points up. */
export function radarPoint(i: number, n: number, r: number, c: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [Number((c + r * Math.cos(a)).toFixed(1)), Number((c + r * Math.sin(a)).toFixed(1))];
}

/** The filled shape: one vertex per scored skill, at its score's share of the radius. Unscored skills add none. */
export function radarPolygon(skills: RadarSkill[], radius: number, c: number): string {
  return skills
    .flatMap((s, i) =>
      s.pct === null ? [] : [radarPoint(i, skills.length, (radius * s.pct) / 100, c).join(",")],
    )
    .join(" ");
}
