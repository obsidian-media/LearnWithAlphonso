import { describe, expect, it } from "vitest";
import {
  HECTOR_TUNING,
  HandsFreeLoop,
  PRACTICE_TUNING,
  type HandsFreeEffect,
  type HandsFreeStatus,
  type HandsFreeTuning,
  type PauseReason,
} from "./hands-free-loop";
import { handsFreeFirstUseBody, handsFreeStatusLine } from "./hands-free-copy";
import type { PhaseKind } from "./avatar/machine";

// A 1:1 port of ios/LearnWithAlphonsoKit/Tests/.../HandsFreeLoopTests.swift.

const quiet = -60;
const speech = -20;

const phase = (loop: HandsFreeLoop, kind: PhaseKind) =>
  loop.handle({ type: "voicePhase", phase: kind });

/** A loop that is on and recording turn 1. */
function recordingLoop(tuning: HandsFreeTuning = HECTOR_TUNING): HandsFreeLoop {
  const loop = new HandsFreeLoop(tuning);
  expect(loop.handle({ type: "enable" })).toEqual(["beginTurn"]);
  phase(loop, "requestingPermission");
  expect(phase(loop, "recording")).toEqual([]);
  expect(loop.status).toEqual({ kind: "listening" });
  return loop;
}

/** Feeds samples every 0.1 s from `from` (inclusive) to `to` (exclusive) and collects the effects. */
function feed(loop: HandsFreeLoop, level: number, from: number, to: number): HandsFreeEffect[] {
  const effects: HandsFreeEffect[] = [];
  let t = from;
  while (t < to - 1e-9) {
    effects.push(...loop.handle({ type: "level", dBFS: level, at: t }));
    t += 0.1;
  }
  return effects;
}

