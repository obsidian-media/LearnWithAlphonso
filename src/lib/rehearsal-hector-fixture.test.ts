import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatRequestBody } from "./call-source";
import { fetchRehearsals, parseRehearsalState } from "./rehearsal-api";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({}) }));

/** The Hector and hard-mode part of the shared fixture the native apps decode. */
const fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/rehearsal-api.json", import.meta.url), "utf8"),
) as {
  state: Record<string, unknown>;
  stateEmpty: Record<string, unknown>;
  chatBodyHector: unknown;
  chatBodyHard: unknown;
  chatErrors: { status: number; body: { error: string }; means: string }[];
};
const ID = "11111111-1111-4111-8111-111111111111";
const base = {
  systemPrompt: "",
  cefrLevel: null,
  course: "en" as const,
  callId: "c",
  messages: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("the Hector part of the shared fixture", () => {
  it("is exactly the chat body the web sends for Hector and for hard mode", () => {
    const hector = chatRequestBody({
      ...base,
      source: { kind: "rehearsal", id: ID, stage: "conversation", persona: "hector" },
    });
    expect({ rehearsal: (hector as { rehearsal: unknown }).rehearsal }).toEqual(
      fixture.chatBodyHector,
    );
    const hard = chatRequestBody({
      ...base,
      source: {
        kind: "rehearsal",
        id: ID,
        stage: "hard_moments",
        persona: "hector",
        hardMode: true,
      },
    });
    expect({ rehearsal: (hard as { rehearsal: unknown }).rehearsal }).toEqual(fixture.chatBodyHard);
  });

  it("the state carries Hector's availability, hard mode done, and the mode of each run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixture.state), { status: 200 })),
    );
    const r = await fetchRehearsals("en");
    expect(r.ok && r.value.hectorAvailable).toBe(true);
    expect(r.ok && r.value.hardModeDone).toBe(false);
    expect(r.ok && r.value.runs[0]).toMatchObject({ persona: "alphonso", hardMode: false });
  });

  it("an older server's state (none of the new fields) reads as unknown, not done", () => {
    const { hectorAvailable: _a, hardModeDone: _b, ...older } = fixture.state;
    void _a;
    void _b;
    const s = parseRehearsalState(older);
    expect(s?.hectorAvailable).toBeNull();
    expect(s?.hardModeDone).toBe(false);
    expect(parseRehearsalState(fixture.stateEmpty)?.hectorAvailable).toBeNull();
  });

  it("the chat errors are told apart: pro_required opens the paywall, free_runs_used does not", () => {
    const byError = Object.fromEntries(fixture.chatErrors.map((e) => [e.body.error, e]));
    expect(byError["pro_required"]).toMatchObject({ status: 402, means: "paywall" });
    expect(byError["free_runs_used"]).toMatchObject({ status: 402, means: "free_runs_used" });
    expect(byError["invalid_mode"]).toMatchObject({ status: 400, means: "invalid" });
    expect(byError["retry"]).toMatchObject({ status: 503 });
  });
});
