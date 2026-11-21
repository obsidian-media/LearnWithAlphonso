import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Lesson, Unit } from "../../data/curriculum";
import { CapExceededError } from "../content-review/ledger";
import {
  NO_EXTRAS_LESSONS,
  addLessonExtras,
  courseNeeds,
  extraQuestions,
  isEligible,
  lessonNeed,
} from "./extras";
import {
  britishProblems,
  existingKeys,
  listeningGate,
  speakGate,
  transcriptVariants,
  spokenOf,
  translateGate,
  type GateContext,
} from "./gates";
import { homophonePairs } from "./homophones";
import { checkedApply, parseItemId, toReviewItem } from "./panel";
import { parseDraft, selectPilot } from "./draft";
import {
  LESSON_MIX_CAP_USD,
  openLessonMixLedger,
  refuseIfOver,
  remainingUnderCap,
  reserveWithinCap,
} from "./ledger";

const lesson = (id: string, types: string[]): Lesson => ({
  id,
  title: id,
  subtitle: "",
  questions: types.map((t, i) =>
    t === "mc"
      ? { id: `q${i}`, type: "mc", prompt: "p", choices: ["a", "b"], answer: 0, explanation: "e" }
      : t === "listening"
        ? {
            id: `q${i}`,
            type: "listening",
            prompt: "p",
            audioText: "a b c",
            choices: ["a b c", "a b d"],
            answer: "a b c",
            explanation: "e",
          }
        : {
            id: `q${i}`,
            type: "translate",
            prompt: "p",
            acceptableAnswers: ["x y"],
            explanation: "e",
          },
  ) as Lesson["questions"],
});
const unit = (id: string, level: Unit["level"], lessons: Lesson[]): Unit => ({
  id,
  level,
  eyebrow: "",
  title: id,
  description: "",
  lessons,
});

describe("lessonNeed: listening and translate everywhere, speak on every other eligible lesson", () => {
  it("asks for speak only in a speak slot", () => {
    const l = lesson("l", ["mc", "mc"]);
    expect(lessonNeed(l, true)).toEqual(["listening", "speak", "translate"]);
    expect(lessonNeed(l, false)).toEqual(["listening", "translate"]);
  });
  it("never asks for a type the lesson already has, and skips a dedicated pack", () => {
    expect(lessonNeed(lesson("l", ["mc", "listening", "translate"]), false)).toEqual([]);
    expect(lessonNeed(lesson("l", ["mc", "listening", "translate"]), true)).toEqual(["speak"]);
    const pack = lesson("p", ["listening", "listening"]);
    expect(isEligible(pack)).toBe(false);
    expect(lessonNeed(pack, true)).toEqual([]);
  });
  it("courseNeeds alternates along the eligible lessons, across unit borders, skipping packs", () => {
    const units = [
      unit("a", "A1", [lesson("l1", ["mc"]), lesson("p1", ["listening"]), lesson("l2", ["mc"])]),
      unit("b", "A1", [lesson("l3", ["mc"]), lesson("l4", ["mc"]), lesson("l5", ["mc"])]),
    ];
    const n = courseNeeds(units);
    const speak = ["l1", "l2", "l3", "l4", "l5"].map((id) => n.get(id)!.includes("speak"));
    expect(speak).toEqual([true, false, true, false, true]);
    expect(n.has("p1")).toBe(false);
  });
});

describe("addLessonExtras: the server's 50-question cap", () => {
  it("throws when appending would pass 50 questions", () => {
    const full = unit("u", "A1", [
      lesson(
        "big",
        Array.from({ length: 48 }, () => "mc"),
      ),
    ]);
    const rec = {
      listening: {
        prompt: "What did you hear?",
        audioText: "I see a cat.",
        wrong: ["I see a hat.", "I see a bat.", "I see a mat."],
        explanation: 'The audio says "I see a cat."',
      },
      speak: { answer: "Good morning, teacher.", explanation: 'Say "Good morning, teacher."' },
      translate: {
        prompt: "Greet your teacher.",
        acceptableAnswers: ["Hello, teacher.", "Hi, teacher."],
        explanation: 'One way: "Hello, teacher."',
      },
    };
    expect(() => addLessonExtras([full], { big: rec })).toThrow(/at most 50/);
    expect(() => addLessonExtras([full], { big: { listening: rec.listening } })).not.toThrow();
  });
});