describe("HandsFreeLoop", () => {
  it("enabling when idle starts listening", () => {
    const loop = new HandsFreeLoop();
    expect(loop.handle({ type: "enable" })).toEqual(["beginTurn"]);
    expect(loop.handle({ type: "enable" })).toEqual([]); // enabling twice does nothing
  });

  it("enabling while the tutor is replying waits for the reply to end", () => {
    const loop = new HandsFreeLoop();
    phase(loop, "speaking");
    expect(loop.handle({ type: "enable" })).toEqual([]);
    expect(phase(loop, "idle")).toEqual(["beginTurn"]);
  });

  it("speech then a pause ends the turn once", () => {
    const loop = recordingLoop();
    expect(feed(loop, quiet, 0, 0.5)).toEqual([]);
    expect(feed(loop, speech, 0.5, 2.0)).toEqual([]);
    expect(loop.status).toEqual({ kind: "hearing" });
    // 1.1 s of quiet: not yet.
    expect(feed(loop, quiet, 2.0, 3.0)).toEqual([]);
    // one end, at 1.2 s of quiet
    expect(feed(loop, quiet, 3.0, 4.0)).toEqual(["endTurn"]);
  });

  it("a short click is not speech", () => {
    const loop = recordingLoop();
    feed(loop, quiet, 0, 0.5);
    feed(loop, speech, 0.5, 0.6);
    expect(loop.status).toEqual({ kind: "listening" });
    // a click followed by quiet never ends the turn
    expect(feed(loop, quiet, 0.6, 3.0)).toEqual([]);
  });

  it("nobody speaking cancels and pauses so the mic never stays open", () => {
    const loop = recordingLoop();
    expect(feed(loop, quiet, 0, 8.2)).toEqual(["cancelTurn"]);
    expect(loop.status).toEqual({ kind: "paused", reason: "noSpeech" });
    // The cancelled turn returns to idle: hands-free must not reopen the mic by itself.
    expect(phase(loop, "idle")).toEqual([]);
  });

  it("a noisy background needs louder speech", () => {
    const loop = recordingLoop();
    feed(loop, -30, 0, 1.0);
    // 8 dB above a -30 background is not speech (a -30 floor plus 14 dB puts the threshold at -16).
    feed(loop, -22, 1.0, 2.0);
    expect(loop.status).toEqual({ kind: "listening" });
    feed(loop, -10, 2.0, 2.5);
    expect(loop.status).toEqual({ kind: "hearing" });
  });

  it("thirty seconds of sound is cancelled, not sent", () => {
    const loop = recordingLoop();
    // continuous sound for 30 s is a TV or a crowd: never sent
    expect(feed(loop, speech, 0, 30.5)).toEqual(["cancelTurn"]);
    expect(loop.status).toEqual({ kind: "paused", reason: "longTurn" });
  });

  it("the recorder warm-up reading is not the room", () => {
    const loop = recordingLoop();
    // -160 first (no audio metered yet), then a -30 room: -30 must set the floor, so -22 is not speech.
    loop.handle({ type: "level", dBFS: -160, at: 0 });
    feed(loop, -30, 0.1, 1.0);
    feed(loop, -22, 1.0, 2.0);
    expect(loop.status).toEqual({ kind: "listening" });
  });

  it("an empty transcript pauses instead of listening again", () => {
    const loop = recordingLoop();
    feed(loop, speech, 0, 1.0);
    feed(loop, quiet, 1.0, 2.5);
    phase(loop, "transcribing");
    expect(loop.handle({ type: "turnHadNoWords" })).toEqual([]);
    // noise must not keep the loop going
    expect(phase(loop, "idle")).toEqual([]);
    expect(loop.status).toEqual({ kind: "paused", reason: "noWords" });
  });

  it("twenty turns without a touch pause", () => {
    const loop = new HandsFreeLoop();
    let begun = loop.handle({ type: "enable" }).length;
    for (let i = 0; i < 30; i++) {
      phase(loop, "recording");
      phase(loop, "transcribing");
      begun += phase(loop, "idle").length;
    }
    expect(begun).toBe(20);
    expect(loop.status).toEqual({ kind: "paused", reason: "turnLimit" });
    // a touch resets the count
    expect(loop.handle({ type: "togglePause" })).toEqual(["beginTurn"]);
  });

  it("an interruption pauses so the mic does not reopen", () => {
    const loop = recordingLoop();
    expect(loop.handle({ type: "audioInterrupted" })).toEqual([]);
    expect(phase(loop, "idle")).toEqual([]);
    expect(loop.status).toEqual({ kind: "paused", reason: "interrupted" });
  });

  it("off then on again starts a turn", () => {
    const loop = recordingLoop();
    expect(loop.handle({ type: "disable" })).toEqual(["cancelTurn"]);
    // The caller always delivers phases, also while off.
    expect(phase(loop, "idle")).toEqual([]);
    expect(loop.handle({ type: "enable" })).toEqual(["beginTurn"]);
  });

  it("resume after a failure starts a turn from the failed phase", () => {
    const loop = recordingLoop();
    phase(loop, "transcribing");
    phase(loop, "failed");
    // The phase stays failed (no idle follows); Resume must still start a turn.
    expect(loop.handle({ type: "togglePause" })).toEqual(["beginTurn"]);
  });

  it("after the tutor replies the next turn starts", () => {
    const loop = recordingLoop();
    feed(loop, speech, 0, 1.0);
    feed(loop, quiet, 1.0, 2.5);
    for (const p of ["transcribing", "thinking", "speaking"] as const) {
      expect(phase(loop, p)).toEqual([]);
      expect(loop.status).toEqual({ kind: "waiting" });
    }
    expect(phase(loop, "idle")).toEqual(["beginTurn"]);
  });

  it("a failure pauses and never retries by itself", () => {
    const loop = recordingLoop();
    phase(loop, "transcribing");
    expect(phase(loop, "failed")).toEqual([]);
    expect(loop.status).toEqual({ kind: "paused", reason: "failure" });
  });

  it("a refused microphone or a failed start pauses instead of asking again", () => {
    const loop = new HandsFreeLoop();
    expect(loop.handle({ type: "enable" })).toEqual(["beginTurn"]);
    phase(loop, "requestingPermission");
    // never a second permission request by itself
    expect(phase(loop, "idle")).toEqual([]);
    expect(loop.status).toEqual({ kind: "paused", reason: "failure" });
  });

  it("pausing while recording cancels the turn and resuming starts one", () => {
    const loop = recordingLoop();
    expect(loop.handle({ type: "togglePause" })).toEqual(["cancelTurn"]);
    expect(loop.status).toEqual({ kind: "paused", reason: "byLearner" });
    expect(phase(loop, "idle")).toEqual([]);
    expect(loop.handle({ type: "togglePause" })).toEqual(["beginTurn"]);
  });

  it("turning it off cancels an open mic and ignores everything after", () => {
    const loop = recordingLoop();
    expect(loop.handle({ type: "disable" })).toEqual(["cancelTurn"]);
    expect(loop.status).toEqual({ kind: "off" });
    expect(phase(loop, "idle")).toEqual([]);
    expect(feed(loop, speech, 0, 2)).toEqual([]);
  });

  it("levels outside recording are ignored", () => {
    const loop = new HandsFreeLoop();
    phase(loop, "speaking");
    loop.handle({ type: "enable" });
    // the tutor's own reply is not a turn
    expect(feed(loop, quiet, 0, 10)).toEqual([]);
  });

  it("every status has a line except off", () => {
    expect(handsFreeStatusLine({ kind: "off" })).toBeNull();
    const reasons: PauseReason[] = [
      "byLearner",
      "noSpeech",
      "failure",
      "longTurn",
      "noWords",
      "turnLimit",
      "interrupted",
    ];
    const all: HandsFreeStatus[] = [
      { kind: "waiting" },
      { kind: "listening" },
      { kind: "hearing" },
      ...reasons.map((reason): HandsFreeStatus => ({ kind: "paused", reason })),
    ];
    for (const status of all) expect(handsFreeStatusLine(status)).not.toBeNull();
    expect(handsFreeFirstUseBody("Alphonso")).toContain("driving");
  });

  it("the first-use note names who is listening and says what works best", () => {
    const practice = handsFreeFirstUseBody("Alphonso");
    expect(practice.startsWith("Alphonso listens")).toBe(true);
    expect(practice).not.toContain("Hector");
    expect(handsFreeFirstUseBody("Hector").startsWith("Hector listens")).toBe(true);
    expect(practice).toContain("Best with earbuds or a quiet room.");
    expect(handsFreeStatusLine({ kind: "waiting" }, "Alphonso")).toBe("Alphonso is replying...");
    expect(handsFreeStatusLine({ kind: "waiting" })).toBe("Hector is replying...");
  });

  describe("per-use tuning", () => {
    it("Hector ends the turn after 1.2 seconds of quiet", () => {
      expect(HECTOR_TUNING.endOfTurnSilence).toBe(1.2);
      expect(new HandsFreeLoop().tuning).toEqual(HECTOR_TUNING); // the default is Hector's
      const loop = recordingLoop(HECTOR_TUNING);
      feed(loop, quiet, 0, 0.5);
      feed(loop, speech, 0.5, 2.0);
      expect(feed(loop, quiet, 2.0, 3.0)).toEqual([]); // 1.0 s of quiet: not yet
      expect(feed(loop, quiet, 3.0, 3.5)).toEqual(["endTurn"]);
    });

    it("Practice waits 2.5 seconds so a thinking pause does not cut the turn", () => {
      expect(PRACTICE_TUNING.endOfTurnSilence).toBe(2.5);
      const loop = recordingLoop(PRACTICE_TUNING);
      feed(loop, quiet, 0, 0.5);
      feed(loop, speech, 0.5, 2.0);
      // 2.4 s of quiet (last loud sample at 1.9): still listening, and a late word keeps the same turn.
      expect(feed(loop, quiet, 2.0, 4.3)).toEqual([]);
      expect(feed(loop, speech, 4.3, 4.6)).toEqual([]);
      expect(loop.status).toEqual({ kind: "hearing" });
      // ends 2.5 s after the last loud sample
      expect(feed(loop, quiet, 4.6, 7.3)).toEqual(["endTurn"]);
    });

    it("Practice keeps every other limit of Hector", () => {
      // only the end-of-turn silence differs
      expect({ ...PRACTICE_TUNING, endOfTurnSilence: HECTOR_TUNING.endOfTurnSilence }).toEqual(
        HECTOR_TUNING,
      );
      expect(PRACTICE_TUNING.noSpeechTimeout).toBe(8);
      expect(PRACTICE_TUNING.maxTurn).toBe(30);
      expect(PRACTICE_TUNING.maxTurnsWithoutTouch).toBe(20);
    });

    it("Practice still cancels a nobody-spoke turn at eight seconds", () => {
      const loop = recordingLoop(PRACTICE_TUNING);
      expect(feed(loop, quiet, 0, 8.2)).toEqual(["cancelTurn"]);
      expect(loop.status).toEqual({ kind: "paused", reason: "noSpeech" });
    });

    it("the tuning numbers are exactly iOS's", () => {
      expect(HECTOR_TUNING).toEqual({
        speechAboveFloor: 14,
        calibration: 0.3,
        maximumBackground: -35,
        minimumSpeechLevel: -42,
        speechOnset: 0.2,
        endOfTurnSilence: 1.2,
        noSpeechTimeout: 8,
        maxTurn: 30,
        ignoreBelow: -100,
        maxTurnsWithoutTouch: 20,
      });
    });
  });
});
