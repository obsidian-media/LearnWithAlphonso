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

/** [title pattern, ranked rooms]. Copied from the owner-approved spec page, in its order. */
const RULES: [RegExp, string[]][] = [
  [/listening|minimal pairs/i, ["radio", "room-light", "room-dark"]],
  [/speaking/i, ["theatre", "smalltalk", "debate"]],
  [/write it yourself|letter|email|correspondence|writing/i, ["library", "office", "room-dark"]],
  [/say it your way/i, ["smalltalk", "coffee", "theatre"]],
  [/greet|everyday|polite|basic conversation|small talk/i, ["smalltalk", "coffee", "room-light"]],
  [/restaurant|dining|food|drink|eating|drinking/i, ["restaurant", "coffee", "kitchen"]],
  [/cook|kitchen|recipe|fruit|vegetable/i, ["kitchen", "market"]],
  [/cloth|wearing|colours & clothes/i, ["returns", "market"]],
  [/bank|post office|economy|finance/i, ["bank", "office"]],
  [/interview|cv/i, ["interview", "office"]],
  [/negotiat|business/i, ["negotiation", "office", "bank"]],
  [/shopping|money|supermarket|buying|how much|quantif|numbers/i, ["market", "returns", "bank"]],
  [/hotel|staying/i, ["hotel", "airport"]],
  [/travel|tourism/i, ["airport", "hotel", "seaside"]],
  [/transport|vehicles/i, ["station", "directions"]],
  [
    /direction|places|town|neighbourhood|out & about|out in the world|going places|coming from|arriving|city/i,
    ["directions", "station", "hotel"],
  ],
  [/health|doctor|body|medicine|wellness/i, ["doctor", "gym"]],
  [/sport|fitness|competition|leisure|hobbies|free time|weekend/i, ["gym", "garden", "smalltalk"]],
  [/appliance|technology|devices|internet|tech/i, ["techshop", "office"]],
  [
    /house|home|household|furniture|rooms|chores|housing|renting|real estate/i,
    ["apartment", "kitchen"],
  ],
  [/family|people|life events|character|personality/i, ["dining", "smalltalk"]],
  [/job|profession|occupation|work|office/i, ["office", "interview"]],
  [
    /routine|telling time|days|months|seasons|frequency|time expressions|prepositions of time|time & place|time & aspect/i,
    ["bedroom", "room-light"],
  ],
  [/weather|nature|outdoors|environment|climate|landscape|natural/i, ["garden", "seaside"]],
  [/animal/i, ["farm", "garden"]],
  [/school|classroom|education|learning/i, ["classroom", "library"]],
  [/media|news|journalism|reported speech|reporting/i, ["newsroom", "office"]],
  [/law|legal|crime|justice|civic|rights|administrative/i, ["courtroom", "chamber"]],
  [/politic|society|government|diplomatic|diplomacy/i, ["chamber", "debate"]],
  [/art|culture|literary|literature|narrative|rhetoric|style/i, ["gallery", "library", "theatre"]],
  [/science|scientific|process|trends/i, ["lab", "office"]],
  [/philosoph|abstract|academic|etymology|nominali|cohesion/i, ["library", "room-dark"]],
  [/opinion|ideas|agree|debate|suggestion|advice/i, ["debate", "coffee"]],
  [/feeling|emotion|reaction/i, ["smalltalk", "coffee", "garden"]],
  [/colou?rs|shapes|sizes|describ|adjectives/i, ["gallery", "returns"]],
  [/plans|invitation/i, ["coffee", "smalltalk"]],
  [
    /idiom|register|nuance|connect|hedg|euphemism|collocation|synonym|discourse|false friends|confusable|precision/i,
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