describe("addLessonExtras: append only", () => {
  const units = [unit("u", "A1", [lesson("l1", ["mc", "mc"]), lesson("l2", ["mc"])])];
  const record = {
    listening: {
      prompt: "What did you hear?",
      audioText: "I see a cat.",
      wrong: ["I see a hat.", "I see a bat.", "I see a mat."],
      explanation: 'The audio says "I see a cat."',
    },
    speak: { answer: "Good morning, teacher.", explanation: 'Say "Good morning, teacher."' },
    translate: {
      prompt: "Greet your teacher.",
      acceptableAnswers: ["Hello, teacher.", "Hi, teacher."],
      explanation: 'One way: "Hello, teacher."',
    },
  };
  it("appends listening, speak, translate after the existing questions, with fixed ids", () => {
    const out = addLessonExtras(units, { l1: record });
    expect(out[0]!.lessons[0]!.questions.map((q) => q.id)).toEqual([
      "q0",
      "q1",
      "lx1",
      "sx1",
      "tx1",
    ]);
    expect(out[0]!.lessons[1]!.questions).toHaveLength(1);
    // the input is untouched, and existing questions are the same objects (no id or answer moved)
    expect(units[0]!.lessons[0]!.questions).toHaveLength(2);
    expect(out[0]!.lessons[0]!.questions[0]).toBe(units[0]!.lessons[0]!.questions[0]);
  });
  it("puts the answer among four choices that are all the record's sentences", () => {
    const [l] = extraQuestions("l1", { listening: record.listening });
    expect(l!.type === "listening" && l!.choices.sort()).toEqual(
      ["I see a bat.", "I see a cat.", "I see a hat.", "I see a mat."].sort(),
    );
    expect(l!.type === "listening" && l!.answer).toBe("I see a cat.");
  });
  it("throws on a lesson that does not exist, or an id the lesson already has", () => {
    expect(() => addLessonExtras(units, { nope: record })).toThrow(/do not exist/);
    const dup = [
      unit("u", "A1", [
        {
          ...lesson("l1", ["mc"]),
          questions: [{ ...lesson("l1", ["mc"]).questions[0]!, id: "lx1" }],
        },
      ]),
    ];
    expect(() => addLessonExtras(dup, { l1: record })).toThrow(/already has/);
  });
  it("returns the units untouched when there are no extras", () => {
    expect(addLessonExtras(units, {})).toBe(units);
  });
});

describe("homophones", () => {
  it("English: see/sea, meet/meat", () => {
    expect(homophonePairs("en", "I see the sea.", "I see the see.").length).toBeGreaterThan(0);
    expect(homophonePairs("en", "We meet at noon.", "We meat at noon.").length).toBeGreaterThan(0);
    expect(homophonePairs("en", "She is a doctor.", "She is a driver.")).toHaveLength(0);
  });
  it("French: est/et, a/à, verb endings; a heard difference is fine", () => {
    expect(homophonePairs("fr", "Il est grand.", "Il et grand.").length).toBeGreaterThan(0);
    expect(homophonePairs("fr", "Elle a un chat.", "Elle à un chat.").length).toBeGreaterThan(0);
    expect(homophonePairs("fr", "Ils parlent bien.", "Il parle bien.").length).toBeGreaterThan(0);
    expect(homophonePairs("fr", "Tu parles bien.", "Tu parle bien.").length).toBeGreaterThan(0);
    expect(homophonePairs("fr", "Le dessus est propre.", "Le dessous est propre.")).toHaveLength(0);
  });
  it("Spanish: seseo, yeísmo, b/v, silent h, a tilde alone; ñ and rr are real differences", () => {
    expect(homophonePairs("es", "La casa es grande.", "La caza es grande.").length).toBeGreaterThan(
      0,
    );
    expect(homophonePairs("es", "Come pollo hoy.", "Come poyo hoy.").length).toBeGreaterThan(0);
    expect(homophonePairs("es", "Tengo un tubo.", "Tengo un tuvo.").length).toBeGreaterThan(0);
    expect(homophonePairs("es", "Dice hola ya.", "Dice ola ya.").length).toBeGreaterThan(0);
    expect(homophonePairs("es", "Él habla bien.", "El habla bien.").length).toBeGreaterThan(0);
    expect(homophonePairs("es", "Tengo un año.", "Tengo un ano.")).toHaveLength(0);
    expect(homophonePairs("es", "Mi perro come.", "Mi pero come.")).toHaveLength(0);
    expect(homophonePairs("es", "La casa es grande.", "La cosa es grande.")).toHaveLength(0);
  });
});

