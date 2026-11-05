import { describe, expect, it } from "vitest";
import {
  PLACEMENT_ORDER,
  PLACEMENT_PASS_MARK,
  PLACEMENT_QUESTIONS,
  bandMarkers,
  emptyTally,
  groupByBand,
  nextAdaptiveBand,
  pickPlacementSet,
  placementFinishedLabel,
  placementMaxQuestions,
  placementProgressLabel,
  placementProgressSpokenLabel,
  resolveBand,
  scorePlacement,
  type PlacementQuestion,
  type PlacementTally,
} from "./placement";
import { COURSES, getCourse } from "./courses";
import type { Level } from "./levels";

describe("pickPlacementSet", () => {
  it("picks exactly 3 questions per band, in band order", () => {
    const set = pickPlacementSet();
    expect(set.length).toBe(PLACEMENT_ORDER.length * 3);
    expect(set.map((q) => q.level)).toEqual(PLACEMENT_ORDER.flatMap((lvl) => [lvl, lvl, lvl]));
  });

  it("only picks questions that exist in the given pool", () => {
    const set = pickPlacementSet(PLACEMENT_QUESTIONS);
    for (const q of set) {
      expect(PLACEMENT_QUESTIONS).toContain(q);
    }
  });

  it("never picks duplicate questions", () => {
    const set = pickPlacementSet();
    expect(new Set(set.map((q) => q.id)).size).toBe(set.length);
  });

  it("handles a band with fewer than 3 candidates by taking all of them", () => {
    const pool = PLACEMENT_QUESTIONS.filter((q) => q.level === "A1").slice(0, 2);
    const set = pickPlacementSet(pool);
    expect(set.length).toBe(2);
  });
});

describe("scorePlacement", () => {
  const zero: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

  it("places at A1 with no passed bands when nothing is correct", () => {
    expect(scorePlacement(zero)).toEqual({ level: "A1", passed: [] });
  });

  it("requires at least 2/3 correct to pass a band", () => {
    expect(scorePlacement({ ...zero, A1: 1 })).toEqual({ level: "A1", passed: [] });
    expect(scorePlacement({ ...zero, A1: 2 })).toEqual({ level: "A2", passed: ["A1"] });
  });

  it("stops at the first band not passed", () => {
    expect(scorePlacement({ ...zero, A1: 3, A2: 3, B1: 1 })).toEqual({
      level: "B1",
      passed: ["A1", "A2"],
    });
  });

  it("caps at C1 when every band is passed", () => {
    expect(scorePlacement({ A1: 3, A2: 3, B1: 3, B2: 3, C1: 3 })).toEqual({
      level: "C1",
      passed: ["A1", "A2", "B1", "B2", "C1"],
    });
  });

  it("treats a missing level entry as 0 correct", () => {
    expect(scorePlacement({} as Record<Level, number>)).toEqual({ level: "A1", passed: [] });
  });
});

describe("groupByBand", () => {
  it("groups a flat set by level, keeping every band's key even when empty", () => {
    const grouped = groupByBand(pickPlacementSet());
    expect(Object.keys(grouped).sort()).toEqual([...PLACEMENT_ORDER].sort());
    for (const lvl of PLACEMENT_ORDER) {
      expect(grouped[lvl].every((q) => q.level === lvl)).toBe(true);
    }
  });

  it("returns an empty array for a band with no candidates", () => {
    const grouped = groupByBand(PLACEMENT_QUESTIONS.filter((q) => q.level === "A1"));
    expect(grouped.B1).toEqual([]);
  });
});

