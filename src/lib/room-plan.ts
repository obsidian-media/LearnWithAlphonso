/**
 * The rule that gives each unit its room (design system spec, "The room plan"). It runs once, in
 * scripts/gen-unit-rooms.ts, and the result is saved as data in src/data/unit-rooms.ts, where a writer may
 * override any unit by hand; src/lib/unit-rooms.test.ts checks the saved table, not this rule.
 *
 * 1. The first topic rule matching the unit title gives a ranked list of rooms.
 * 2. Skills units have their own rooms (radio for listening, theatre for speaking, library for writing).
 * 3. Grammar units with no topic use their level's study room (POOL).
 * 4. Two neighbouring units in a level never share a room: when the best room is the previous unit's, the next
 *    one on the list is used.
 * Rooms still being painted (PENDING_ROOMS) are planned but not used: the unit gets the first painted room from
 * the same list, then its level's FALLBACK, still never repeating its neighbour.
 */
import { LEVELS, type Level } from "@/data/levels";
import { PENDING_ROOMS, ROOMS } from "@/data/rooms";

/**
 * [title pattern, ranked rooms], from the owner-approved spec page, in its order. Every keyword is a whole word
 * (`\b` on both sides), because a bare stem matches inside other words: "art" in "Participle", "sport" in
 * "Transport", "tech" in "Technical". A stem meant to match its family says so with `\w*`.
 */
const RULES: [RegExp, string[]][] = [
  [/\b(?:listening|minimal pairs)\b/i, ["radio", "room-light", "room-dark"]],
  [/\bspeaking\b/i, ["theatre", "smalltalk", "debate"]],
  [
    /\b(?:write it yourself|letters?|e-?mails?|correspondence|writing)\b/i,
    ["library", "office", "room-dark"],
  ],
  [/\bsay it your way\b/i, ["smalltalk", "coffee", "theatre"]],
  [
    /\b(?:greet\w*|everyday|polite\w*|basic conversation|small talk)\b/i,
    ["smalltalk", "coffee", "room-light"],
  ],
  [
    /\b(?:restaurants?|dining|food|drinks?|eating|drinking)\b/i,
    ["restaurant", "coffee", "kitchen"],
  ],
  [/\b(?:cook\w*|kitchens?|recipes?|fruits?|vegetables?)\b/i, ["kitchen", "market"]],
  [/\b(?:cloth\w*|wearing|colours & clothes)\b/i, ["returns", "market"]],
  [/\b(?:bank\w*|post office|economy|finance)\b/i, ["bank", "office"]],
  [/\b(?:interviews?|cvs?)\b/i, ["interview", "office"]],
  [/\b(?:negotiat\w*|business)\b/i, ["negotiation", "office", "bank"]],
  [
    /\b(?:shopping|money|supermarkets?|buying|how much|quantif\w*|numbers)\b/i,
    ["market", "returns", "bank"],
  ],
  [/\b(?:hotels?|staying)\b/i, ["hotel", "airport"]],
  // The seaside room's brief: holidays, travel phrases, climate.
  [
    /\b(?:holidays?|vacations?|beach(?:es)?|seaside|summer|coast\w*|travel phrases)\b/i,
    ["seaside", "airport", "hotel"],
  ],
  [/\b(?:travel\w*|tourism)\b/i, ["airport", "hotel", "seaside"]],
  [/\b(?:transport\w*|vehicles?)\b/i, ["station", "directions"]],
  [
    /\b(?:directions?|places|towns?|neighbourhoods?|out & about|out in the world|going places|coming from|arriving|city)\b/i,
    ["directions", "station", "hotel"],
  ],
  [/\b(?:health\w*|doctors?|body|medicine|wellness)\b/i, ["doctor", "gym"]],
  [
    /\b(?:sports?|fitness|competitions?|leisure|hobbies|free time|weekends?)\b/i,
    ["gym", "garden", "smalltalk"],
  ],
  // "Literary & Narrative Devices" and "Rhetorical Devices & Style" are about writing, not gadgets.
  [
    /^(?!.*\b(?:literary|rhetoric\w*)\b).*\b(?:appliances?|technology|devices|internet|tech)\b/i,
    ["techshop", "office"],
  ],
  [
    /\b(?:house\w*|homes?|furniture|rooms|chores|housing|renting|real estate)\b/i,
    ["apartment", "kitchen"],
  ],
  [/\b(?:family|people|life events|characters?|personality)\b/i, ["dining", "smalltalk"]],
  [/\b(?:jobs?|profession\w*|occupations?|work(?:ing|place)?|office)\b/i, ["office", "interview"]],
  [/\bclimate\b/i, ["seaside", "garden"]],
  // Above the time rule, so "Weather & Seasons" is outdoors rather than in the bedroom.
  [/\b(?:weather|nature|outdoors|environment\w*|landscapes?|natural)\b/i, ["garden", "seaside"]],
  [
    /\b(?:routines?|telling time|days|months|seasons|frequency|time expressions|prepositions of time|time & place|time & aspect)\b/i,
    ["bedroom", "room-light"],
  ],
  [/\banimals?\b/i, ["farm", "garden"]],
  [/\b(?:schools?|classrooms?|education|learning)\b/i, ["classroom", "library"]],
  [/\b(?:media|news|journalism|reported speech|reporting)\b/i, ["newsroom", "office"]],
  [/\b(?:law|legal|crime|justice|civic|rights|administrative)\b/i, ["courtroom", "chamber"]],
  [/\b(?:politic\w*|society|government|diplomatic|diplomacy)\b/i, ["chamber", "debate"]],
  [
    /\b(?:arts?|museums?|painting|gallery|culture|literary|literature|narrative|rhetoric\w*|style)\b/i,
    ["gallery", "library", "theatre"],
  ],
  [/\b(?:science|scientific|process|trends)\b/i, ["lab", "office"]],
  [
    /\b(?:philosoph\w*|abstract|academic|etymology|nominali[sz]\w*|cohesion)\b/i,
    ["library", "room-dark"],
  ],
  [/\b(?:opinions?|ideas|agree\w*|debate|suggestions?|advice)\b/i, ["debate", "coffee"]],
  [/\b(?:feelings?|emotion\w*|reactions?)\b/i, ["smalltalk", "coffee", "garden"]],
  [/\b(?:colou?rs|shapes|sizes|describ\w*|adjectives)\b/i, ["gallery", "returns"]],
  [/\b(?:plans|invitations?)\b/i, ["coffee", "smalltalk"]],
  [
    /\b(?:idiom\w*|register|nuance\w*|connect\w*|hedg\w*|euphemisms?|collocations?|synonyms?|discourse|false friends|confusable|precision)\b/i,
    ["coffee", "library", "room-dark", "debate"],
  ],
];

