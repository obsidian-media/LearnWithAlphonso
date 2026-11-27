import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatRequestBody } from "./call-source";
import { fetchRehearsals, parseRehearsalState, type RehearsalError } from "./rehearsal-api";
import { toRehearsal, type RehearsalRow } from "./rehearsals.server";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("./ai-safety", () => ({}));
vi.mock("./llm-chat.server", () => ({ llmChatCompletion: vi.fn() }));

/**
 * One shared contract for the three platforms: tests/fixtures/rehearsal-api.json is what /api/rehearsal and
 * /api/app-config answer. The Swift Kit and the Android core decode this same file in their own tests, so a field that
 * changes here turns a decoder red there. This file keeps the fixture honest against the web's own types.
 */
type Fixture = {
  appConfig: { features: { rehearsals: boolean } };
  state: Record<string, unknown> & { active: Record<string, unknown> };
  stateEmpty: Record<string, unknown>;
  errors: { status: number; body: unknown; means: RehearsalError }[];
  chatBody: unknown;
};
const fixture = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/rehearsal-api.json", import.meta.url), "utf8"),
) as Fixture;

afterEach(() => vi.unstubAllGlobals());
const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe("the shared rehearsal API fixture", () => {
  it("decodes as the state the web reads", async () => {
    answer(200, fixture.state);
    const r = await fetchRehearsals("en");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.active?.eventKind).toBe("interview");
      expect(r.value.nextStage).toBe("conversation");
      expect(r.value.runs).toHaveLength(1);
      expect(r.value.history[0]).toMatchObject({ runs: 6, stagesDone: 3, corrections: 4 });
      expect(r.value.freeAvailable).toBe(false);
    }
  });

  it("decodes the empty state, and an older server's answer with no runs as an empty list", async () => {
    answer(200, fixture.stateEmpty);
    const empty = await fetchRehearsals("en");
    expect(empty.ok && empty.value.active).toBeNull();
    const { runs: _runs, ...older } = fixture.state;
    void _runs;
    expect(parseRehearsalState(older)?.runs).toEqual([]);
  });

  it("rejects an answer that is not a state", () => {
    expect(parseRehearsalState({ nope: true })).toBeNull();
    expect(parseRehearsalState(null)).toBeNull();
  });

  it.each(fixture.errors)("status $status $body.error means $means", async (e) => {
    answer(e.status, e.body);
    const r = await fetchRehearsals("en");
    expect(r).toEqual({ ok: false, error: e.means });
  });

  it("is exactly what the server writes for its active row (no field drifts from the fixture)", () => {
    const a = fixture.state.active as Record<string, unknown>;
    const row: RehearsalRow = {
      id: a.id as string,
      user_id: "u1",
      course: "en",
      event_kind: "interview",
      event_date: "2026-12-01",
      counterpart: a.counterpart as string,
      worries: a.worries as string,
      brief: a.brief as RehearsalRow["brief"],
      status: "active",
      free: true,
      outcome: null,
      created_at: "2026-11-26T10:00:00Z",
      closed_at: null,
    };
    expect(toRehearsal(row)).toEqual(a);
  });

  it("the call body the apps send for a rehearsal reply names the id and stage, and no prompt", () => {
    const body = chatRequestBody({
      source: {
        kind: "rehearsal",
        id: "11111111-1111-4111-8111-111111111111",
        stage: "conversation",
      },
      systemPrompt: "",
      cefrLevel: null,
      course: "en",
      callId: "c1",
      messages: [],
    });
    expect({ rehearsal: body.rehearsal }).toEqual(fixture.chatBody);
    expect(body).not.toHaveProperty("systemPrompt");
  });

  it("tells the apps the feature is on in /api/app-config", () => {
    expect(fixture.appConfig.features.rehearsals).toBe(true);
  });
});