const ctx = (course: GateContext["course"], level: GateContext["level"] = "A1"): GateContext => ({
  course,
  level,
  existing: { listening: new Set(), speak: new Set(), translate: new Set() },
});
const goodListening = {
  prompt: "What did you hear?",
  audioText: "She works at the hospital.",
  wrong: ["She walks at the hospital.", "She works at the school.", "He works at the hospital."],
  explanation:
    '"She works at the hospital." puts the verb "works" in the third person; the other choices change one word.',
};

describe("listening gate", () => {
  it("passes a well-formed item", () => {
    expect(listeningGate(goodListening, ctx("en")).problems).toEqual([]);
  });
  it("fails each way on purpose", () => {
    const bad = (patch: object) =>
      listeningGate({ ...goodListening, ...patch }, ctx("en")).problems.join(" | ");
    expect(bad({ prompt: "Did you hear: She works at the hospital.?" })).toMatch(
      /prompt contains a choice/,
    );
    expect(
      bad({
        wrong: [
          "She works at the hospital.",
          "She works at the school.",
          "He works at the hospital.",
        ],
      }),
    ).toMatch(/same sentence/);
    expect(bad({ wrong: ["She walks at the hospital.", "She works at the school."] })).toMatch(
      /exactly 3/,
    );
    expect(
      bad({
        wrong: [
          "She works at the hospital here.",
          "She works at the school.",
          "He works at the hospital.",
        ],
      }),
    ).toMatch(/words/);
    expect(
      bad({
        wrong: ["Their cat is big.", "She works at the school.", "He works at the hospital."],
      }),
    ).toMatch(/words|close variant/);
    expect(bad({ explanation: "She works there." })).toMatch(/quote the answer/);
    expect(
      bad({
        wrong: [
          "She works at the hospital!",
          "She works at the school.",
          "He works at the hospital.",
        ],
      }),
    ).toMatch(/punctuation|same sentence/);
  });
  it("rejects an English homophone, a Spanish seseo pair and a French est/et pair", () => {
    const en = {
      ...goodListening,
      audioText: "We meet at noon.",
      wrong: ["We meat at noon.", "We eat at noon.", "We meet at nine."],
      explanation: 'The audio says "We meet at noon."',
    };
    expect(listeningGate(en, ctx("en")).problems.join()).toMatch(/sound alike/);
    const es = {
      prompt: "¿Qué oíste?",
      audioText: "La casa es grande.",
      wrong: ["La caza es grande.", "La casa es pequeña.", "La mesa es grande."],
      explanation: 'El audio dice "La casa es grande."',
    };
    expect(listeningGate(es, ctx("es")).problems.join()).toMatch(/sound alike/);
    const fr = {
      prompt: "Qu'avez-vous entendu ?",
      audioText: "Il est grand.",
      wrong: ["Il et grand.", "Il est petit.", "Elle est grande."],
      explanation: 'The audio says "Il est grand."',
    };
    expect(listeningGate(fr, ctx("fr")).problems.join()).toMatch(/sound alike/);
  });
  it("rejects a sentence the course already listens to", () => {
    const c = ctx("en");
    c.existing.listening.add("she works at the hospital");
    expect(listeningGate(goodListening, c).problems.join()).toMatch(/duplicate/);
  });
  it("rejects English audio in the French course", () => {
    const l = { ...goodListening, wrong: goodListening.wrong };
    expect(listeningGate(l, ctx("fr")).problems.join()).toMatch(/English/);
  });
});

