import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectAndRecordWeaknesses, parseWeaknesses } from "./weakness-detection.server";

const WEAKNESS = {
  label: "past-tense",
  display: "Past-tense verbs",
  prompt: "She ___ to the store yesterday.",
  choices: ["go", "goes", "went", "gone"],
  answerIndex: 2,
  explanation: "Past tense of 'go' is 'went'.",
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify([WEAKNESS]) } }] }),
      {
        status: 200,
      },
    ),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parseWeaknesses", () => {
  it("parses a well-formed JSON array", () => {
    expect(parseWeaknesses(JSON.stringify([WEAKNESS]))).toEqual([WEAKNESS]);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parseWeaknesses("```json\n" + JSON.stringify([WEAKNESS]) + "\n```")).toEqual([WEAKNESS]);
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parseWeaknesses("not json")).toEqual([]);
  });

  it("returns an empty array when the shape doesn't match the schema", () => {
    expect(parseWeaknesses(JSON.stringify([{ label: "not-a-real-category" }]))).toEqual([]);
  });
});

describe("detectAndRecordWeaknesses", () => {
  function callbacks(overrides: Partial<Parameters<typeof detectAndRecordWeaknesses>[0]> = {}) {
    return {
      userId: "user-1",
      sourceDescription: "test transcript",
      transcriptMessages: [{ role: "user", content: "I go to the park yesterday." }],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
      dedupCheck: vi.fn().mockResolvedValue(false),
      adminInsertReviewItem: vi.fn().mockResolvedValue(true),
      adminInsertEvent: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("returns 0 without calling NVIDIA for an empty transcript", async () => {
    const params = callbacks({ transcriptMessages: [] });
    const count = await detectAndRecordWeaknesses(params);
    expect(count).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("inserts a new weakness and logs a detected event", async () => {
    const params = callbacks();
    const count = await detectAndRecordWeaknesses(params);
    expect(count).toBe(1);
    expect(params.dedupCheck).toHaveBeenCalledWith("past-tense");
    expect(params.adminInsertReviewItem).toHaveBeenCalledWith(WEAKNESS);
    expect(params.adminInsertEvent).toHaveBeenCalledWith("past-tense");
  });

  it("skips a category that already has an active weakness item, without inserting or logging", async () => {
    const params = callbacks({ dedupCheck: vi.fn().mockResolvedValue(true) });
    const count = await detectAndRecordWeaknesses(params);
    expect(count).toBe(0);
    expect(params.adminInsertReviewItem).not.toHaveBeenCalled();
    expect(params.adminInsertEvent).not.toHaveBeenCalled();
  });

  it("does not log a detected event when the insert itself fails", async () => {
    const params = callbacks({ adminInsertReviewItem: vi.fn().mockResolvedValue(false) });
    const count = await detectAndRecordWeaknesses(params);
    expect(count).toBe(0);
    expect(params.adminInsertEvent).not.toHaveBeenCalled();
  });

  it("returns 0 when the upstream NVIDIA call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    const count = await detectAndRecordWeaknesses(callbacks());
    expect(count).toBe(0);
  });

  it("returns 0 when fetch itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const count = await detectAndRecordWeaknesses(callbacks());
    expect(count).toBe(0);
  });
});
