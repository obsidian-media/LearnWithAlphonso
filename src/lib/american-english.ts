/**
 * The English course is American English (owner decision 2026-11-06; docs/CONTENT-PLAYBOOK.md).
 * This module holds the word lists behind two things:
 *
 *   - `americanize`: the respelling used to write the American English review-fix patches
 *     (src/data/review-fixes/en.json, entries marked `americanEnglish`), word by word with the
 *     case of the original kept;
 *   - `britishFindings`: the gate (src/data/american-english.test.ts) that fails on a British
 *     spelling or British-only word in English learner-facing text.
 *
 * Only forms that are British-only (or that no American writes) are listed. A word both varieties
 * use (autumn, cinema, shop, post, trousers, football for the sport everyone else calls football)
 * is deliberately absent.
 */

/** British spelling -> American spelling. */
export const BRITISH_SPELLING: Readonly<Record<string, string>> = {
  colour: "color",
  colours: "colors",
  coloured: "colored",
  colourful: "colorful",
  colouring: "coloring",
  favourite: "favorite",
  favourites: "favorites",
  neighbour: "neighbor",
  neighbours: "neighbors",
  neighbourhood: "neighborhood",
  neighbourhoods: "neighborhoods",
  neighbouring: "neighboring",
  centre: "center",
  centres: "centers",
  theatre: "theater",
  theatres: "theaters",
  metre: "meter",
  metres: "meters",
  litre: "liter",
  litres: "liters",
  behaviour: "behavior",
  behaviours: "behaviors",
  flavour: "flavor",
  flavours: "flavors",
  harbour: "harbor",
  harbours: "harbors",
  humour: "humor",
  rumour: "rumor",
  rumoured: "rumored",
  honour: "honor",
  honours: "honors",
  labour: "labor",
  apologise: "apologize",
  apologised: "apologized",
  apologises: "apologizes",
  apologising: "apologizing",
  realise: "realize",
  realised: "realized",
  realises: "realizes",
  realising: "realizing",
  recognise: "recognize",
  recognised: "recognized",
  recognises: "recognizes",
  recognising: "recognizing",
  organise: "organize",
  organised: "organized",
  organises: "organizes",
  organising: "organizing",
  organisation: "organization",
  organisations: "organizations",
  authorise: "authorize",
  authorised: "authorized",
  criticise: "criticize",
  criticised: "criticized",
  analyse: "analyze",
  analysed: "analyzed",
  analyses: "analyzes",
  analysing: "analyzing",
  finalise: "finalize",
  finalised: "finalized",
  memorise: "memorize",
  memorised: "memorized",
  specialise: "specialize",
  specialised: "specialized",
  practise: "practice",
  practised: "practiced",
  practising: "practicing",
  grey: "gray",
  cheque: "check",
  cheques: "checks",
  travelling: "traveling",
  travelled: "traveled",
  traveller: "traveler",
  travellers: "travelers",
  cancelled: "canceled",
  cancelling: "canceling",
  labelled: "labeled",
  levelled: "leveled",
  judgement: "judgment",
  pyjamas: "pajamas",
  enquiry: "inquiry",
  enquire: "inquire",
  enquiries: "inquiries",
  sceptical: "skeptical",
  scepticism: "skepticism",
  burnt: "burned",
  cosy: "cozy",
  aeroplane: "airplane",
  offence: "offense",
  defence: "defense",
  licence: "license",
  maths: "math",
  programme: "program",
  programmes: "programs",
  jewellery: "jewelry",
  learnt: "learned",
  spelt: "spelled",
  whilst: "while",
  amongst: "among",
};

/** British-only everyday words -> the American word, safe whatever the sentence. */
export const BRITISH_WORDS: Readonly<Record<string, string>> = {
  petrol: "gas",
  timetable: "schedule",
  timetables: "schedules",
  rubber: "eraser",
  trolley: "cart",
  rubbish: "trash",
  mum: "mom",
  mummy: "mommy",
  sweets: "candy",
  motorway: "highway",
  motorways: "highways",
  pavement: "sidewalk",
  cooker: "stove",
  trainers: "sneakers",
  jumper: "sweater",
  jumpers: "sweaters",
  postman: "mail carrier",
  football: "soccer",
  footballs: "soccer balls",
  roundabout: "traffic circle",
  resit: "retake",
  flatmate: "roommate",
  flatmates: "roommates",
  takeaway: "takeout",
  lorry: "truck",
  nappy: "diaper",
  pram: "stroller",
  queue: "line",
  queues: "lines",
  GP: "doctor",
};