describe("speak gate: the round trip through the platform normalisers", () => {
  const good = (answer: string) => ({
    answer,
    explanation: `"${answer}" is a common polite phrase, and each word in it is spoken plainly.`,
  });
  it("passes plain phrases in each course", () => {
    expect(speakGate(good("Good morning, teacher."), ctx("en")).problems).toEqual([]);
    expect(speakGate(good("Bonjour, comment allez-vous ?"), ctx("fr")).problems).toEqual([]);
    expect(speakGate(good("¿Cómo te llamas?"), ctx("es")).problems).toEqual([]);
  });
  it("fails the hazards on purpose", () => {
    const p = (a: string, c: "en" | "fr" | "es" = "en") =>
      speakGate(good(a), ctx(c)).problems.join(" | ");
    expect(p("Hi")).toMatch(/3 to 12/);
    expect(p("One two three four five six seven eight nine ten eleven twelve thirteen")).toMatch(
      /3 to 12/,
    );
    expect(p("I have 3 cats at home")).toMatch(/digit/);
    expect(p("It costs twenty one dollars")).toMatch(/compound number/);
    expect(p("I live on the second floor")).toMatch(/ordinal/);
    expect(p("This is Sara's house")).toMatch(/possessive/);
    expect(p("Tengo cuarenta y dos años", "es")).toMatch(/compound number/);
  });
  it("round trip: every transcript variant of a correct phrase matches it", () => {
    for (const [a, c] of [
      ["She's a doctor", "en"],
      ["Il habite à Paris", "fr"],
      ["Hoy hace mucho calor", "es"],
    ] as const)
      for (const t of transcriptVariants(a)) {
        expect(speakGate({ answer: a, explanation: `"${a}"` }, ctx(c)).problems.join()).not.toMatch(
          /round trip/,
        );
        expect(t.length).toBeGreaterThan(0);
      }
  });
  it("the COURSE's normaliser matters: accents, elision and a spoken number grade correct", () => {
    // Each of these fails under a different course's normaliser, so swapping spokenOf goes red.
    const m = (c: "en" | "fr" | "es", said: string, answer: string) =>
      spokenOf[c].match(said, answer);
    expect(m("fr", "ou est l'ecole", "Où est l'école ?")).toBe(true);
    expect(m("fr", "j ai vingt ans", "J'ai vingt ans.")).toBe(true);
    expect(m("fr", "j'ai 20 ans", "J'ai vingt ans.")).toBe(true);
    expect(m("es", "como estas hoy", "¿Cómo estás hoy?")).toBe(true);
    expect(m("es", "tengo 5 gatos", "Tengo cinco gatos.")).toBe(true);
    expect(m("en", "i have 2 cats at home", "I have two cats at home.")).toBe(true);
    // and the gate itself uses them for these phrases
    expect(
      speakGate(
        { answer: "Où est l'école ?", explanation: `"Où est l'école ?"` },
        ctx("fr"),
      ).problems.join(),
    ).not.toMatch(/round trip/);
    expect(
      speakGate(
        { answer: "¿Cómo estás hoy?", explanation: `"¿Cómo estás hoy?"` },
        ctx("es"),
      ).problems.join(),
    ).not.toMatch(/round trip/);
  });
  it("rejects a phrase the course already has, and an unquoted explanation", () => {
    const c = ctx("en");
    c.existing.speak.add("good morning teacher");
    expect(speakGate(good("Good morning, teacher."), c).problems.join()).toMatch(/duplicate/);
    expect(
      speakGate(
        { answer: "Good morning, teacher.", explanation: "A greeting." },
        ctx("en"),
      ).problems.join(),
    ).toMatch(/quote the answer/);
  });
});

