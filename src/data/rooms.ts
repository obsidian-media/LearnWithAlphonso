/**
 * The rooms behind Alphonso (design system spec, "The room plan"): 35 painted scenes, one per unit topic. Each
 * room's art is `<id>.webp` in public/avatar/scenes, ios/LearnWithAlphonso/AlphonsoScenes and
 * android/LearnWithAlphonso/app/src/main/assets/scenes (the first 14 are the Practice call's scenes, the
 * other 21 the lesson rooms).
 * `brief` is the room's use, or the art brief it was painted from.
 */
export type Room = { id: string; name: string; brief: string };

export const ROOMS: readonly Room[] = [
  { id: "smalltalk", name: "Park café terrace", brief: "Greetings, everyday phrases, feelings" },
  { id: "coffee", name: "Café counter", brief: "Plans, opinions, register and idiom" },
  { id: "room-light", name: "Alphonso's study, day", brief: "A1 to B1 grammar" },
  { id: "room-dark", name: "Alphonso's study, night", brief: "B2 and C1 grammar" },
  { id: "restaurant", name: "Restaurant", brief: "Food, drink, ordering" },
  { id: "returns", name: "Clothes boutique", brief: "Clothes, colours, shopping" },
  { id: "directions", name: "Old-town street", brief: "Directions, places, going out" },
  { id: "airport", name: "Airport lounge", brief: "Travel and tourism" },
  { id: "hotel", name: "Hotel lobby", brief: "Staying, arriving" },
  { id: "apartment", name: "Empty apartment", brief: "House, home, renting" },
  { id: "doctor", name: "Doctor's office", brief: "Body, health, medicine" },
  { id: "interview", name: "Interview room", brief: "Jobs, CVs, interviews" },
  { id: "negotiation", name: "Meeting room", brief: "Business and negotiation" },
  { id: "debate", name: "Debate hall", brief: "Opinions, arguments" },
  {
    id: "classroom",
    name: "Classroom",
    brief:
      "A sunny classroom: chalkboard edge, wooden desk in front, a globe and a navy satchel. A1 and A2 grammar, school words.",
  },
  {
    id: "library",
    name: "Old library",
    brief:
      "Tall shelves in honey wood, a reading lamp with a gold shade, an open book on the desk. Writing, academic and literary units.",
  },
  {
    id: "kitchen",
    name: "Home kitchen",
    brief:
      "Tiled counter, copper pans, a bowl of lemons, a navy tea towel. Cooking, kitchen verbs, chores.",
  },
  {
    id: "market",
    name: "Market stall",
    brief:
      "Crates of fruit and vegetables under a cream awning, a brass scale, chalk price boards with no words. Food shopping, numbers, quantities.",
  },
  {
    id: "bank",
    name: "Bank and post office",
    brief:
      "A counter window, a stack of parcels, a gold bell, a navy postbox. Banking, post, money, economy.",
  },
  {
    id: "station",
    name: "Train station",
    brief:
      "A platform under a glass roof, a big station clock, a navy bench. Transport, city travel.",
  },
  {
    id: "dining",
    name: "Family dining room",
    brief:
      "A long table set for six, framed photos in soft focus, a vase of flowers. Family, people, life events.",
  },
  {
    id: "bedroom",
    name: "Morning bedroom",
    brief:
      "A made bed, an alarm clock, a wall calendar with no text, morning light. Daily routine, time, days and months.",
  },
  {
    id: "garden",
    name: "Garden",
    brief:
      "A walled garden with a bench, a watering can, sky and clouds behind. Weather, seasons, nature.",
  },
  {
    id: "farm",
    name: "Farmyard",
    brief:
      "A red barn door, hay bales, a fence with a sleeping cat and a hen at the edge. Animals.",
  },
  {
    id: "gym",
    name: "Sports hall",
    brief: "Wall bars, a rack of balls, a navy gym mat, high windows. Sport, fitness, hobbies.",
  },
  {
    id: "office",
    name: "Open-plan office",
    brief:
      "A tidy desk with a laptop seen from behind, plants, a window onto the city. Work, emails, professions.",
  },
  {
    id: "techshop",
    name: "Repair workshop",
    brief:
      "A bench with a phone, headphones and small tools, warm lamp light. Technology, devices, appliances.",
  },
  {
    id: "newsroom",
    name: "Newsroom",
    brief:
      "A desk with a microphone and stacked newspapers with no readable text, a dark navy wall. Media, news, reported speech.",
  },
  {
    id: "courtroom",
    name: "Courtroom",
    brief:
      "A wood-panelled bench, the scales of justice in gold, a navy curtain. Law, crime, rights.",
  },
  {
    id: "chamber",
    name: "Council chamber",
    brief:
      "Curved wooden seats, a lectern, a navy banner with a gold crest and no text. Politics, society, diplomacy.",
  },
  {
    id: "gallery",
    name: "Art gallery",
    brief:
      "Pale walls, three framed paintings in soft colour, a bench, a spotlight. Arts, culture, describing things, shapes.",
  },
  {
    id: "lab",
    name: "Science lab",
    brief:
      "A bench with glass flasks, a microscope and a plant under a lamp. Science, technology, processes.",
  },
  {
    id: "theatre",
    name: "Small theatre stage",
    brief:
      "Navy velvet curtains with gold trim, warm footlights, an empty stage. Speaking units, rhetoric.",
  },
  {
    id: "radio",
    name: "Radio studio",
    brief:
      "A desk microphone on an arm, headphones, soft foam panels in cream and navy. Listening units, minimal pairs.",
  },
  {
    id: "seaside",
    name: "Seaside promenade",
    brief:
      "A railing above a calm sea, a striped umbrella, gulls far off. Holidays, travel phrases, climate.",
  },
];

/**
 * Rooms whose art has not landed yet; their units fall back to a painted room (see src/lib/room-plan.ts). Empty
 * since 2026-11-06, when the 21 lesson rooms joined the 14 call scenes. A new room goes here until its three WebP
 * files are added; then remove it and run `bun scripts/gen-unit-rooms.ts`, `bun scripts/export-ios-content.ts`
 * and `bun scripts/export-android-content.ts`.
 */
export const PENDING_ROOMS: readonly string[] = [];