/** British phrases and noun uses that need the words around them to judge. */
export const BRITISH_PHRASES: readonly [RegExp, string][] = [
  [
    /\b(a|the|my|your|our|his|her|their|small|new|shared|big|nice|lovely|tiny|one-bedroom|two-bedroom|first|second|own|whole|entire|furnished|rent a|renting a|live in a|buy a|for a) flat\b/gi,
    "$1 apartment",
  ],
  [
    /\b(the|these|those|two|both|two small|their|our|your|many|some|the two|new|nearby)( \w+)? flats\b/gi,
    "$1$2 apartments",
  ],
  [/\bflat\b(?=-?(hunting|share|viewing))/gi, "apartment"],
  [/\bon holiday\b/gi, "on vacation"],
  [/\bholidays\b(?<!the holidays)/gi, "vacations"],
  [/\b(a|my|your|our|his|her|their|summer|winter|last|next|this|the) holiday\b/gi, "$1 vacation"],
  [/\bat the weekend\b/gi, "on the weekend"],
  [/\bin hospital\b/gi, "in the hospital"],
  [/\bcar park\b/gi, "parking lot"],
  [/\bsingle ticket\b/gi, "one-way ticket"],
  [/\bground floor\b/gi, "§FIRST§"],
  [/\bfirst floor\b/gi, "second floor"],
  [/§FIRST§/g, "first floor"],
  [/\b(the|a|at the) till\b/gi, "$1 register"],
  [/\b(the|a|in the|take the|took the) lift\b(?! up| it| them| weights| heavy)/gi, "$1 elevator"],
  [/\bbins\b/gi, "trash cans"],
  [/\bqueue at the\b/gi, "line at the"],
  [/\bin the queue\b/gi, "in line"],
  [/\bthe queue\b/gi, "the line"],
  [/\ba queue\b/gi, "a line"],
  [/\bqueues\b/gi, "lines"],
  [/\bin a queue\b/gi, "in a line"],
];

function matchCase(from: string, to: string): string {
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  if (from[0] === from[0]!.toUpperCase()) return to[0]!.toUpperCase() + to.slice(1);
  return to;
}

function mapWords(s: string, maps: readonly Readonly<Record<string, string>>[]): string {
  return s.replace(/[A-Za-z']+/g, (w) => {
    for (const m of maps) {
      const to = m[w.toLowerCase()] ?? m[w];
      if (to) return matchCase(w, to);
    }
    return w;
  });
}

/** One word (a reorder token, a card term): spelling and word lists only. */
export function americanizeWord(s: string): string {
  return mapWords(s, [BRITISH_SPELLING, BRITISH_WORDS]);
}

/** A sentence or phrase: spelling, words, then the phrase rules, then a/an before the new words. */
export function americanize(s: string): string {
  let t = mapWords(s, [BRITISH_SPELLING, BRITISH_WORDS]);
  for (const [re, to] of BRITISH_PHRASES) t = t.replace(re, to);
  return t.replace(/(?<![A-Za-z])([Aa]) (?=(eraser|apartment|elevator)(?![a-z]))/g, "$1n ");
}

/** Words the gate refuses: every spelling, and the British-only words that no American writes. */
const GATE_WORDS = new Set<string>([
  ...Object.keys(BRITISH_SPELLING),
  "petrol",
  "rubbish",
  "mum",
  "mummy",
  "trainers",
  "jumper",
  "jumpers",
  "motorway",
  "motorways",
  "pavement",
  "postman",
  "trolley",
  "takeaway",
  "lorry",
  "nappy",
  "pram",
  "flatmate",
  "flatmates",
  "cooker",
  "resit",
  "queue",
  "queues",
  "queuing",
  "queued",
  "roundabout",
]);

/** Noun uses and phrases the gate refuses (a word list cannot: "flat tire" is American). */
const GATE_PHRASES: readonly RegExp[] = [
  /\b(a|the|my|your|our|his|her|their|small|new|shared|big|nice|lovely|tiny|one-bedroom|two-bedroom|rent a|renting a|live in a|buy a|for a) flats?(?![\w-])/i,
  /\bflat(-?)(hunting|share|viewing|mate)/i,
  /\bon holiday\b/i,
  /\bat the weekend\b(?! market)/i,
  /\bin hospital\b/i,
  /\bcar park\b/i,
  /\bat the till\b/i,
  /\bsingle ticket\b/i,
];

/** Every British form found in `text` (lower case, de-duplicated). */
export function britishFindings(text: string): string[] {
  const found = new Set<string>();
  for (const w of text.match(/[A-Za-z']+/g) ?? [])
    if (GATE_WORDS.has(w.toLowerCase())) found.add(w.toLowerCase());
  for (const re of GATE_PHRASES) {
    const m = text.match(re);
    if (m) found.add(m[0].toLowerCase());
  }
  return [...found];
}