describe("translate gate", () => {
  const good = {
    prompt: "Ask where the station is.",
    acceptableAnswers: [
      "Where is the station?",
      "Could you tell me where the station is?",
      "Can you tell me where the station is?",
    ],
    explanation:
      '"Where is the station?" asks for a place with "where" and the verb "is", the usual way to ask a stranger.',
  };
  it("passes a good item", () => {
    expect(translateGate(good, ctx("en")).problems).toEqual([]);
  });
  it("fails each way on purpose", () => {
    const p = (patch: object, c = ctx("en")) =>
      translateGate({ ...good, ...patch }, c).problems.join(" | ");
    expect(p({ acceptableAnswers: ["Where is the station?"] })).toMatch(/at least 2/);
    // "Where is" and "Where's" are one wording to the grader, so this list is really two.
    expect(
      p({
        acceptableAnswers: [
          "Where is the station?",
          "Where's the station?",
          "Could you tell me where the station is?",
        ],
      }),
    ).toMatch(/at least 3/);
    expect(p({ acceptableAnswers: ["Where is the station?", "where is the station"] })).toMatch(
      /same after normalising/,
    );
    expect(
      p({
        acceptableAnswers: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map(
          (x) => `Where is the station ${x}?`,
        ),
      }),
    ).toMatch(/at most 9/);
    expect(p({ prompt: "Say: Where is the station?" })).toMatch(/prompt contains/);
    expect(
      p({ acceptableAnswers: ["Estoy cansado(a).", "Estoy muy cansado."] }, ctx("es")),
    ).toMatch(/\(e\) gender trick|gender/);
    expect(p({ explanation: "Asking for a place." })).toMatch(/quote the answer/);
    const c = ctx("en");
    c.existing.translate.add("where is the station");
    expect(p({}, c)).toMatch(/duplicate/);
  });
  it("counts words per level: a long A1 wording is a warning, a very long one fails", () => {
    const long = "Excuse me could you please tell me where the big train station is today";
    expect(
      translateGate(
        { ...good, acceptableAnswers: [long, "Where is the station?"], explanation: `"${long}"` },
        ctx("en", "A1"),
      ).warnings.join(),
    ).toMatch(/usually stays within/);
    const veryLong = Array(30).fill("word").join(" ");
    expect(
      translateGate(
        {
          ...good,
          acceptableAnswers: [veryLong, "Where is the station?"],
          explanation: `"${veryLong}"`,
        },
        ctx("en", "A1"),
      ).problems.join(),
    ).toMatch(/at most/);
  });
  it("B1 to C1 want three wordings (a warning at two)", () => {
    const two = { ...good, acceptableAnswers: ["Where is the station?", "Where's the station?"] };
    expect(translateGate(two, ctx("en", "B1")).warnings.join()).toMatch(/3 or more/);
    expect(translateGate(two, ctx("en", "A1")).warnings.join()).not.toMatch(/or more/);
  });
});

describe("existingKeys", () => {
  it("collects what the course already says", () => {
    const k = existingKeys([unit("u", "A1", [lesson("l", ["mc", "listening", "translate"])])]);
    expect(k.listening.has("a b c")).toBe(true);
    expect(k.translate.has("x y")).toBe(true);
  });
});

describe("the spoken-answer normalisers match the edge-function copies the server grades with", () => {
  it("web and Deno copies agree on a spread of transcripts", async () => {
    const web = await Promise.all([
      import("../spoken-answer"),
      import("../spoken-answer-fr"),
      import("../spoken-answer-es"),
    ]);
    const edge = await Promise.all([
      import("../../../supabase/functions/_shared/spoken-answer"),
      import("../../../supabase/functions/_shared/spoken-answer-fr"),
      import("../../../supabase/functions/_shared/spoken-answer-es"),
    ]);
    const samples = [
      "I have 2 cats at home.",
      "She's a doctor",
      "Où est l'école ?",
      "j ai vingt ans",
      "J'ai 20 ans",
      "¿Cómo estás hoy?",
      "tengo 5 gatos",
      "Euh, bonjour",
    ];
    for (const [i, key] of ["normaliseSpoken", "normaliseSpokenFr", "normaliseSpokenEs"].entries())
      for (const t of samples)
        expect((edge[i] as never as Record<string, (x: string) => string>)[key]!(t)).toBe(
          (web[i] as never as Record<string, (x: string) => string>)[key]!(t),
        );
  });
});