/** Each level's study rooms, for grammar units with no topic. */
const POOL: Record<Level, string[]> = {
  A1: ["classroom", "room-light", "library"],
  A2: ["classroom", "room-light", "library"],
  B1: ["room-light", "coffee", "library"],
  B2: ["library", "room-dark", "coffee"],
  C1: ["library", "room-dark", "coffee"],
};

/** Painted rooms a unit falls back to while its planned room is still being painted. */
const FALLBACK: Record<Level, string[]> = {
  A1: ["room-light", "smalltalk", "coffee"],
  A2: ["room-light", "smalltalk", "coffee"],
  B1: ["room-light", "coffee", "smalltalk"],
  B2: ["room-dark", "coffee", "room-light"],
  C1: ["room-dark", "coffee", "room-light"],
};

export type PlanUnit = { id: string; level: Level; title: string };
export type PlannedUnit = PlanUnit & { planned: string; room: string };

/** The rooms that have art today: every room not in PENDING_ROOMS. */
export function roomsWithArt(): string[] {
  const pending = new Set<string>(PENDING_ROOMS);
  return ROOMS.map((r) => r.id).filter((id) => !pending.has(id));
}

const pick = (candidates: string[], previous: string | null) =>
  candidates.find((r) => r !== previous) ?? candidates[0];

/** Plans one course's units, level by level in curriculum order; returns them in input order. `painted` is the set of rooms with art. */
export function planUnitRooms(units: PlanUnit[], painted: Set<string>): PlannedUnit[] {
  const byId = new Map<string, PlannedUnit>();
  for (const { id: level } of LEVELS) {
    let prevPlanned: string | null = null;
    let prevRoom: string | null = null;
    for (const unit of units.filter((u) => u.level === level)) {
      const rule = RULES.find(([re]) => re.test(unit.title));
      const candidates = [...(rule ? rule[1] : []), ...POOL[level]];
      const planned = pick(candidates, prevPlanned);
      const usable = [
        ...new Set([...candidates.filter((r) => painted.has(r)), ...FALLBACK[level]]),
      ];
      const room = pick(usable, prevRoom);
      byId.set(unit.id, { ...unit, planned, room });
      prevPlanned = planned;
      prevRoom = room;
    }
  }
  return units.map((u) => byId.get(u.id)!);
}
