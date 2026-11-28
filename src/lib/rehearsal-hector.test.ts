import { describe, expect, it, vi } from "vitest";
import { HECTOR_TEMPLATES } from "../data/rehearsal-hector-templates";
import { REHEARSAL_TEMPLATES } from "../data/rehearsal-templates";
import { recordRehearsalReply } from "./practice-calls.server";
import { fallbackBrief } from "./rehearsal-brief";
import { buildRehearsalPrompt } from "./rehearsal-prompt";
import {
  STAGES,
  hardModeDone,
  nextStage,
  runModeAllowed,
  runNeedsPro,
  stageProgress,
  type RunMemory,
} from "./rehearsal-rules";

vi.mock("./llm-chat.server", () => ({ llmChatCompletion: vi.fn() }));
vi.mock("./ai-safety", () => ({}));
const { HECTOR_PRO_READ_MS, hectorAvailableFor, loadRuns } = await import("./rehearsals.server");

const run = (over: Partial<RunMemory>): RunMemory => ({
  stage: "warmup",
  finishedAt: "2026-11-27T10:00:00Z",
  momentsShown: [],
  wentWell: [],
  corrections: [],
  ...over,
});

describe("progress with hard-mode runs", () => {
  it("a hard-mode run never marks its stage done", () => {
    const only = stageProgress([run({ stage: "hard_moments", persona: "hector", hardMode: true })]);
    expect(only.hard_moments).toBe("todo");
  });
  it("it does not replace the stage's own run, and the stage stays done once", () => {
    const runs = [
      run({ stage: "hard_moments", persona: "hector" }),
      run({ stage: "hard_moments", persona: "hector", hardMode: true }),
    ];
    expect(stageProgress(runs).hard_moments).toBe("done");
    expect(runs.filter((r) => r.stage === "hard_moments" && !r.hardMode)).toHaveLength(1);
  });
  it("a hard-mode run does not change which stage comes next", () => {
    const base = [
      run({ stage: "warmup" }),
      run({ stage: "conversation" }),
      run({ stage: "hard_moments", corrections: ["a"] }),
    ];
    const hard = run({
      stage: "hard_moments",
      persona: "hector",
      hardMode: true,
      finishedAt: "2026-11-28T10:00:00Z",
      corrections: [],
    });
    const pBase = stageProgress(base);
    expect(nextStage(stageProgress([...base, hard]), [...base, hard])).toBe(nextStage(pBase, base));
    // With only warm-up and conversation done, a hard-mode run still leaves hard moments as the next stage.
    const two = [run({ stage: "warmup" }), run({ stage: "conversation" }), hard];
    expect(nextStage(stageProgress(two), two)).toBe("hard_moments");
  });
  it("hard mode done is its own fact", () => {
    expect(hardModeDone([run({})])).toBe(false);
    expect(hardModeDone([run({ stage: "hard_moments", persona: "hector", hardMode: true })])).toBe(
      true,
    );
  });
});

describe("which runs are allowed and which need Pro", () => {
  it("hard mode only with Hector on the last stage", () => {
    for (const stage of STAGES) {
      expect(runModeAllowed({ persona: "hector", hard: true }, stage)).toBe(
        stage === "hard_moments",
      );
      expect(runModeAllowed({ persona: "alphonso", hard: true }, stage)).toBe(false);
      expect(runModeAllowed({ hard: true }, stage)).toBe(false);
      expect(runModeAllowed({ persona: "hector" }, stage)).toBe(true);
      expect(runModeAllowed({}, stage)).toBe(true);
    }
  });
  it("Alphonso at the normal level is free", () => {
    expect(runNeedsPro({ persona: "alphonso", hard: false })).toBe(false);
    expect(runNeedsPro({ persona: "hector" })).toBe(true);
  });
});

