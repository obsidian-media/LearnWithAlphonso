import {
  learnerProfilePatchSchema,
  parseLearnerProfile,
  type AgeRange,
  type Goal,
  type LearnerProfilePatch,
  type ProfileCourse,
} from "./learner-profile";

/**
 * The first run (visual round 6, BACKLOG 0.0-bd): Alphonso asks eight questions, gives a two-question taste and a
 * plan, and only then asks the learner to sign in. Until then every answer stays in this browser.
 *
 * Under 13: the age screen is neutral (every range looks the same, none is picked). Choosing "Under 13" ends the
 * first run on this device: the answers are wiped, a flag is kept so going back and picking an older range does not
 * get through, no account can be made here, and nothing is ever sent to the server.
 */
export const FIRST_RUN_DRAFT_KEY = "lwa.firstRun.v1";
export const UNDER_13_KEY = "lwa.under13.v1";

export type AgeChoice = "under-13" | AgeRange;

export const AGE_CHOICES: readonly { id: AgeChoice; big: string; small: string }[] = [
  { id: "under-13", big: "<13", small: "Under 13" },
  { id: "13-17", big: "13–17", small: "Teen" },
  { id: "18-24", big: "18–24", small: "Young adult" },
  { id: "25-34", big: "25–34", small: "Adult" },
  { id: "35-54", big: "35–54", small: "Adult" },
  { id: "55+", big: "55+", small: "Mature" },
];

export type FirstRunDraft = Partial<LearnerProfilePatch>;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type FirstRunStore = {
  readDraft(): FirstRunDraft;
  writeDraft(draft: FirstRunDraft): void;
  clearDraft(): void;
  isBlocked(): boolean;
  blockUnder13(): void;
};

export function createFirstRunStore(storage: Store | null): FirstRunStore {
  // Kept in memory as well, so the block holds for the visit even where storage throws (private mode).
  let blockedThisVisit = false;
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const store: FirstRunStore = {
    readDraft() {
      if (store.isBlocked()) return {};
      const raw = safe(() => storage?.getItem(FIRST_RUN_DRAFT_KEY) ?? null, null);
      if (!raw) return {};
      const parsed = safe(() => JSON.parse(raw) as unknown, null);
      return parsed && typeof parsed === "object" ? (parsed as FirstRunDraft) : {};
    },
    writeDraft(draft) {
      if (store.isBlocked()) return;
      safe(() => storage?.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify(draft)), undefined);
    },
    clearDraft() {
      safe(() => storage?.removeItem(FIRST_RUN_DRAFT_KEY), undefined);
    },
    isBlocked() {
      return blockedThisVisit || safe(() => storage?.getItem(UNDER_13_KEY) === "1", false);
    },
    blockUnder13() {
      blockedThisVisit = true;
      safe(() => storage?.setItem(UNDER_13_KEY, "1"), undefined);
      store.clearDraft();
    },
  };
  return store;
}

/** The browser's store, or one that keeps nothing (server render). */
export function browserFirstRunStore(): FirstRunStore {
  const storage =
    typeof window === "undefined"
      ? null
      : (() => {
          try {
            return window.localStorage;
          } catch {
            return null;
          }
        })();
  return createFirstRunStore(storage);
}

/** The age screen's Continue. A device that ever chose Under 13 stays blocked, whatever is picked now. */
export function chooseAge(store: FirstRunStore, choice: AgeChoice): "ok" | "blocked" {
  if (store.isBlocked()) return "blocked";
  if (choice === "under-13") {
    store.blockUnder13();
    return "blocked";
  }
  store.writeDraft({ ...store.readDraft(), ageRange: choice });
  return "ok";
}

/** A draft cleaned to the server's lists (anything else dropped); null when nothing is left. */
export function cleanAnswers(draft: FirstRunDraft): LearnerProfilePatch | null {
  const { showFlag, completedAt: _c, dismissedAt: _d, ...rest } = parseLearnerProfile(draft);
  const patch: Record<string, unknown> = { ...rest };
  if (typeof draft.showFlag === "boolean") patch.showFlag = showFlag;
  if (Object.keys(patch).length === 0) return null;
  return learnerProfilePatchSchema.parse(patch);
}

