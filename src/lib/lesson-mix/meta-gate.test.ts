import { describe, expect, it } from "vitest";
import { metaTextProblems } from "./meta-gate";
import { listeningGate, speakGate, translateGate, type GateContext } from "./gates";

const ctx = (course: GateContext["course"] = "en"): GateContext => ({
  course,
  level: "A2",
  existing: { listening: new Set(), speak: new Set(), translate: new Set() },
});
const ans = "The cat sleeps on the sofa";
const good = `"${ans}" uses the present simple for a habit, and "on" says where the cat is.`;

describe("metaTextProblems: text addressed to us instead of to the learner", () => {
  it("accepts a real explanation", () => {
    expect(metaTextProblems(good, "explanation", ans)).toEqual([]);
  });

  const bad: [string, string][] = [
    ["the learner", `The learner reads this aloud: "${ans}" uses the present simple.`],
    ["the user", `"${ans}" is what the user should say to ask for a seat.`],
    ["this item", `This item checks the present simple in "${ans}".`],
    ["this question", `This question tests "${ans}" and the word on.`],
    ["reads aloud", `"${ans}" is a phrase you read aloud with a falling tone at the end.`],
    ["say it slowly", `Say it slowly: "${ans}" has four stressed words in a row.`],
    ["the prompt", `The prompt asks for "${ans}", a sentence with the verb sleeps.`],
    ["the distractors", `"${ans}" is right; the distractors change one word of it only.`],
    ["the answer key", `The answer key is "${ans}" because it keeps sleeps.`],
    ["first wording", `The first wording, "${ans}", is the plainest way to say it.`],
    ["a placeholder", `"${ans}" uses [the whole sentence] with the present simple tense.`],
    ["the lesson", `"${ans}" uses words from this lesson about the home and pets.`],
    ["a level tag", `"${ans}" is a typical A1 sentence about pets at home.`],
    ["an instruction to us", `Make sure the answer "${ans}" keeps the verb in the third person.`],
  ];
  for (const [name, text] of bad)
    it(`rejects: ${name}`, () => {
      expect(metaTextProblems(text, "explanation", ans).length).toBeGreaterThan(0);
    });

  it("rejects 'this phrase uses' followed by the whole sentence", () => {
    expect(
      metaTextProblems(`This phrase uses "${ans}".`, "explanation", ans).length,
    ).toBeGreaterThan(0);
  });
  it("rejects an explanation that only restates the target sentence", () => {
    expect(metaTextProblems(`"${ans}".`, "explanation", ans).length).toBeGreaterThan(0);
    expect(
      metaTextProblems(`The speaker says "${ans}".`, "explanation", ans).length,
    ).toBeGreaterThan(0);
    expect(
      metaTextProblems(`The sentence is "${ans}".`, "explanation", ans).length,
    ).toBeGreaterThan(0);
  });

  it("false-positive pins: the words live inside the quoted target sentence", () => {
    const a = "The learner reads the book aloud";
    expect(
      metaTextProblems(
        `"${a}" puts the habit of reading first, with "reads" in the third person singular.`,
        "explanation",
        a,
      ),
    ).toEqual([]);
    const b = "The user guide is on the table";
    expect(
      metaTextProblems(
        `"${b}" names an object and a place, with "on" for its position.`,
        "explanation",
        b,
      ),
    ).toEqual([]);
  });
  it("false-positive pins: ordinary prompts about students, items and questions", () => {
    expect(
      metaTextProblems("Tell the teacher that the students are in the classroom.", "prompt"),
    ).toEqual([]);
    expect(metaTextProblems("Ask the shop assistant if the item is in stock.", "prompt")).toEqual(
      [],
    );
    expect(metaTextProblems("Ask a polite question about the price.", "prompt")).toEqual([]);
    expect(metaTextProblems("What did you hear?", "prompt")).toEqual([]);
  });
  it("rejects meta in a prompt", () => {
    expect(
      metaTextProblems("The learner must say that the room is clean.", "prompt").length,
    ).toBeGreaterThan(0);
    expect(
      metaTextProblems("Write the target sentence for this item.", "prompt").length,
    ).toBeGreaterThan(0);
    expect(
      metaTextProblems("Translate [sentence] into the course language.", "prompt").length,
    ).toBeGreaterThan(0);
  });
});

describe("the type gates use it", () => {
  const listening = (explanation: string, prompt = "What did you hear?") => ({
    prompt,
    audioText: "We usually eat dinner at seven",
    wrong: [
      "We usually eat dinner at eleven",
      "We usually eat breakfast at seven",
      "We usually eat dinner at seven",
    ]
      .slice(0, 2)
      .concat(["We usually eat lunch at seven"]),
    explanation,
  });
  it("fails a listening item with a meta explanation, passes a clean one", () => {
    const meta = listeningGate(
      listening('The learner hears "We usually eat dinner at seven" and picks it.'),
      ctx(),
    );
    expect(meta.problems.join("|")).toMatch(/meta|addressed/i);
    const ok = listeningGate(
      listening(
        '"We usually eat dinner at seven" fixes the meal and the hour: listen for "seven".',
      ),
      ctx(),
    );
    expect(ok.problems.filter((p) => /meta|addressed/i.test(p))).toEqual([]);
  });
  it("fails a speak item that reads aloud", () => {
    const r = speakGate(
      {
        answer: "I like fresh orange juice",
        explanation: 'Read "I like fresh orange juice" aloud.',
      },
      ctx(),
    );
    expect(r.problems.join("|")).toMatch(/meta|addressed/i);
  });
  it("fails a translate prompt and a translate explanation with meta text", () => {
    const base = {
      prompt: "Say that you like tea.",
      acceptableAnswers: ["I like tea.", "I do like tea."],
      explanation: '"I like tea." says it simply with the present simple.',
    };
    expect(translateGate(base, ctx()).problems.filter((p) => /meta|addressed/i.test(p))).toEqual(
      [],
    );
    expect(
      translateGate(
        { ...base, prompt: "The learner says that they like tea." },
        ctx(),
      ).problems.join("|"),
    ).toMatch(/meta|addressed/i);
    expect(
      translateGate(
        { ...base, explanation: 'The first wording, "I like tea.", is canonical.' },
        ctx(),
      ).problems.join("|"),
    ).toMatch(/meta|addressed/i);
  });
});