describe("nextAdaptiveBand", () => {
  // A uniform 3-per-band pool covering all 5 bands, mirroring real course shape.
  const fullPool = groupByBand(pickPlacementSet());
  // Only A1 has content -- mirrors a thin/mocked pool.
  const a1OnlyPool = groupByBand(PLACEMENT_QUESTIONS.filter((q) => q.level === "A1").slice(0, 3));

  it("stops immediately when every question in the band is wrong", () => {
    expect(nextAdaptiveBand(fullPool, 0, 0)).toEqual({ stop: true, skipped: null, nextIdx: 0 });
  });

  it("stops immediately when the band has no candidates at all", () => {
    const emptyPool = groupByBand([]);
    expect(nextAdaptiveBand(emptyPool, 0, 0)).toEqual({ stop: true, skipped: null, nextIdx: 0 });
  });

  it("advances one band normally on partial credit", () => {
    expect(nextAdaptiveBand(fullPool, 0, 1)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
    expect(nextAdaptiveBand(fullPool, 0, 2)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
  });

  it("skips the next band on a perfect score when a real band lies two steps ahead", () => {
    expect(nextAdaptiveBand(fullPool, 0, 3)).toEqual({ stop: false, skipped: "A2", nextIdx: 2 });
    expect(nextAdaptiveBand(fullPool, 2, 3)).toEqual({ stop: false, skipped: "B2", nextIdx: 4 });
  });

  it("never skips into the final band -- C1 is only ever earned by a real question", () => {
    // B2 (idx 3) acing would land on idx 5, past the end -- no skip.
    expect(nextAdaptiveBand(fullPool, 3, 3)).toEqual({ stop: false, skipped: null, nextIdx: 4 });
  });

  it("does not stop or skip differently at the true final band, C1", () => {
    expect(nextAdaptiveBand(fullPool, 4, 3)).toEqual({ stop: false, skipped: null, nextIdx: 5 });
    expect(nextAdaptiveBand(fullPool, 4, 0)).toEqual({ stop: true, skipped: null, nextIdx: 4 });
  });

  it("declines to skip when the landing band has no real content, even on a perfect score", () => {
    // A2..C1 are all empty in this pool, so acing A1 must not grant free
    // credit for A2 -- see placement.tsx's use of this guard.
    expect(nextAdaptiveBand(a1OnlyPool, 0, 3)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
  });
});

/** A pool with `size` multiple-choice questions in each of the given bands and none anywhere else. */
function poolOf(levels: Level[], size = 3): Record<Level, PlacementQuestion[]> {
  return groupByBand(
    levels.flatMap((level) =>
      Array.from({ length: size }, (_, n): PlacementQuestion => ({
        id: `${level}-${n}`,
        level,
        type: "mc",
        prompt: "p",
        choices: ["a", "b"],
        answer: 0,
      })),
    ),
  );
}

/** A tally with the given real counts and standing skips, everything else zero. */
function tallyOf(
  correct: Partial<Record<Level, number>>,
  skippedLevels: Level[] = [],
  revisiting = false,
): PlacementTally {
  return {
    correctByLevel: { ...emptyTally().correctByLevel, ...correct },
    skippedLevels,
    revisiting,
  };
}

describe("resolveBand", () => {
  const full = poolOf(PLACEMENT_ORDER);
  // The state right after acing A1: A2 skipped on credit, B1 about to be asked.
  const afterSkip = tallyOf({ A1: 3, A2: PLACEMENT_PASS_MARK }, ["A2"]);

  it("agrees with nextAdaptiveBand when no skip is in play, and records the band's real count", () => {
    expect(resolveBand(full, 0, 0, emptyTally())).toEqual({
      stop: true,
      nextIdx: 0,
      tally: tallyOf({ A1: 0 }),
    });
    expect(resolveBand(full, 0, 1, emptyTally())).toEqual({
      stop: false,
      nextIdx: 1,
      tally: tallyOf({ A1: 1 }),
    });
    expect(resolveBand(full, 0, 2, emptyTally())).toEqual({
      stop: false,
      nextIdx: 1,
      tally: tallyOf({ A1: 2 }),
    });
  });

  it("skips a band on a perfect score and credits it, remembering that the credit is only provisional", () => {
    expect(resolveBand(full, 0, 3, emptyTally())).toEqual({
      stop: false,
      nextIdx: 2,
      tally: afterSkip,
    });
  });

  it("does not treat a failed band as a lost bet unless it is the band after a skip", () => {
    // A1 2 of 3 (a pass, so A2 is asked normally); A2 then 1 of 3. Nothing was skipped, nothing to withdraw:
    // the exam carries on as it always has.
    expect(resolveBand(full, 1, 1, tallyOf({ A1: 2 }))).toEqual({
      stop: false,
      nextIdx: 2,
      tally: tallyOf({ A1: 2, A2: 1 }),
    });
  });

  describe("the band after a skip is failed", () => {
    it.each([0, 1])(
      "withdraws the credit and goes back to the skipped band on %i of 3",
      (correct) => {
        expect(resolveBand(full, 2, correct, afterSkip)).toEqual({
          stop: false,
          nextIdx: 1, // backwards: A2, the band that was skipped
          tally: tallyOf({ A1: 3, A2: 0, B1: correct }, [], true),
        });
      },
    );

    it("is judged by the same pass mark as scorePlacement, not by 'anything but zero'", () => {
      // 1 of 3 is not a pass, so it is a fail here -- even though nextAdaptiveBand calls it "partial credit".
      expect(PLACEMENT_PASS_MARK).toBe(2);
      expect(nextAdaptiveBand(full, 2, 1).nextIdx).toBe(3); // would have carried on to B2
      expect(resolveBand(full, 2, 1, afterSkip).nextIdx).toBe(1);
    });

    it("ends after the band it went back to, placing on that band's real answers", () => {
      const wentBack = resolveBand(full, 2, 0, afterSkip).tally;
      expect(wentBack.revisiting).toBe(true);
      const expected: Record<number, Level> = { 0: "A2", 1: "A2", 2: "B1", 3: "B1" };
      for (const correct of [0, 1, 2, 3]) {
        const end = resolveBand(full, 1, correct, wentBack);
        expect(end.stop).toBe(true);
        expect(end.tally.revisiting).toBe(false);
        expect(end.tally.skippedLevels).toEqual([]);
        expect(end.tally.correctByLevel.A2).toBe(correct);
        expect(scorePlacement(end.tally.correctByLevel).level).toBe(expected[correct]);
      }
    });

    it("withdraws the credit and ends, placing at the skipped band, when that band has no questions", () => {
      // A1, B1, C1 only: A2 can be skipped (B1 lies beyond it) but never asked.
      const thin = poolOf(["A1", "B1", "C1"]);
      const skipped = resolveBand(thin, 0, 3, emptyTally());
      expect(skipped.tally.skippedLevels).toEqual(["A2"]);
      const failed = resolveBand(thin, 2, 0, skipped.tally);
      expect(failed).toEqual({
        stop: true,
        nextIdx: 2,
        tally: tallyOf({ A1: 3, A2: 0, B1: 0 }),
      });
      expect(scorePlacement(failed.tally.correctByLevel).level).toBe("A2");
    });
  });

  describe("the band after a skip is passed", () => {
    it("keeps the credit and carries on to the next band on 2 of 3", () => {
      expect(resolveBand(full, 2, 2, afterSkip)).toEqual({
        stop: false,
        nextIdx: 3,
        tally: tallyOf({ A1: 3, A2: 2, B1: 2 }, ["A2"]),
      });
    });

    it("keeps the credit and skips again on 3 of 3, when a band lies beyond", () => {
      expect(resolveBand(full, 2, 3, afterSkip)).toEqual({
        stop: false,
        nextIdx: 4,
        tally: tallyOf({ A1: 3, A2: 2, B1: 3, B2: 2 }, ["A2", "B2"]),
      });
    });

    it("keeps the credit when the final band is passed", () => {
      const doubleSkip = tallyOf({ A1: 3, A2: 2, B1: 3, B2: 2 }, ["A2", "B2"]);
      const end = resolveBand(full, 4, 2, doubleSkip);
      expect(end.nextIdx).toBe(5); // past C1: nothing left to ask
      expect(end.tally.skippedLevels).toEqual(["A2", "B2"]);
      expect(scorePlacement(end.tally.correctByLevel).level).toBe("C1");
    });
  });

  it("goes back to the right band after a skip higher up, and keeps an earlier skip that still stands", () => {
    // A1 and B1 aced: A2 and B2 skipped, C1 next. C1 failed: B2's credit goes, A2's stays (B1 backs it).
    const doubleSkip = tallyOf({ A1: 3, A2: 2, B1: 3, B2: 2 }, ["A2", "B2"]);
    const failed = resolveBand(full, 4, 0, doubleSkip);
    expect(failed).toEqual({
      stop: false,
      nextIdx: 3,
      tally: tallyOf({ A1: 3, A2: 2, B1: 3, B2: 0, C1: 0 }, ["A2"], true),
    });
  });

  it("never mutates the tally it is given", () => {
    const frozen = tallyOf({ A1: 3, A2: 2 }, ["A2"]);
    Object.freeze(frozen);
    Object.freeze(frozen.correctByLevel);
    Object.freeze(frozen.skippedLevels);
    // Frozen objects throw on write in strict mode (ES modules are strict), so this fails loudly if it does.
    expect(() => resolveBand(full, 2, 0, frozen)).not.toThrow();
    expect(() => resolveBand(full, 2, 3, frozen)).not.toThrow();
    expect(frozen).toEqual(tallyOf({ A1: 3, A2: 2 }, ["A2"]));
  });
});

// The property the whole skip mechanism has to keep, stated once and checked over EVERY possible sitting rather
// than a handful of examples: a placement is never higher than the learner's real answers support. The bug this
// pins -- ace A1, fail B1, get placed at B1 on a credit for an A2 nobody asked -- is one sitting out of
// thousands; the examples above name the ones that matter, this proves there is not another one like it.
describe("a skipped band's credit never places a learner above what they really answered", () => {
  type Sitting = {
    /** The bands the exam asked, in order. */
    asked: Level[];
    /** Correct answers in each band that was asked. */
    real: Partial<Record<Level, number>>;
    tally: PlacementTally;
  };

  /** Every sitting the exam can produce from this pool: each band it asks gets every possible score. */
  function allSittings(pool: Record<Level, PlacementQuestion[]>): Sitting[] {
    const sittings: Sitting[] = [];
    const walk = (
      idx: number,
      tally: PlacementTally,
      asked: Level[],
      real: Partial<Record<Level, number>>,
    ) => {
      const level = PLACEMENT_ORDER[idx]!;
      for (let correct = 0; correct <= pool[level].length; correct++) {
        const resolution = resolveBand(pool, idx, correct, tally);
        const nextAsked = [...asked, level];
        const nextReal = { ...real, [level]: correct };
        const nextLevel = PLACEMENT_ORDER[resolution.nextIdx];
        if (resolution.stop || !nextLevel || pool[nextLevel].length === 0) {
          sittings.push({ asked: nextAsked, real: nextReal, tally: resolution.tally });
        } else {
          walk(resolution.nextIdx, resolution.tally, nextAsked, nextReal);
        }
      }
    };
    walk(0, emptyTally(), [], {});
    return sittings;
  }

  const levelIndex = (level: Level) => PLACEMENT_ORDER.indexOf(level);

  // [name, pool, a floor on how many sittings it has]. The floor is far under the real count (214, 10 and 79 when
  // this was written) and is only there so an enumeration that quietly stopped enumerating cannot pass.
  const pools: [string, Record<Level, PlacementQuestion[]>, number][] = [
    ["a full pool", poolOf(PLACEMENT_ORDER), 100],
    ["a pool with no A2 or B2", poolOf(["A1", "B1", "C1"]), 5],
    ["a pool with a one-question B1", { ...poolOf(PLACEMENT_ORDER), B1: poolOf(["B1"], 1).B1 }, 30],
  ];

  it.each(pools)("holds for every sitting from %s", (_name, pool, floor) => {
    const sittings = allSittings(pool);
    expect(sittings.length).toBeGreaterThanOrEqual(floor);

    for (const { asked, real, tally } of sittings) {
      const story = `asked ${asked.map((l) => `${l}:${real[l]}`).join(" ")}`;

      // A band is asked at most once, so a sitting never exceeds the 15 questions the exam advertises.
      expect(new Set(asked).size, story).toBe(asked.length);

      // Every credit still standing at the end rests on a REAL pass of the band above it -- and the band itself
      // was not asked. (An unconfirmed skip, or one that was asked after all, may not survive to the result.)
      for (const skipped of tally.skippedLevels) {
        const above = PLACEMENT_ORDER[levelIndex(skipped) + 1]!;
        expect(asked, story).not.toContain(skipped);
        expect(real[above] ?? 0, story).toBeGreaterThanOrEqual(PLACEMENT_PASS_MARK);
      }

      // The tally is the real counts, plus the pass mark for each standing skip, and nothing else.
      for (const level of PLACEMENT_ORDER) {
        const expected = tally.skippedLevels.includes(level)
          ? PLACEMENT_PASS_MARK
          : (real[level] ?? 0);
        expect(tally.correctByLevel[level], `${story} / ${level}`).toBe(expected);
      }

      // The headline claim: placed no higher than one band above the highest band really passed.
      const reallyPassed = asked
        .filter((l) => (real[l] ?? 0) >= PLACEMENT_PASS_MARK)
        .map(levelIndex);
      const highest = reallyPassed.length ? Math.max(...reallyPassed) : -1;
      const placed = levelIndex(scorePlacement(tally.correctByLevel).level);
      expect(placed, story).toBeLessThanOrEqual(Math.min(PLACEMENT_ORDER.length - 1, highest + 1));
    }
  });

  it("is not vacuous: the sitting from the bug report is in the enumeration, and ends at A2 at most", () => {
    // A1 3/3 (A2 skipped), B1 0/3 (fail), then A2 asked: the old exam ended at B1 here, after two bands.
    const sittings = allSittings(poolOf(PLACEMENT_ORDER));
    const bug = sittings.filter(
      (s) => s.asked.join() === "A1,B1,A2" && s.real.A1 === 3 && s.real.B1 === 0,
    );
    expect(bug.length).toBe(4); // A2 asked, 0..3 correct
    for (const { real, tally } of bug) {
      const placed = scorePlacement(tally.correctByLevel).level;
      expect(placed, `A2 answered ${real.A2} of 3`).toBe((real.A2 ?? 0) >= 2 ? "B1" : "A2");
    }
  });
});

describe("the up-front length and the level markers", () => {
  it("the maximum is the sum of the band sizes, and it is reachable", () => {
    expect(placementMaxQuestions(poolOf(PLACEMENT_ORDER))).toBe(15);
    expect(placementMaxQuestions(poolOf(["A1", "B1", "C1"]))).toBe(9);
    expect(placementMaxQuestions(poolOf(PLACEMENT_ORDER, 2))).toBe(10);
    // pass every band 2 of 3 and all of them are asked
    const pool = poolOf(PLACEMENT_ORDER);
    let tally = emptyTally();
    let asked = 0;
    for (let idx = 0; idx < 5;) {
      asked += pool[PLACEMENT_ORDER[idx]!].length;
      const r = resolveBand(pool, idx, 2, tally);
      tally = r.tally;
      idx = r.nextIdx;
    }
    expect(asked).toBe(placementMaxQuestions(pool));
  });

  it("no sitting asks more than the maximum", () => {
    const pool = poolOf(PLACEMENT_ORDER);
    const walk = (idx: number, tally: PlacementTally, asked: number) => {
      for (let c = 0; c <= 3; c++) {
        const r = resolveBand(pool, idx, c, tally);
        expect(asked + 3).toBeLessThanOrEqual(placementMaxQuestions(pool));
        const next = PLACEMENT_ORDER[r.nextIdx];
        if (!r.stop && next && pool[next].length) walk(r.nextIdx, r.tally, asked + 3);
      }
    };
    walk(0, emptyTally(), 0);
  });

  it("uses the same words on every platform", () => {
    expect(placementProgressLabel(4, 15)).toBe("Question 4 · up to 15");
    expect(placementFinishedLabel(9)).toBe("Placed after 9 questions");
    expect(placementProgressSpokenLabel(4, 15)).toBe("Question 4, up to 15");
  });

  it("marks passed, skipped, current, missed and upcoming bands", () => {
    const pool = poolOf(PLACEMENT_ORDER);
    const shown = [...pool.A1, ...pool.B1];
    const states = (done: boolean, t: PlacementTally) =>
      Object.fromEntries(bandMarkers(pool, shown, 2, t, done).map((m) => [m.level, m.state]));
    const tally = tallyOf({ A1: 3, A2: 2 }, ["A2"]);
    expect(states(false, tally)).toEqual({
      A1: "passed",
      A2: "skipped",
      B1: "current",
      B2: "upcoming",
      C1: "upcoming",
    });
    expect(states(true, tallyOf({ A1: 3, A2: 2, B1: 1 }, ["A2"])).B1).toBe("missed");
    expect(states(false, tally).A2).not.toBe(states(false, tally).A1);
  });

  it("leaves out a band that has no questions", () => {
    const pool = poolOf(["A1", "B1"]);
    expect(bandMarkers(pool, pool.A1, 0, emptyTally(), false).map((m) => m.level)).toEqual([
      "A1",
      "B1",
    ]);
  });
});

// The exam logic never looks at the language: it takes whatever three questions per band the course drew. This
// proves it on the real French and Spanish banks (read, not edited) instead of asserting it.
describe.each(COURSES.map((c) => c.id))("skip then fail on the %s course", (course) => {
  const drawn = () => groupByBand(getCourse(course).pickPlacement(true));

  it("has three questions in every band, so the maximum is 15", () => {
    expect(placementMaxQuestions(drawn())).toBe(15);
  });

  it("A1 perfect, B1 failed: goes back to A2 and places on its real answers", () => {
    const pool = drawn();
    const afterA1 = resolveBand(pool, 0, 3, emptyTally());
    expect(afterA1.tally.skippedLevels).toEqual(["A2"]);
    expect(pool.A2.length).toBe(3); // the band it goes back to has real questions to ask
    for (const b1 of [0, 1]) {
      const back = resolveBand(pool, 2, b1, afterA1.tally);
      expect(back.nextIdx).toBe(1);
      for (const a2 of [0, 1, 2, 3]) {
        const end = resolveBand(pool, 1, a2, back.tally);
        expect(end.stop).toBe(true);
        expect(scorePlacement(end.tally.correctByLevel).level).toBe(a2 >= 2 ? "B1" : "A2");
      }
    }
  });
});
