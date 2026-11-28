import { describe, expect, it, vi } from "vitest";

vi.mock("./llm-chat.server", () => ({ llmChatCompletion: vi.fn() }));
vi.mock("./ai-safety", () => ({}));
const { loadSummaryStats } = await import("./rehearsals.server");

describe("the history counts", () => {
  it("a hard-mode run is a run, but never a stage done", async () => {
    const rows = [
      { rehearsal_id: "r1", stage: "warmup", corrections: ["a"], hard_mode: false },
      { rehearsal_id: "r1", stage: "hard_moments", corrections: [], hard_mode: true },
      { rehearsal_id: "r1", stage: "hard_moments", corrections: ["b", "c"], hard_mode: false },
      { rehearsal_id: "r1", stage: "hard_moments", corrections: [], hard_mode: true },
    ];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.in = async () => ({ data: rows, error: null });
    const stats = await loadSummaryStats({ from: () => q } as never, "u", ["r1"]);
    expect(stats.get("r1")).toEqual({ runs: 4, stagesDone: 2, corrections: 3 });
  });

  it("a rehearsal with only a hard-mode run has no stage done", async () => {
    const rows = [{ rehearsal_id: "r1", stage: "hard_moments", corrections: [], hard_mode: true }];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.in = async () => ({ data: rows, error: null });
    const stats = await loadSummaryStats({ from: () => q } as never, "u", ["r1"]);
    expect(stats.get("r1")?.stagesDone).toBe(0);
  });
});