describe("Hector's templates", () => {
  const base = {
    stage: "hard_moments" as const,
    level: "B1" as const,
    brief: fallbackBrief("interview", "en"),
    runs: [],
    eventKind: "interview" as const,
  };
  it.each(["en", "fr", "es"] as const)(
    "%s: every stage has its own role and a longer debrief",
    (course) => {
      for (const stage of STAGES) {
        const h = HECTOR_TEMPLATES[course].stages[stage];
        const a = REHEARSAL_TEMPLATES[course].stages[stage];
        expect(h.behaviour).not.toBe(a.behaviour);
        expect(h.role("x")).toContain("Hector");
      }
      expect(HECTOR_TEMPLATES[course].hardMode.length).toBeGreaterThan(200);
    },
  );
  it.each(["en", "fr", "es"] as const)("%s: no learner text, no em dash", (course) => {
    const all = JSON.stringify(HECTOR_TEMPLATES[course]);
    expect(all).not.toContain("—");
  });
  it.each(["en", "fr", "es"] as const)(
    "%s: Hector's prompt keeps the shared safety text and the hard rule only when hard",
    (course) => {
      const brief = fallbackBrief("interview", course);
      const t = REHEARSAL_TEMPLATES[course];
      const plain = buildRehearsalPrompt({ ...base, course, brief, persona: "hector" });
      const hard = buildRehearsalPrompt({ ...base, course, brief, persona: "hector", hard: true });
      for (const p of [plain, hard]) {
        expect(p).toContain(t.aiHonesty);
        expect(p).toContain(t.dataNote);
        expect(p).toContain(t.closing);
      }
      expect(plain).not.toContain(HECTOR_TEMPLATES[course].hardMode);
      expect(hard).toContain(HECTOR_TEMPLATES[course].hardMode);
    },
  );
  it("hard mode is ignored for Alphonso and on other stages, so a stray flag never leaks in", () => {
    const course = "en" as const;
    const brief = fallbackBrief("interview", course);
    const hm = HECTOR_TEMPLATES.en.hardMode;
    expect(buildRehearsalPrompt({ ...base, course, brief, hard: true })).not.toContain(hm);
    for (const stage of ["warmup", "conversation"] as const)
      expect(
        buildRehearsalPrompt({ ...base, course, brief, stage, persona: "hector", hard: true }),
      ).not.toContain(hm);
  });
  it("Alphonso's prompt is byte-identical with and without the new options", () => {
    const brief = fallbackBrief("interview", "en");
    expect(
      buildRehearsalPrompt({ ...base, course: "en", brief, persona: "alphonso", hard: false }),
    ).toBe(buildRehearsalPrompt({ ...base, course: "en", brief }));
  });
});

describe("the call's mode travels with the reply that creates it (one RPC, no second write)", () => {
  const params = {
    userId: "u1",
    callId: "00000000-0000-4000-8000-0000000000c1",
    rehearsalId: "00000000-0000-4000-8000-0000000000d1",
    stage: "hard_moments" as const,
    course: "en" as const,
    learnerText: "I would like to talk about the salary.",
    verdict: "correct" as const,
  };
  const make = (rpcError: unknown = null) => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === "record_practice_reply") calls.push(args);
        return { data: 1, error: rpcError };
      },
      // Any table write would be a second, separable statement: there must be none.
      from: () => {
        throw new Error("no second write");
      },
    };
    return { client, calls };
  };
  it("a Hector reply sends persona and hard mode as arguments of record_practice_reply", async () => {
    const { client, calls } = make();
    expect(
      await recordRehearsalReply(client, { ...params, run: { persona: "hector", hard: true } }),
    ).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ _persona: "hector", _hard_mode: true });
  });
  it("Alphonso, and a reply with no run, send no mode (the function's defaults apply)", async () => {
    const { client, calls } = make();
    await recordRehearsalReply(client, { ...params, run: { persona: "alphonso", hard: false } });
    await recordRehearsalReply(client, { ...params });
    for (const c of calls) {
      expect(c).not.toHaveProperty("_persona");
      expect(c).not.toHaveProperty("_hard_mode");
    }
  });
  it("a failed RPC is reported as not recorded (so a first Hector turn can fail closed)", async () => {
    const { client } = make({ message: "refused" });
    expect(
      await recordRehearsalReply(client, { ...params, run: { persona: "hector", hard: true } }),
    ).toBe(false);
  });
});

describe("state for the clients", () => {
  it("Hector is available to Pro, not to free, and unknown when Pro cannot be read", async () => {
    expect(await hectorAvailableFor("u", async () => "active")).toBe(true);
    expect(await hectorAvailableFor("u", async () => "inactive")).toBe(false);
    expect(await hectorAvailableFor("u", async () => "unavailable")).toBeNull();
    expect(
      await hectorAvailableFor("u", async () => {
        throw new Error("x");
      }),
    ).toBeNull();
  });
  it("a slow Pro read is unknown, not a wait (capped at 1.5 s)", async () => {
    expect(HECTOR_PRO_READ_MS).toBe(1500);
    const never = () => new Promise<"active">(() => {});
    const started = Date.now();
    expect(await hectorAvailableFor("u", never, 30)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(await hectorAvailableFor("u", async () => "active", 30)).toBe(true);
  });
  it("runs carry persona and hard mode (an older row reads as Alphonso, not hard)", async () => {
    const rows = [
      {
        stage: "hard_moments",
        finished_at: "t1",
        moments_shown: [],
        went_well: [],
        corrections: [],
        persona: "hector",
        hard_mode: true,
      },
      {
        stage: "warmup",
        finished_at: "t0",
        moments_shown: null,
        went_well: null,
        corrections: null,
      },
    ];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.order = async () => ({ data: rows, error: null });
    const runs = await loadRuns({ from: () => q } as never, "u", "r");
    expect(runs[0]).toMatchObject({ persona: "hector", hardMode: true });
    expect(runs[1]).toMatchObject({ persona: "alphonso", hardMode: false });
  });
});
