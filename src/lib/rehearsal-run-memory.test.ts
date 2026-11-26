import { describe, expect, it } from "vitest";
import {
  RUN_MEMORY_MAX_CHARS,
  RUN_MEMORY_MAX_ITEMS,
  buildRunMemory,
  parseRehearsalMoments,
} from "./rehearsal-run-memory";

const LABELS = ["The salary question", "A misunderstanding", "Being interrupted"];

describe("parseRehearsalMoments: only the brief's own labels survive", () => {
  const reply = (moments: unknown) =>
    `Here you go: ${JSON.stringify({ corrections: [], moments })}`;

  it("keeps labels from the brief and drops anything the model invented", () => {
    const got = parseRehearsalMoments(
      reply({
        shown: ["The salary question", "my salary is 50k", "A misunderstanding"],
        wentWell: ["The salary question", "my salary is 50k"],
      }),
      LABELS,
    );
    expect(got).toEqual({
      shown: ["The salary question", "A misunderstanding"],
      wentWell: ["The salary question"],
    });
  });

  it("a moment can only go well if it was shown", () => {
    const got = parseRehearsalMoments(
      reply({ shown: ["A misunderstanding"], wentWell: ["Being interrupted"] }),
      LABELS,
    );
    expect(got.wentWell).toEqual([]);
  });

  it("is empty for a reply that is not usable", () => {
    expect(parseRehearsalMoments("no json", LABELS)).toEqual({ shown: [], wentWell: [] });
    expect(parseRehearsalMoments(reply("nope"), LABELS)).toEqual({ shown: [], wentWell: [] });
  });
});

describe("buildRunMemory: corrected forms and moment labels, never the learner's words", () => {
  it("keeps the corrected form and the shown moments", () => {
    const run = buildRunMemory({
      corrections: [{ fixed: "I agree with the plan" }],
      moments: { shown: ["A misunderstanding"], wentWell: [] },
      labels: LABELS,
    });
    expect(run.corrections).toEqual(["I agree with the plan"]);
    expect(run.momentsShown).toEqual(["A misunderstanding"]);
  });

  it("drops a corrected form that carries a number (a salary, a date, an address)", () => {
    const run = buildRunMemory({
      corrections: [{ fixed: "My salary is 50k" }, { fixed: "I would like to ask" }],
      moments: null,
      labels: LABELS,
    });
    expect(run.corrections).toEqual(["I would like to ask"]);
  });

  it("caps every array at 5 items of at most 140 characters", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ fixed: `form ${"x".repeat(i + 1)} ok` }));
    const labels = Array.from({ length: 8 }, (_, i) => `label ${String.fromCharCode(97 + i)}`);
    const run = buildRunMemory({
      corrections: [...many, { fixed: "y".repeat(300) }],
      moments: { shown: labels, wentWell: labels },
      labels,
    });
    for (const arr of [run.corrections, run.momentsShown, run.wentWell]) {
      expect(arr.length).toBeLessThanOrEqual(RUN_MEMORY_MAX_ITEMS);
      for (const s of arr) expect(s.length).toBeLessThanOrEqual(RUN_MEMORY_MAX_CHARS);
    }
    expect(run.momentsShown).toHaveLength(5);
    expect(run.corrections).toHaveLength(5);
  });

  it("is empty with no moments", () => {
    expect(buildRunMemory({ corrections: [], moments: null, labels: LABELS })).toEqual({
      momentsShown: [],
      wentWell: [],
      corrections: [],
    });
  });
});
