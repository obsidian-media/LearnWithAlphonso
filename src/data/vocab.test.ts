import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { deriveVocab, deriveVocabWithContext, vocabForLesson } from "./vocab";
import type { Lesson, Question } from "./curriculum";

const mc: Question = {
  id: "q1",
  type: "mc",
  prompt: "She ___ happy.",
  choices: ["is", "am", "are"],
  answer: 0,
  explanation: "third person singular",
};

const fill: Question = {
  id: "q2",
  type: "fill",
  prompt: "I ___ coffee.",
  bank: ["drink", "drinks"],
  answer: "drink",
  explanation: "present simple",
};

const dupeMc: Question = { ...mc, id: "q3", prompt: "Different prompt but same answer:" };

const lesson: Lesson = {
  id: "l1",
  title: "Test lesson",
  subtitle: "",
  questions: [mc, fill, dupeMc],
};

describe("deriveVocab", () => {
  it("builds one vocab item per question, using the correct answer as the term", () => {
    const items = deriveVocab(lesson);
    expect(items.map((i) => i.term)).toEqual(["is", "drink"]);
  });

  it("dedupes terms case-insensitively", () => {
    const items = deriveVocab(lesson);
    expect(items.length).toBe(2);
  });

  it("fills the blank for fill-in questions", () => {
    const items = deriveVocab(lesson);
    expect(items[1].example).toBe("I drink coffee.");
  });

  it("fills the blank for a cloze multiple-choice question too", () => {
    const items = deriveVocab(lesson);
    expect(items[0].example).toBe("She is happy.");
  });

  it("never shows the quiz explanation as the meaning", () => {
    // The data carries no gloss for a word, only the explanation of why it was the
    // right answer ("'am' is correct here. Match the verb form to the subject."),
    // which is not what a word means. Nothing is better than that.
    const items = deriveVocab(lesson);
    for (const item of items) {
      expect(item.meaning).toBe("");
      expect(item.meaning).not.toBe("third person singular");
    }
  });

  it("shows no example when the prompt is a quiz stem rather than a sentence", () => {
    const stems = [
      'Plural of "baby": ___',
      'Which verb goes with "homework"? ___',
      'Opposite of "hot":',
      "Choose the correct word:",
    ];
    for (const prompt of stems) {
      const q: Question = {
        id: "s",
        type: "mc",
        prompt,
        choices: ["babies", "x", "y"],
        answer: 0,
        explanation: "e",
      };
      const [item] = deriveVocab({ id: "s", title: "", subtitle: "", questions: [q] });
      expect(item.example, prompt).toBe("");
    }
  });

  it("tidies the sentence: no space before punctuation, capital first letter, no bracket hint", () => {
    const one = (prompt: string, answer: string) => {
      const q: Question = {
        id: "t",
        type: "mc",
        prompt,
        choices: [answer, "x", "y"],
        answer: 0,
        explanation: "e",
      };
      return deriveVocab({ id: "t", title: "", subtitle: "", questions: [q] })[0].example;
    };
    expect(one("Is this seat ___ ?", "taken")).toBe("Is this seat taken?");
    expect(one("While we ___ , the phone rang.", "were talking")).toBe(
      "While we were talking, the phone rang.",
    );
    expect(one("___ I open the window, please?", "may")).toBe("May I open the window, please?");
    expect(one("Je ___ (boire) de l'eau.", "bois")).toBe("Je bois de l'eau.");
    expect(one("Yo ___ (hablar) español.", "hablo")).toBe("Yo hablo español.");
    expect(one("It's ___ past six. (30 min)", "half")).toBe("It's half past six.");
    // French puts a space before ? and ! on purpose; only the join with the answer is tidied.
    expect(one("Excusez-moi, où est la gare ? Et ___ ?", "vous")).toBe(
      "Excusez-moi, où est la gare ? Et vous?",
    );
  });

  it("has no spaced punctuation, lowercase start or bracket hint in any real example", () => {
    const bad: string[] = [];
    for (const lang of ["en", "fr", "es"] as const)
      for (const unit of getCourse(lang).curriculum)
        for (const l of unit.lessons)
          for (const item of deriveVocab(l)) {
            const e = item.example;
            if (!e) continue;
            if (/\s[,.;:]/.test(e) || (lang === "en" && /\s[?!]/.test(e)))
              bad.push(`${lang} spaced: ${e}`);
            if (/^\p{Ll}/u.test(e)) bad.push(`${lang} lowercase: ${e}`);
            if (/\([^)]*\)/.test(e)) bad.push(`${lang} hint: ${e}`);
          }
    expect(bad).toEqual([]);
  });

  it("uses the right a/an before the answer in every English question and example", () => {
    // Vowel letters that start a consonant sound (a university, a one-way ticket) and
    // consonant letters that start a vowel sound (an hour) are listed, not guessed.
    const consonantSound = /^(uni|use|usu|one|once|eu|ubiq)/i;
    const vowelSound = /^(hour|honest|honour|heir)/i;
    const wrongArticle = (article: string, word: string) => {
      const vowel = /^[aeiou]/i.test(word) ? !consonantSound.test(word) : vowelSound.test(word);
      return article.toLowerCase() === "a" ? vowel : !vowel;
    };
    const bad: string[] = [];
    for (const unit of getCourse("en").curriculum)
      for (const l of unit.lessons) {
        for (const q of l.questions) {
          if ((q.type !== "mc" && q.type !== "fill") || !q.prompt.includes("___")) continue;
          const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
          const m = /\b(a|an) ___/i.exec(q.prompt);
          if (m && wrongArticle(m[1]!, answer)) bad.push(`${q.id}: "${q.prompt}" -> ${answer}`);
        }
        for (const item of deriveVocab(l)) {
          for (const m of item.example.matchAll(/\b(a|an) (\p{L}+)/giu))
            if (wrongArticle(m[1]!, m[2]!)) bad.push(`example "${item.example}"`);
        }
      }
    expect(bad).toEqual([]);
  });

  it("never leaks quiz text into any derived card in the real English course", () => {
    const course = getCourse("en");
    const bad: string[] = [];
    for (const unit of course.curriculum)
      for (const l of unit.lessons)
        for (const item of deriveVocabWithContext(l)) {
          if (item.example.includes("___") || item.example.includes("→"))
            bad.push(`${l.id} ${item.term}: ${item.example}`);
          // A meaning is now authored (see vocab-meanings.test.ts); what must never come
          // back is the quiz explanation standing in for it.
          if (
            item.meaning !== "" &&
            (item.meaning === item.context || /is correct here/i.test(item.meaning))
          )
            bad.push(`${l.id} ${item.term}: meaning ${item.meaning}`);
        }
    expect(bad).toEqual([]);
  });

  it("uses the authored meaning and example, and falls back to the cloze sentence without one", () => {
    const authored: Question = {
      ...mc,
      id: "a1",
      meaning: "  the verb be, for she ",
      example: "She is kind.",
    };
    const meaningOnly: Question = { ...fill, id: "a2", meaning: "to have a drink" };
    const items = deriveVocab({ ...lesson, questions: [authored, meaningOnly] });
    expect(items[0]).toMatchObject({ meaning: "the verb be, for she", example: "She is kind." });
    expect(items[1]).toMatchObject({ meaning: "to have a drink", example: "I drink coffee." });
  });

  it("skips questions whose answer is blank", () => {
    const blankLesson: Lesson = {
      id: "l2",
      title: "",
      subtitle: "",
      questions: [{ ...mc, choices: [], answer: 0 }],
    };
    expect(deriveVocab(blankLesson)).toEqual([]);
  });
});

describe("vocabForLesson", () => {
  it("returns vocab for a real lesson in the English course", () => {
    const bundle = getCourse("en");
    const lessonId = bundle.allLessonIds[0];
    const items = vocabForLesson(lessonId, "en");
    expect(items.length).toBeGreaterThan(0);
  });

  it("returns an empty array for an unknown lesson id", () => {
    expect(vocabForLesson("does-not-exist", "en")).toEqual([]);
  });

  it("caches results per course:lesson key", () => {
    const bundle = getCourse("en");
    const lessonId = bundle.allLessonIds[1];
    const first = vocabForLesson(lessonId, "en");
    const second = vocabForLesson(lessonId, "en");
    expect(second).toBe(first);
  });
});