describe("the ledger: US$60 hard cap, refused in code before anything is sent", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const open = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "lessonmix-"));
    dirs.push(d);
    return { d, ledger: openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror")) };
  };
  const meta = { phase: "t", provider: "anthropic", model: "m" };

  it("a stale instance cannot overwrite another process's entries (two providers, one file)", () => {
    const { d, ledger: a } = open();
    const b = openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"));
    a.reserve("anthropic-1", 5, meta);
    // b was opened before a's write: its write is refused, not merged over a's.
    expect(() => b.reserve("mistral-1", 1, { ...meta, provider: "mistral" })).toThrow(
      /changed on disk/,
    );
    // Re-opened (as the runner does inside its lock), both persist.
    const c = openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"));
    c.reserve("mistral-1", 1, { ...meta, provider: "mistral" });
    const again = openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"));
    expect(again.status().open.sort()).toEqual(["anthropic-1", "mistral-1"]);
    expect(again.status().openUsd).toBe(6);
  });

  it("is a US$60 cap across Anthropic and Mistral together", () => {
    const { ledger } = open();
    expect(ledger.status().capUsd).toBe(LESSON_MIX_CAP_USD);
    reserveWithinCap(ledger, "a", 40, meta);
    reserveWithinCap(ledger, "m", 15, { ...meta, provider: "mistral" });
    expect(remainingUnderCap(ledger)).toBeCloseTo(5);
  });
  it("refuses a projection over the cap and records nothing", () => {
    const { ledger } = open();
    reserveWithinCap(ledger, "a", 50, meta);
    expect(() => reserveWithinCap(ledger, "b", 10.01, meta)).toThrow(CapExceededError);
    expect(ledger.status().openUsd).toBe(50);
    expect(ledger.entries().filter((e) => e.ref === "b")).toHaveLength(0);
    reserveWithinCap(ledger, "c", 10, meta); // exactly the rest fits
  });
  it("counts settled spend, not just reservations", () => {
    const { ledger } = open();
    reserveWithinCap(ledger, "a", 30, meta);
    ledger.settle("a", 29.5);
    expect(() => reserveWithinCap(ledger, "b", 30.6, meta)).toThrow(CapExceededError);
    reserveWithinCap(ledger, "c", 30.5, meta);
  });
  it("refuseIfOver says no to a plan that cannot fit, without reserving", () => {
    const { ledger } = open();
    expect(refuseIfOver(ledger, 59.99)).toBe(false);
    expect(refuseIfOver(ledger, 60.01)).toBe(true);
    expect(ledger.entries()).toHaveLength(0);
  });
  it("editing the file's cap to 99 cannot raise the cap above 60", () => {
    const { d, ledger } = open();
    void ledger;
    for (const f of [path.join(d, "state", "ledger.json"), path.join(d, "mirror", "ledger.json")]) {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      j.capUsd = 99;
      fs.writeFileSync(f, JSON.stringify(j));
    }
    const edited = openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"));
    expect(() => reserveWithinCap(edited, "x", 60.01, meta)).toThrow(CapExceededError);
    reserveWithinCap(edited, "y", 60, meta);
  });
  it("a ledger deleted next to a started run is refused, never recreated empty", () => {
    const { d } = open();
    const l = openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"));
    reserveWithinCap(l, "a", 1, meta);
    fs.rmSync(path.join(d, "state", "ledger.json"));
    fs.rmSync(path.join(d, "mirror", "ledger.json"));
    expect(() => openLessonMixLedger(path.join(d, "state"), path.join(d, "mirror"))).toThrow(
      /started/,
    );
  });
  it("does not use the closure run's ledger files", () => {
    const { d } = open();
    expect(fs.existsSync(path.join(d, "state", "ledger-anthropic.json"))).toBe(false);
  });
});

describe("parseDraft", () => {
  it("reads only the asked types and reports a missing one", () => {
    const reply = JSON.stringify({
      translate: { prompt: "p", acceptableAnswers: ["a b", "c d"], explanation: '"a b"' },
    });
    const { extra, errors } = parseDraft("```json\n" + reply + "\n```", ["translate", "listening"]);
    expect(extra.translate?.acceptableAnswers).toEqual(["a b", "c d"]);
    expect(errors).toEqual(["missing listening"]);
  });
  it("never invents a record from prose", () => {
    expect(parseDraft("Sorry, I cannot.", ["speak"]).errors[0]).toMatch(/no JSON/);
  });
});

describe("selectPilot", () => {
  it("draws the same number per level, with speak and no-speak lessons at every level", () => {
    const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
    const units = levels.flatMap((lv) => [
      unit(
        `${lv}u1`,
        lv,
        Array.from({ length: 5 }, (_, i) => lesson(`${lv}l${i}`, ["mc", "mc"])),
      ),
    ]);
    const picks = selectPilot(units, "fr", 3, (id) => id.length);
    expect(picks).toHaveLength(15);
    for (const lv of levels) {
      const at = picks.filter((p) => p.level === lv);
      expect(at).toHaveLength(3);
      expect(at.some((p) => p.need.includes("speak"))).toBe(true);
      expect(at.some((p) => !p.need.includes("speak"))).toBe(true);
    }
  });
});

