/**
 * Learn screen folding (round 6.1, option A). Pure: the screen passes in a level's units and the completed set.
 * Mirrors LearnFold in the iOS Kit and LearnFold in the Android core.
 *
 *  - done units fold into ONE slim row per unbroken run ("Units 1-9 · 78 / 78")
 *  - the current unit (first with an undone lesson) is open
 *  - units after it are folded with only their name
 */
export type FoldUnit = { id: string; eyebrow: string; title: string; lessonIds: readonly string[] };

export type FoldRow =
  | { kind: "done-run"; key: string; unitIds: string[]; first: string; last: string; done: number; total: number }
  | { kind: "unit"; key: string; unitId: string; state: "current" | "ahead"; done: number; total: number };

export function foldLearn(units: readonly FoldUnit[], completed: ReadonlySet<string>): FoldRow[] {
  const rows: FoldRow[] = [];
  let currentTaken = false;
  for (const u of units) {
    const done = u.lessonIds.filter((id) => completed.has(id)).length;
    const total = u.lessonIds.length;
    const finished = total > 0 && done === total;
    if (finished) {
      const prev = rows[rows.length - 1];
      if (prev && prev.kind === "done-run") {
        prev.unitIds.push(u.id);
        prev.last = u.eyebrow;
        prev.done += done;
        prev.total += total;
      } else {
        rows.push({ kind: "done-run", key: `run-${u.id}`, unitIds: [u.id], first: u.eyebrow, last: u.eyebrow, done, total });
      }
      continue;
    }
    const state = currentTaken ? "ahead" : "current";
    currentTaken = true;
    rows.push({ kind: "unit", key: u.id, unitId: u.id, state, done, total });
  }
  return rows;
}

/** "Unit 3" / "Units 1-9" label for a done run. */
export function runLabel(row: Extract<FoldRow, { kind: "done-run" }>): string {
  const num = (s: string) => s.replace(/^Unit\s+/i, "");
  return row.first === row.last ? row.first : `Units ${num(row.first)}-${num(row.last)}`;
}

export type CurrentUnit = { index: number; count: number; unitId: string; lessonId: string };

/** The learner's place in the whole course: first lesson not done, with the unit's 1-based place of `count`. */
export function currentUnitOf(
  units: readonly FoldUnit[],
  completed: ReadonlySet<string>,
): CurrentUnit | null {
  for (let i = 0; i < units.length; i++) {
    const lessonId = units[i].lessonIds.find((id) => !completed.has(id));
    if (lessonId) return { index: i + 1, count: units.length, unitId: units[i].id, lessonId };
  }
  return null;
}

/** Painted rooms, in a fixed order; a unit's room is its place in the course modulo the list. */
export const ROOM_ART = [
  "classroom", "market", "garden", "station", "kitchen", "seaside", "library", "radio", "office", "farm",
  "gallery", "gym", "lab", "newsroom", "theatre", "bank", "bedroom", "dining", "techshop", "courtroom", "chamber",
] as const;

export function roomArtFor(unitIndex0: number): (typeof ROOM_ART)[number] {
  const n = ROOM_ART.length;
  return ROOM_ART[((unitIndex0 % n) + n) % n];
}

export function roomName(art: string): string {
  const names: Record<string, string> = { techshop: "Tech Shop", newsroom: "Newsroom" };
  return names[art] ?? art.charAt(0).toUpperCase() + art.slice(1);
}
