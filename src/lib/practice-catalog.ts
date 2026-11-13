import { CAMPAIGNS, campaignPrompt, type Campaign } from "../data/campaigns";
import { CONTENT_COURSES, SCENARIOS, type ScenarioLevel } from "../data/scenarios";
import type { Course } from "../data/courses";
import { STAR_RULE, MAX_STARS } from "./practice-stars";

/**
 * What can earn stars, and how the server knows which one a call is. A call is identified by the system prompt the
 * client sends to /api/chat (already whitelisted there), never by a client field, so a call in one room cannot be
 * scored as another.
 *
 * Keys: a scenario is its id ("coffee"); a campaign scene is "<campaignId>/<sceneId>". The same keys are the
 * `item_key` column of public.practice_stars and public.practice_calls.
 */
export type PracticeKind = "scenario" | "scene";

export type PracticeItem = {
  kind: PracticeKind;
  key: string;
  course: Course;
  /** Replies that count as finishing the call (one star). */
  finishMinReplies: number;
};

export const sceneKey = (campaignId: string, sceneId: string) => `${campaignId}/${sceneId}`;

const ITEM_BY_PROMPT: ReadonlyMap<string, PracticeItem> = (() => {
  const map = new Map<string, PracticeItem>();
  for (const course of CONTENT_COURSES) {
    for (const s of SCENARIOS) {
      map.set(s.systemPrompt[course], {
        kind: "scenario",
        key: s.id,
        course,
        finishMinReplies: STAR_RULE.scenarioFinishMinReplies,
      });
    }
    for (const c of CAMPAIGNS) {
      for (const scene of c.scenes) {
        map.set(campaignPrompt(c.premise[course], scene.systemPrompt[course]), {
          kind: "scene",
          key: sceneKey(c.id, scene.id),
          course,
          finishMinReplies: scene.minTurns,
        });
      }
    }
  }
  return map;
})();

/** The scenario or campaign scene a whitelisted system prompt belongs to, or undefined. */
export function practiceItemForPrompt(systemPrompt: string): PracticeItem | undefined {
  return ITEM_BY_PROMPT.get(systemPrompt);
}

/** Every key that can hold stars, in catalog order. */
export function allPracticeKeys(): { kind: PracticeKind; key: string }[] {
  return [
    ...SCENARIOS.map((s) => ({ kind: "scenario" as const, key: s.id })),
    ...CAMPAIGNS.flatMap((c) =>
      c.scenes.map((s) => ({ kind: "scene" as const, key: sceneKey(c.id, s.id) })),
    ),
  ];
}

/** The most stars a learner can hold in one course: three per scenario and per campaign scene. */
export function maxStarsInCourse(): number {
  return allPracticeKeys().length * MAX_STARS;
}

// ---------------------------------------------------------------- rooms

const ROOMS = "/avatar/scenes";
export const roomUrl = (room: string) => `${ROOMS}/${room}.webp`;

/**
 * The painted room each campaign scene is played in (a scenario's room is its own id, see avatar/scenes.ts). Every
 * name is a file in public/avatar/scenes/ (pinned by practice-catalog.test.ts).
 */
export const SCENE_ROOMS: Readonly<Record<string, string>> = {
  "city-day/coffee-stop": "coffee",
  "city-day/directions": "directions",
  "city-day/small-talk": "market",
  "first-week-job/job-meet-team": "office",
  "first-week-job/job-find-way": "interview",
  "first-week-job/job-lunch-order": "restaurant",
  "first-week-job/job-coffee-chat": "coffee",
  "doctors-visit/doctor-book-phone": "bedroom",
  "doctors-visit/doctor-symptoms": "doctor",
  "doctors-visit/doctor-pharmacy": "returns",
  "train-trip/train-buy-ticket": "station",
  "train-trip/train-delay-help": "station",
  "train-trip/train-hotel-checkin": "hotel",
  "new-flat/flat-viewing": "apartment",
  "new-flat/flat-broken-heater": "kitchen",
  "new-flat/flat-neighbour": "directions",
  "market-day/market-plan-picnic": "smalltalk",
  "market-day/market-buy-food": "market",
  "market-day/market-picnic": "garden",
  "dinner-guest/dinner-arrive": "kitchen",
  "dinner-guest/dinner-table": "dining",
  "dinner-guest/dinner-goodbye": "apartment",
  "lost-bag/lost-ask-driver": "station",
  "lost-bag/lost-property-office": "returns",
  "lost-bag/lost-tell-friend": "smalltalk",
  "refund-return/refund-shop": "returns",
  "refund-return/refund-parcel": "techshop",
  "refund-return/refund-opinion": "coffee",
  "study-abroad/study-register": "office",
  "study-abroad/study-office-hours": "classroom",
  "study-abroad/study-group": "library",
  "gym-join/gym-sign-up": "gym",
  "gym-join/gym-class": "gym",
  "gym-join/gym-after-class": "coffee",
  "project-week/project-pitch": "office",
  "project-week/project-deadline": "negotiation",
  "project-week/project-update": "interview",
  "family-weekend/family-station": "station",
  "family-weekend/family-birthday-plan": "kitchen",
  "family-weekend/family-call": "bedroom",
};

