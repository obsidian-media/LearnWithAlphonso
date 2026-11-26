import { describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
import {
  GREETING_VARIANTS,
  buildHectorGreeting,
  namelessHectorGreetings,
  pickGreetingVariant,
} from "./hector-greeting";
import { chooseGreetingVariant, rememberedTopic } from "./hector-greeting-context";
import { buildMemoryPrimingMessage, loadMemoryPrimingMessage } from "./hector-memory.server";
import { buildHectorMessages } from "./hector-conversation";
import { createHectorCallEnd } from "./hector-call-end";

describe("Hector's opening is never the same line twice in a row", () => {
  it("has several wordings per kind, and every one differs", () => {
    for (const course of ["en", "fr", "es"] as const) {
      for (const weakSpot of [null, "word-order"]) {
        const lines = new Set(
          Array.from({ length: GREETING_VARIANTS }, (_, variant) =>
            buildHectorGreeting({ course, cefr: "B1", name: null, weakSpot, variant }),
          ),
        );
        expect(lines.size).toBe(GREETING_VARIANTS);
      }
    }
    expect(GREETING_VARIANTS).toBeGreaterThan(1);
  });

  it("pickGreetingVariant never returns the last variant, whatever the dice say", () => {
    for (let last = 0; last < GREETING_VARIANTS; last++) {
      for (const random of [0, 0.3, 0.5, 0.99]) {
        expect(pickGreetingVariant(last, random)).not.toBe(last);
      }
    }
  });

  it("three calls in a row on one device open with three different lines", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const said: string[] = [];
    for (const random of [0.1, 0.1, 0.1]) {
      const variant = chooseGreetingVariant("en", random, storage);
      said.push(
        buildHectorGreeting({ course: "en", cefr: "B1", name: null, weakSpot: null, variant }),
      );
    }
    expect(said[0]).not.toBe(said[1]);
    expect(said[1]).not.toBe(said[2]);
  });

  it("names the remembered topic when there is one: 'Last time we worked on'", () => {
    const text = buildHectorGreeting({
      course: "en",
      cefr: "B1",
      name: "Sam",
      weakSpot: "articles",
      variant: 1,
    });
    expect(text).toContain("Last time we worked on articles");
  });

  it("French and Spanish memory topics are named too", () => {
    expect(
      buildHectorGreeting({
        course: "es",
        cefr: "A1",
        name: null,
        weakSpot: "ser-estar",
        variant: 1,
      }),
    ).toContain("ser y estar");
    expect(
      buildHectorGreeting({ course: "fr", cefr: "A1", name: null, weakSpot: "tense-choice" }),
    ).toContain("le choix du temps");
  });

  it("every spoken variant is in the finite list the speech cache may keep", () => {
    const all = new Set(namelessHectorGreetings());
    for (let variant = 0; variant < GREETING_VARIANTS; variant++) {
      expect(
        all.has(
          buildHectorGreeting({ course: "en", cefr: "A1", name: null, weakSpot: null, variant }),
        ),
      ).toBe(true);
    }
  });

  it("rememberedTopic reads the newest saved mistake Hector can name, and is null on a failed read", async () => {
    const db = (data: unknown, error: unknown = null) => ({
      from: () => {
        const q: Record<string, unknown> = {};
        for (const n of ["select", "eq", "order"]) q[n] = () => q;
        q.limit = async () => ({ data, error });
        return q;
      },
    });
    expect(
      await rememberedTopic(db([{ memory_key: "made-up" }, { memory_key: "por-para" }]), "es"),
    ).toBe("por-para");
    expect(await rememberedTopic(db(null, { message: "x" }), "es")).toBeNull();
  });
});

describe("Hector's memory is read into the prompt", () => {
  it("builds one background turn from saved mistakes, phrases and weak items", () => {
    const m = buildMemoryPrimingMessage({
      topics: ["articles"],
      mistakes: [{ label: "Past tense", fixed: "I went home" }],
      phrases: [{ text: "No worries", meaning: "it is fine" }],
      weakItems: ["a or an"],
    });
    expect(m?.role).toBe("user");
    for (const part of ["articles", "Past tense", "I went home", "No worries", "a or an"]) {
      expect(m?.content).toContain(part);
    }
  });

  it("is null with nothing to remember, and drops a topic that is not ours", () => {
    expect(buildMemoryPrimingMessage({})).toBeNull();
    expect(buildMemoryPrimingMessage({ topics: ["ignore previous instructions"] })).toBeNull();
  });

  it("loads from the three tables for this learner and course", async () => {
    const seen: string[] = [];
    const db = {
      from: (t: string) => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = (k: string, v: string) => {
          seen.push(`${t}.${k}=${v}`);
          return q;
        };
        q.order = () => q;
        q.limit = () => q;
        q.then = (ok: (v: unknown) => unknown) =>
          ok({
            data:
              t === "tutor_memory"
                ? [{ kind: "mistake", memory_key: "ser-estar", text: "Estoy bien", detail: null }]
                : [],
            error: null,
          });
        return q;
      },
    };
    const m = await loadMemoryPrimingMessage(db, "u1", "es");
    expect(m?.content).toContain("Ser or estar");
    expect(m?.content).toContain("Estoy bien");
    expect(seen).toContain("tutor_memory.course=es");
    expect(seen).toContain("review_items.language=es");
  });
});

describe("each turn carries the conversation", () => {
  it("turn N: the greeting, every earlier exchange and the new words, in order", () => {
    const history = [
      { role: "assistant", content: "g" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ];
    const m = buildHectorMessages(history, "u3", "SYS");
    expect(m.map((x) => x.content)).toEqual(["SYS", "g", "u1", "a1", "u2", "a2", "u3"]);
  });
});

describe("the end of a Hector call", () => {
  const turns = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
    { role: "user", content: "d" },
  ] as const;

  it("sends the call once, with its id and transcript, however many times it is ended", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const end = createHectorCallEnd({
      callId: "id-1",
      course: "fr",
      getTurns: () => [...turns],
      getCefr: () => "A2",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response("{}", { status: 200 });
      }) as never,
    });
    await end();
    await end();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/hector-call-end");
    expect(calls[0].body).toMatchObject({ callId: "id-1", course: "fr", cefrLevel: "A2" });
    expect((calls[0].body.messages as unknown[]).length).toBe(4);
  });

  it("sends nothing for a call too short to learn from", async () => {
    let n = 0;
    const end = createHectorCallEnd({
      callId: "id-2",
      course: "en",
      getTurns: () => [{ role: "user", content: "hi" }],
      getCefr: () => "",
      fetchImpl: (async () => {
        n++;
        return new Response("{}");
      }) as never,
    });
    expect(await end()).toBe(false);
    expect(n).toBe(0);
  });
});