/** The answers to save after sign-in; null when this device is blocked or nothing was answered. */
export function answersToSend(store: FirstRunStore): LearnerProfilePatch | null {
  if (store.isBlocked()) return null;
  return cleanAnswers(store.readDraft());
}

// ---------------------------------------------------------------- steps

export type FirstRunMode = "new" | "complete";
export type QuestionStep =
  "name" | "course" | "about" | "goal" | "level" | "time" | "age" | "interests";

const NEW_STEPS: QuestionStep[] = [
  "name",
  "course",
  "about",
  "goal",
  "level",
  "time",
  "age",
  "interests",
];

/** The counted questions ("Question 3 of 8"). Complete your profile skips the course (and, later, sign-in). */
export function questionStepsFor(mode: FirstRunMode): QuestionStep[] {
  return mode === "new" ? NEW_STEPS : NEW_STEPS.filter((s) => s !== "course");
}

// ---------------------------------------------------------------- the room

const COURSE_ROOMS: Record<ProfileCourse, string> = {
  es: "coffee",
  fr: "restaurant",
  en: "smalltalk",
};
const GOAL_ROOMS: Record<Goal, string> = {
  travel: "airport",
  work: "office",
  school: "classroom",
  family: "apartment",
  exam: "library",
  fun: "gallery",
};

/** Answers change the room: the course picks its room, then the goal moves him (Travel: the airport). */
export function roomForAnswers(a: { course?: ProfileCourse; goal?: Goal }): string {
  if (a.goal) return GOAL_ROOMS[a.goal];
  if (a.course) return COURSE_ROOMS[a.course];
  return "room-light";
}

export function roomSrc(room: string): string {
  return `/avatar/scenes/${room}.webp`;
}

export const COURSE_NAMES: Record<ProfileCourse, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
};

export function greetingFor(course: ProfileCourse, name: string | undefined): string {
  const n = name?.trim();
  if (course === "es") return n ? `¡Hola, ${n}!` : "¡Hola!";
  if (course === "fr") return n ? `Bonjour, ${n} !` : "Bonjour !";
  return n ? `Hello, ${n}!` : "Hello!";
}

// ---------------------------------------------------------------- first taste

export type MiniQuestion = {
  prompt: string;
  choices: string[];
  answer: number;
  /** Shown on the verdict sheet. */
  why: string;
  /** Read aloud for the speaker button, in the course's language. */
  say?: string;
};

/** Two real questions per course, answered on the device before any account. */
export const MINI_LESSONS: Record<ProfileCourse, MiniQuestion[]> = {
  es: [
    {
      prompt: "Let's try one! How do you say “good morning”?",
      choices: ["Buenas noches", "Buenos días", "Hasta luego"],
      answer: 1,
      why: "“Buenos días” is how you greet someone until lunchtime.",
      say: "Buenos días",
    },
    {
      prompt: "And this one: what does “gracias” mean?",
      choices: ["Please", "Thank you", "Sorry"],
      answer: 1,
      why: "“Gracias” is thank you. “Muchas gracias” is thank you very much.",
      say: "Gracias",
    },
  ],
  fr: [
    {
      prompt: "Let's try one! How do you say “good morning”?",
      choices: ["Bonsoir", "Bonjour", "Au revoir"],
      answer: 1,
      why: "“Bonjour” is good morning and hello, all day until the evening.",
      say: "Bonjour",
    },
    {
      prompt: "And this one: what does “merci” mean?",
      choices: ["Please", "Thank you", "Sorry"],
      answer: 1,
      why: "“Merci” is thank you. “Merci beaucoup” is thank you very much.",
      say: "Merci",
    },
  ],
  en: [
    {
      prompt: "Let's try one! Which is a morning greeting?",
      choices: ["Good night", "Good morning", "See you later"],
      answer: 1,
      why: "“Good morning” is a greeting until about noon. “Good night” is for bedtime.",
      say: "Good morning",
    },
    {
      prompt: "And this one: which is the polite way to ask?",
      choices: ["Give me water.", "Could I have some water, please?", "Water now."],
      answer: 1,
      why: "“Could I have…, please?” is polite and natural in cafés and shops.",
      say: "Could I have some water, please?",
    },
  ],
};

/** "Food, travel and music" from interest labels. */
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