describe("panel glue", () => {
  const rec = {
    translate: {
      prompt: "Greet your teacher.",
      acceptableAnswers: ["Hello, teacher.", "Hi, teacher."],
      explanation: 'One way: "Hello, teacher."',
    },
  };
  it("builds a review item whose id parses back, and applies a checked patch", () => {
    const item = toReviewItem({
      course: "en",
      level: "A1",
      lessonId: "u1l1",
      lessonTitle: "Saying Hello",
      type: "translate",
      extra: rec,
    })!;
    expect(item.id).toBe("en:question:u1l1/tx1");
    expect(parseItemId(item.id)).toEqual({ course: "en", lessonId: "u1l1", type: "translate" });
    const ok = checkedApply(item, "translate", rec, {
      id: item.id,
      patch: { acceptableAnswers: ["Hello, teacher.", "Hi, teacher.", "Good morning, teacher."] },
      reason: "r",
    });
    expect(ok.refused).toEqual([]);
    expect(ok.extra.translate?.acceptableAnswers).toHaveLength(3);
    // an id or type change is refused by the closure run's checker
    const bad = checkedApply(item, "translate", rec, {
      id: item.id,
      patch: { type: "mc" },
      reason: "r",
    });
    expect(bad.refused.length).toBeGreaterThan(0);
    expect(bad.extra).toBe(rec);
  });
});

describe("stripLessonExtras: the tooling sees the lessons as they were", () => {
  it("removes exactly the appended ids and gives the same needs back", async () => {
    const { stripLessonExtras } = await import("./extras");
    const base = [unit("u", "A1", [lesson("l1", ["mc", "mc"])])];
    const withExtras = addLessonExtras(base, {
      l1: {
        listening: {
          prompt: "p",
          audioText: "a b c",
          wrong: ["a b d", "a b e", "a b f"],
          explanation: '"a b c" e',
        },
        translate: { prompt: "p", acceptableAnswers: ["x y", "y x"], explanation: '"x y" e' },
      },
    });
    expect(withExtras[0]!.lessons[0]!.questions.length).toBe(4);
    const stripped = stripLessonExtras(withExtras);
    expect(stripped[0]!.lessons[0]!.questions.map((q) => q.id)).toEqual(["q0", "q1"]);
    expect([...courseNeeds(stripped).values()]).toEqual([...courseNeeds(base).values()]);
  });
});

describe("listening gate: French spacing before ? ! : ;", () => {
  const fr = (a: string, w: string[]) => ({
    prompt: "What did you hear?",
    audioText: a,
    wrong: w,
    explanation: `"${a}" is a question with "comment" and the reflexive "vous appelez"; listen for the question word.`,
  });
  it("accepts the French space before a question mark, still rejects it in English", () => {
    const item = fr("Comment vous appelez-vous ?", [
      "Pourquoi vous appelez-vous ?",
      "Quand vous appelez-vous ?",
      "Où vous appelez-vous ?",
    ]);
    expect(listeningGate(item, ctx("fr")).problems.join("|")).not.toMatch(/space before/);
    const en = {
      ...item,
      audioText: "What is your name ?",
      wrong: ["Who is your name ?", "Where is your name ?", "When is your name ?"],
    };
    expect(listeningGate(en, ctx("en")).problems.join("|")).toMatch(/space before/);
  });
});

describe("gates the consistency tests forced: American English, repeats, minimal pairs", () => {
  it("rejects a British word anywhere in an English item, and not in French", () => {
    const t = {
      prompt: "Say that you must retake the exam.",
      acceptableAnswers: [
        "I have to retake the exam.",
        "I must resit the exam.",
        "I need to retake the exam.",
      ],
      explanation:
        '"I have to retake the exam." uses "have to" for a duty and "retake" for doing it again.',
    };
    expect(translateGate(t, ctx("en")).problems.join("|")).toMatch(/resit.*British/);
    expect(britishProblems("fr", ["resit"])).toEqual([]);
  });
  it("rejects a text another question already has, compared the way the consistency test does", () => {
    const c: GateContext = {
      ...ctx("en"),
      existing: { ...ctx("en").existing, all: new Set(["i take a nap after lunch."]) },
    };
    const r = speakGate(
      {
        answer: "I take a nap after lunch.",
        explanation:
          '"I take a nap after lunch." uses the present simple for a daily habit with "after".',
      },
      c,
    );
    expect(r.problems.join("|")).toMatch(/another question/);
  });
  it("asks for nothing in the Spanish Minimal Pairs lessons (a dedicated pack)", () => {
    expect(NO_EXTRAS_LESSONS.has("esa1p28l3")).toBe(true);
    expect(lessonNeed({ ...lesson("esa1p28l3", ["mc", "mc"]) }, true)).toEqual([]);
  });
});
