import { describe, expect, it } from "vitest";
import { curriculumEs } from "../data/curriculum-es";
import { curriculumFr } from "../data/curriculum-fr";
import { languageScores } from "../data/content-language";
import { courseLanguageSpans, splitExplanation, type SpanQuestion } from "./course-language-spans";

const fill = (prompt: string, answer: string, explanation: string): SpanQuestion => ({
  type: "fill",
  prompt,
  answer,
  explanation,
});

describe("courseLanguageSpans: what is course-language text in an explanation", () => {
  it("takes the target after the arrow when the prompt names the language", () => {
    const q = fill(
      'How do you say "hello" in French? ___',
      "Salut",
      "hello (informal) → Salut. Core greetings.",
    );
    expect(courseLanguageSpans(q)).toEqual(["Salut"]);
  });

  it("does not take the answer when the prompt does not name the direction", () => {
    const q = fill(
      'The idiom "tomber dans les pommes" means… ___',
      "to faint",
      'tomber → "to faint". Idioms.',
    );
    expect(courseLanguageSpans(q)).toEqual([]);
  });

  it("does not take the answer of a prompt that names the language but asks for the English meaning", () => {
    const q = fill(
      'The French word "pain" (a false friend) actually means… ___',
      "bread",
      'pain → "bread". Words.',
    );
    expect(courseLanguageSpans(q)).toEqual([]);
  });

  it("takes a multiple-choice answer by index", () => {
    const q: SpanQuestion = {
      type: "mc",
      prompt: 'The French word for "goodbye" is…',
      choices: ["Bonsoir", "Au revoir"],
      answer: 1,
      explanation: "goodbye → Au revoir. Greetings.",
    };
    expect(courseLanguageSpans(q)).toEqual(["Au revoir"]);
  });

  it("takes quoted course text for translate, listening and speak", () => {
    expect(
      courseLanguageSpans({
        type: "translate",
        prompt: "Greet someone.",
        acceptableAnswers: ["Bonjour.", "Salut"],
        explanation: 'One way to say it: "Bonjour." Everyday ideas.',
      }),
    ).toEqual(["Bonjour."]);
    expect(
      courseLanguageSpans({
        type: "listening",
        prompt: "What did you hear?",
        audioText: "Le dessus est propre.",
        choices: ["a", "b"],
        answer: "Le dessus est propre.",
        explanation: 'The audio says "Le dessus est propre." Sounds.',
      }),
    ).toEqual(["Le dessus est propre."]);
    expect(
      courseLanguageSpans({
        type: "speak",
        prompt: "Say this aloud:",
        answer: "À demain !",
        explanation: 'Target phrase: "À demain !" Phrases.',
      }),
    ).toEqual(["À demain !"]);
  });

  it("ignores the same letters inside an English word and unquoted occurrences", () => {
    const q = fill(
      'How do you say "yes" in Spanish? ___',
      "sí",
      "yes → sí. This is a sign, not a dessert.",
    );
    expect(courseLanguageSpans(q)).toEqual(["sí"]);
    const none = fill(
      'How do you say "yes" in Spanish? ___',
      "sí",
      "Say it with a sí in your voice.",
    );
    expect(courseLanguageSpans(none)).toEqual([]);
    const inside = fill('How do you say "no" in Spanish? ___', "no", "no → nope. Sentences.");
    expect(courseLanguageSpans(inside)).toEqual([]);
  });

  it("returns nothing for a question whose explanation never quotes the target", () => {
    expect(
      courseLanguageSpans({
        type: "speak",
        prompt: "p",
        answer: "Hola",
        explanation: "Nothing here.",
      }),
    ).toEqual([]);
  });
});

describe("splitExplanation", () => {
  it("marks only the course-language pieces", () => {
    expect(splitExplanation("hello → Salut. Core greetings.", ["Salut"])).toEqual([
      { text: "hello → ", course: false },
      { text: "Salut", course: true },
      { text: ". Core greetings.", course: false },
    ]);
    expect(
      splitExplanation('Target phrase: "À demain !" Fin.', ["À demain !"]).filter((p) => p.course),
    ).toEqual([{ text: "À demain !", course: true }]);
  });
});

describe("real curriculum: no allow-listed span reads as English", () => {
  for (const [name, curriculum] of [
    ["fr", curriculumFr],
    ["es", curriculumEs],
  ] as const) {
    it(`${name}: every span is more course-language than English, and spans exist`, () => {
      let spans = 0;
      const offenders: string[] = [];
      for (const unit of curriculum)
        for (const lesson of unit.lessons)
          for (const q of lesson.questions)
            for (const span of courseLanguageSpans(q)) {
              spans += 1;
              const s = languageScores(span);
              if (s.en > s[name]) offenders.push(`${q.id}: ${span}`);
            }
      expect(offenders).toEqual([]);
      expect(spans).toBeGreaterThan(400);
    });
  }
});
