import { describe, expect, it } from "vitest";
import { chatRequestBody } from "./call-source";
import { rehearsalCallSearch } from "./practice-session";

const ID = "00000000-0000-4000-8000-0000000000d1";
const base = {
  systemPrompt: "",
  cefrLevel: null,
  course: "en" as const,
  callId: "c",
  messages: [{ role: "user" as const, content: "hi" }],
};

describe("the /api/chat body of a rehearsal call", () => {
  it("Alphonso's body is exactly what it was before Hector rehearsals", () => {
    const body = chatRequestBody({
      ...base,
      source: { kind: "rehearsal", id: ID, stage: "conversation" },
    });
    expect(body).toMatchObject({ rehearsal: { id: ID, stage: "conversation" } });
    expect((body as { rehearsal: object }).rehearsal).toEqual({ id: ID, stage: "conversation" });
    const named = chatRequestBody({
      ...base,
      source: {
        kind: "rehearsal",
        id: ID,
        stage: "conversation",
        persona: "alphonso",
        hardMode: true,
      },
    });
    expect((named as { rehearsal: object }).rehearsal).toEqual({ id: ID, stage: "conversation" });
  });
  it("Hector adds persona, and hard mode only when asked", () => {
    const hector = chatRequestBody({
      ...base,
      source: { kind: "rehearsal", id: ID, stage: "hard_moments", persona: "hector" },
    });
    expect((hector as { rehearsal: object }).rehearsal).toEqual({
      id: ID,
      stage: "hard_moments",
      persona: "hector",
    });
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
    expect((hard as { rehearsal: object }).rehearsal).toEqual({
      id: ID,
      stage: "hard_moments",
      persona: "hector",
      hardMode: true,
    });
  });
});

describe("the stage route's search", () => {
  it("keeps persona=hector and hard only with Hector, and drops everything else", () => {
    expect(rehearsalCallSearch({})).toEqual({});
    expect(rehearsalCallSearch({ persona: "hector" })).toEqual({ persona: "hector" });
    expect(rehearsalCallSearch({ persona: "hector", hard: true })).toEqual({
      persona: "hector",
      hard: true,
    });
    expect(rehearsalCallSearch({ persona: "hector", hard: "true", mode: "call" })).toEqual({
      mode: "call",
      persona: "hector",
      hard: true,
    });
    expect(rehearsalCallSearch({ hard: true })).toEqual({});
    expect(rehearsalCallSearch({ persona: "zed", hard: true })).toEqual({});
    expect(rehearsalCallSearch({ persona: "hector", hard: "yes" })).toEqual({ persona: "hector" });
  });
});
