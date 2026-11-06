import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Course } from "@/data/courses";
import { breathScale, IdleScheduler, seededRandom, swayDegrees, type EarSide } from "./idle";
import { browsAt, lipSyncPlan, visemeAt, type LipSyncPlan } from "./lipsync";
import { AvatarMachine, type PhaseKind, type ReplyVerdict } from "./machine";
import { visemeSequence } from "./visemes";

/**
 * Replays shared/avatar-parity.json, the reference outputs of the iOS Kit. The Swift and Kotlin tests replay the
 * same file, so a change to any one port that the others do not follow fails here, there or in Kotlin.
 */
type Fixtures = {
  visemes: { course: Course; word: string; expect: string[] }[];
  plans: {
    course: Course;
    text: string;
    duration: number;
    cues: { start: number; end: number; viseme: string }[];
    raisedBrows: { start: number; end: number }[];
    probes: { time: number; viseme: string; brows: string }[];
  }[];
  machine: {
    plans: { course: Course; text: string; duration: number }[];
    scenarios: { name: string; steps: Record<string, unknown>[] }[];
  };
  idle: {
    seeds: {
      seed: string;
      first: number[];
      samples: { t: number; ear: EarSide | null; glint: number | null }[];
      jump: { t: number; ear: EarSide | null; glint: number | null };
    }[];
    motion: { t: number; sway: number; breathX: number; breathY: number }[];
  };
};

const fixtures = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../shared/avatar-parity.json"), "utf8"),
) as Fixtures;

const near = (actual: number | null, expected: number | null, label: string) => {
  if (expected === null || actual === null) return expect(actual, label).toBe(expected);
  expect(Math.abs(actual - expected), label).toBeLessThan(1e-9);
};

describe("parity fixtures: visemes", () => {
  it("has enough words in every course to mean something", () => {
    for (const course of ["en", "fr", "es"] as const)
      expect(fixtures.visemes.filter((v) => v.course === course).length).toBeGreaterThan(20);
  });
  it.each(fixtures.visemes.map((v) => [v.course, v.word, v] as const))(
    "%s %j",
    (_course, _word, v) => {
      expect(visemeSequence(v.word, v.course)).toEqual(v.expect);
    },
  );
});

describe("parity fixtures: lip-sync plans", () => {
  it.each(fixtures.plans.map((p, i) => [i, p.text, p] as const))("plan %i: %s", (_i, _t, p) => {
    const plan = lipSyncPlan(p.text, p.course, p.duration);
    expect(plan.cues.length).toBe(p.cues.length);
    plan.cues.forEach((cue, k) => {
      near(cue.start, p.cues[k].start, `cue ${k} start`);
      near(cue.end, p.cues[k].end, `cue ${k} end`);
      expect(cue.viseme, `cue ${k}`).toBe(p.cues[k].viseme);
    });
    expect(plan.raisedBrows.length).toBe(p.raisedBrows.length);
    plan.raisedBrows.forEach((span, k) => {
      near(span.start, p.raisedBrows[k].start, `brow ${k} start`);
      near(span.end, p.raisedBrows[k].end, `brow ${k} end`);
    });
    for (const probe of p.probes) {
      expect(visemeAt(plan, probe.time), `viseme at ${probe.time}`).toBe(probe.viseme);
      expect(browsAt(plan, probe.time), `brows at ${probe.time}`).toBe(probe.brows);
    }
  });
});

describe("parity fixtures: the state machine", () => {
  const plans: LipSyncPlan[] = fixtures.machine.plans.map((p) =>
    lipSyncPlan(p.text, p.course, p.duration),
  );
  it.each(fixtures.machine.scenarios.map((s) => [s.name, s] as const))("%s", (_name, scenario) => {
    const m = new AvatarMachine();
    scenario.steps.forEach((step, i) => {
      const where = `step ${i} (${String(step.op)})`;
      switch (step.op) {
        case "update":
          m.update(
            { kind: step.phase as PhaseKind, generation: step.generation as number },
            step.now as number,
          );
          expect(m.mode, where).toBe(step.mode);
          break;
        case "heard":
          m.heard(step.level as number, step.now as number);
          break;
        case "reply":
          m.replyArrived(step.verdict as ReplyVerdict);
          break;
        case "pose": {
          const speech = step.speech as { plan: number; time: number } | null;
          const pose = m.pose(
            step.now as number,
            speech ? { plan: plans[speech.plan], time: speech.time } : null,
          );
          expect(m.mode, `${where} mode`).toBe(step.mode);
          expect(pose.mouth, `${where} mouth`).toBe(step.mouth);
          expect(pose.brows, `${where} brows`).toBe(step.brows);
          break;
        }
        default:
          throw new Error(`unknown fixture op ${String(step.op)}`);
      }
    });
  });
});

describe("parity fixtures: idle life", () => {
  it.each(fixtures.idle.seeds.map((s) => [s.seed, s] as const))("seed %s", (_seed, s) => {
    const random = seededRandom(BigInt(s.seed));
    s.first.forEach((expected, k) => near(random(), expected, `random ${k}`));

    const scheduler = new IdleScheduler(seededRandom(BigInt(s.seed)));
    let twitches = 0;
    let glints = 0;
    for (const sample of s.samples) {
      scheduler.advance(sample.t);
      expect(scheduler.twitchingEar, `ear at ${sample.t}`).toBe(sample.ear);
      near(scheduler.glintProgress, sample.glint, `glint at ${sample.t}`);
      if (sample.ear) twitches += 1;
      if (sample.glint !== null) glints += 1;
    }
    // The fixture has to contain events, or matching it proves nothing.
    expect(twitches).toBeGreaterThan(5);
    expect(glints).toBeGreaterThan(5);

    const jumped = new IdleScheduler(seededRandom(BigInt(s.seed)));
    jumped.advance(s.jump.t);
    expect(jumped.twitchingEar).toBe(s.jump.ear);
    near(jumped.glintProgress, s.jump.glint, "glint after a jump");
  });

  it("matches the breathing and sway", () => {
    for (const m of fixtures.idle.motion) {
      near(swayDegrees(m.t), m.sway, `sway ${m.t}`);
      near(breathScale(m.t).x, m.breathX, `breath x ${m.t}`);
      near(breathScale(m.t).y, m.breathY, `breath y ${m.t}`);
    }
  });
});