export function sceneRoom(campaignId: string, sceneId: string): string {
  return roomUrl(SCENE_ROOMS[sceneKey(campaignId, sceneId)] ?? "room-light");
}

/** A campaign's cover: the room of its first scene. */
export function campaignCover(c: Campaign): string {
  return sceneRoom(c.id, c.scenes[0].id);
}

// ---------------------------------------------------------------- levels and weak spots

/** A learner's CEFR level as a scenario level: A1-A2 Beginner, B1-B2 Intermediate, C1 and above Advanced. */
export function scenarioLevelForCefr(cefr: string | null | undefined): ScenarioLevel {
  const c = (cefr ?? "A1").toUpperCase();
  if (c.startsWith("A")) return "Beginner";
  if (c.startsWith("B")) return "Intermediate";
  return "Advanced";
}

/**
 * What each weak spot is called on the hub, keyed by the weakness taxonomy (weakness-detection.server.ts's
 * WEAKNESS_TAXONOMY; the test pins the keys to it).
 */
export const WEAK_SPOT_NAMES: Readonly<Record<string, string>> = {
  "past-tense": "the past tense",
  articles: "articles",
  prepositions: "prepositions",
  "subject-verb-agreement": "verb agreement",
  plurals: "plurals",
  "question-formation": "asking questions",
  "modal-verbs": "can, could and would",
  "word-order": "word order",
  pronouns: "pronouns",
  comparatives: "comparisons",
  conditionals: "the conditional",
  "phrasal-verbs": "phrasal verbs",
  negation: "negatives",
  "vocabulary-choice": "choosing the right word",
  spelling: "spelling",
};

/**
 * The weak spots a scenario makes a learner use, so "Today's pick" can match one to the learner's top weak spot.
 * Every weak spot is exercised by at least one Beginner and one Intermediate scenario (pinned by the test).
 */
export const SCENARIO_FOCUS: Readonly<Record<string, readonly string[]>> = {
  coffee: ["question-formation", "articles", "plurals", "modal-verbs", "conditionals"],
  airport: ["question-formation", "prepositions", "pronouns", "spelling"],
  smalltalk: ["question-formation", "pronouns", "subject-verb-agreement", "word-order"],
  hotel: ["modal-verbs", "prepositions", "articles", "spelling", "phrasal-verbs"],
  directions: ["prepositions", "word-order", "question-formation"],
  returns: ["past-tense", "negation", "pronouns", "vocabulary-choice", "comparatives"],
  interview: ["past-tense", "comparatives", "phrasal-verbs", "word-order", "vocabulary-choice"],
  doctor: ["past-tense", "subject-verb-agreement", "prepositions", "negation", "pronouns"],
  restaurant: ["modal-verbs", "articles", "plurals", "conditionals"],
  apartment: ["question-formation", "comparatives", "conditionals", "prepositions", "spelling"],
  negotiation: ["conditionals", "modal-verbs", "comparatives", "vocabulary-choice"],
  debate: ["comparatives", "conditionals", "negation", "phrasal-verbs", "word-order"],
};

/** Persona line for the pre-call sheet ("Valeria, barista en Café La Ceiba"). */
export function personaOf(kind: PracticeKind, key: string, course: Course): string | undefined {
  if (kind === "scenario") return SCENARIOS.find((s) => s.id === key)?.persona[course];
  const [campaignId, sceneId] = key.split("/");
  return CAMPAIGNS.find((c) => c.id === campaignId)?.scenes.find((s) => s.id === sceneId)?.persona[
    course
  ];
}
