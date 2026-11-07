import { describe, expect, it } from "vitest";
import {
  AGE_CHOICES,
  FIRST_RUN_DRAFT_KEY,
  UNDER_13_KEY,
  MINI_LESSONS,
  answersToSend,
  chooseAge,
  createFirstRunStore,
  greetingFor,
  questionStepsFor,
  roomForAnswers,
} from "./first-run";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("the under-13 block on this device", () => {
  it("picking Under 13 blocks and wipes every answer given so far", () => {
    const storage = memoryStorage();
    const store = createFirstRunStore(storage);
    store.writeDraft({ name: "Sam", course: "es", goal: "travel" });
    expect(chooseAge(store, "under-13")).toBe("blocked");
    expect(store.readDraft()).toEqual({});
    expect(storage.data.has(FIRST_RUN_DRAFT_KEY)).toBe(false);
    expect(storage.data.get(UNDER_13_KEY)).toBeTruthy();
  });

  it("going back and picking an older range does not get through", () => {
    const store = createFirstRunStore(memoryStorage());
    chooseAge(store, "under-13");
    for (const older of ["13-17", "18-24", "25-34", "35-54", "55+"] as const) {
      expect(chooseAge(store, older)).toBe("blocked");
    }
  });

  it("is remembered after a reload (a new store on the same storage)", () => {
    const storage = memoryStorage();
    chooseAge(createFirstRunStore(storage), "under-13");
    const reloaded = createFirstRunStore(storage);
    expect(reloaded.isBlocked()).toBe(true);
    expect(chooseAge(reloaded, "25-34")).toBe("blocked");
  });

  it("holds for the rest of the visit when storage is blocked (private mode)", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const store = createFirstRunStore(broken);
    chooseAge(store, "under-13");
    expect(store.isBlocked()).toBe(true);
    expect(chooseAge(store, "25-34")).toBe("blocked");
  });

  it("a blocked device has nothing to send, even if answers were written after the block", () => {
    const storage = memoryStorage();
    const store = createFirstRunStore(storage);
    chooseAge(store, "under-13");
    storage.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify({ name: "Sam", ageRange: "25-34" }));
    expect(answersToSend(store)).toBeNull();
  });

  it("an older range on a clean device is fine and is kept as a range", () => {
    const store = createFirstRunStore(memoryStorage());
    expect(chooseAge(store, "25-34")).toBe("ok");
    expect(store.readDraft().ageRange).toBe("25-34");
  });

  it("the age screen lists every range the same way, with no default picked", () => {
    expect(AGE_CHOICES.map((c) => c.id)).toEqual([
      "under-13",
      "13-17",
      "18-24",
      "25-34",
      "35-54",
      "55+",
    ]);
    expect(AGE_CHOICES.every((c) => !("default" in c))).toBe(true);
  });

  it("every age range has its own label, the same words as iPhone and Android", () => {
    const labels = AGE_CHOICES.map((c) => c.small);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(["Under 13", "Teen", "Young adult", "Adult", "Mid-life", "Mature"]);
  });
});

describe("answersToSend", () => {
  it("drops anything not on the server's lists, so a stale draft cannot fail the save", () => {
    const store = createFirstRunStore(memoryStorage());
    store.writeDraft({ name: "Sam", goal: "travel", interests: ["food"], step: 4 } as never);
    expect(answersToSend(store)).toEqual({ name: "Sam", goal: "travel", interests: ["food"] });
  });

  it("is null when nothing was answered", () => {
    expect(answersToSend(createFirstRunStore(memoryStorage()))).toBeNull();
  });
});

describe("the flow", () => {
  it("new learners get 8 counted questions; Complete your profile skips the course", () => {
    expect(questionStepsFor("new")).toEqual([
      "name",
      "course",
      "about",
      "goal",
      "level",
      "time",
      "age",
      "interests",
    ]);
    expect(questionStepsFor("complete")).not.toContain("course");
    expect(questionStepsFor("complete")).toHaveLength(7);
  });

  it("answers change the room: Spanish is the café, Travel is the airport", () => {
    expect(roomForAnswers({})).toBe("room-light");
    expect(roomForAnswers({ course: "es" })).toBe("coffee");
    expect(roomForAnswers({ course: "es", goal: "travel" })).toBe("airport");
  });

  it("Alphonso greets in the course's language, with the name when there is one", () => {
    expect(greetingFor("es", "Sam")).toBe("¡Hola, Sam!");
    expect(greetingFor("fr", "")).toBe("Bonjour !");
    expect(greetingFor("en", "Sam")).toBe("Hello, Sam!");
  });

  it("each course has a two-question first taste, each with exactly one right answer", () => {
    for (const course of ["en", "fr", "es"] as const) {
      expect(MINI_LESSONS[course]).toHaveLength(2);
      for (const q of MINI_LESSONS[course]) {
        expect(q.choices[q.answer]).toBeTruthy();
        expect(new Set(q.choices).size).toBe(q.choices.length);
      }
    }
  });
});
