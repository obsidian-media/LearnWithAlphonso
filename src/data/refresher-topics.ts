import type { Course } from "./courses";

/**
 * Which earlier lessons train a weakness category (the learning path's "refresher", docs/superpowers/specs/
 * 2026-11-12-learning-path-design.md, v2). The curriculum carries no grammar tags, only unit titles, so this is a small
 * explicit table: per course, a weakness category (the English taxonomy in weakness-detection.server.ts, or the French
 * and Spanish topic slugs in call-recap.ts) maps to patterns matched against UNIT TITLES. A category with no row here
 * simply gets no refresher (it still counts in "Fix your weak spots"). refresher-topics.test.ts pins that every pattern
 * matches a real unit and every category is a real one, so a renamed unit cannot silently orphan a row.
 */
export const REFRESHER_UNIT_PATTERNS: Record<Course, Record<string, RegExp>> = {
  en: {
    "past-tense": /past simple|irregular past|talking about the past|past continuous|yesterday/i,
    prepositions: /prepositions/i,
    "subject-verb-agreement": /to be & present simple/i,
    plurals: /^plurals$/i,
    "question-formation": /^questions$|question tags/i,
    "modal-verbs": /modal verbs/i,
    comparatives: /comparatives|comparisons|superlatives/i,
    conditionals: /conditionals|if & would|wish & if only/i,
    "phrasal-verbs": /phrasal verbs/i,
    "vocabulary-choice": /confusable words|collocations/i,
  },
  fr: {
    "gender-agreement": /adjectives & descriptions|possessive adjectives/i,
    "verb-conjugation": /common verbs|reflexive verbs/i,
    prepositions: /prepositions|verbs \+ prepositions/i,
    negation: /^negation$/i,
    pronouns: /pronouns|^y and en$/i,
    "tense-choice":
      /passé composé|imparfait|futur simple|conditionnel présent|aller \+ infinitive/i,
  },
  es: {
    "ser-estar": /ser vs\. estar/i,
    "gender-agreement": /adjective agreement/i,
    "verb-conjugation": /common verbs|common irregular verbs|reflexive verbs/i,
    "por-para": /por vs\. para/i,
    "small-words": /basic prepositions|prepositions of time/i,
    "tense-choice": /past tense|future tense|present perfect|preterite vs\. imperfect/i,
    pronouns: /pronouns|gustar/i,
  },
};

/** The skill a weakness category belongs to, for "this skill is already weak" (a vocabulary category or grammar). */
export function categorySkill(category: string): "vocabulary" | "grammar" {
  return category === "vocabulary-choice" || category === "spelling" ? "vocabulary" : "grammar";
}

/** The refresher pattern for a category in a course, or null when no unit trains it. */
export function refresherPattern(course: Course, category: string): RegExp | null {
  return REFRESHER_UNIT_PATTERNS[course][category] ?? null;
}
