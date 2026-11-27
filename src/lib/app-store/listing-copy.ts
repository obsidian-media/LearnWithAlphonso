/**
 * The App Store listing text (en-US). Single source for scripts/update-app-store-metadata.ts.
 * Every sentence is literally true of the shipped app. Never put a price here: StoreKit shows
 * local prices, and the listing must not.
 */
export type Listing = {
  subtitle: string;
  promotionalText: string;
  keywords: string;
  description: string;
  supportUrl: string;
  marketingUrl: string;
};

export const LISTING_LIMITS = {
  subtitle: 30,
  promotionalText: 170,
  keywords: 100,
  description: 4000,
} as const;

const TERMS = "https://learnwithalphonso.com/terms";
export const PRIVACY = "https://learnwithalphonso.com/privacy";
const EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const DESCRIPTION = `Learn With Alphonso helps you build a language habit in English, French or Spanish, a few minutes at a time.

START AT YOUR LEVEL
Take a short placement test for your course and learn through CEFR-graded lessons from A1 to C1. Switch between English, French and Spanish whenever you like; each course keeps its own progress.

PRACTICE EVERY SKILL
Lessons mix vocabulary, grammar, translation, listening and speaking questions. Spaced review brings back what you missed at the right moment. Hearts keep lessons focused: when you run out, wait for the refill, spend XP on a heart, or keep going with review and practice, which never cost hearts.

SPEAK OUT LOUD
Practice everyday scenarios by speaking in the language of your course. You see a transcript of what you said and hear a reply.

LISTEN ON YOUR SCHEDULE
Level-graded audio episodes with transcripts in English, French and Spanish. Keep listening with the screen locked, or download episodes to listen offline.

READ AND CHOOSE YOUR STORY
Illustrated branching stories where your choices change what happens next, written for your level in English, French and Spanish.

SAY IT, SEE IT
Say the Picture shows a real photo and asks you to name it out loud. Say it right listens to your pronunciation and tells you how close you were.

KEEP GOING
Set a learning goal and see how many lessons a week it takes. Tap a word in a tutor reply to save it to your review. Keep a daily streak and earn XP.

YOUR OWN PATH
A suggested learning path plans your week from your level, your goal and the mistakes you make, with one short refresher lesson when something keeps tripping you up. Some lessons have a version written for your goal: travel, work or school.

ALPHONSO REMEMBERS
After a practice call, Alphonso keeps a short note of what you worked on and the phrases you picked up, and uses it in your next call. You can see or clear what he remembers in Settings at any time.

LEARN WITH OTHERS, IF YOU WANT TO
Friends, leagues, teams with weekly team missions, duels, and study buddies who keep a weekly streak together. Study buddies can send each other only preset messages. You choose your public display name, and you can block or report any learner.

MEET HECTOR, YOUR AI VOICE TUTOR
With Alphonso Pro, Hector talks with you in the language you are learning, at your level.

AI AND PRIVACY
AI features run only after you allow them, and you can turn them off at any time in Settings. There are no ads and no tracking. You can export your data or delete your account in the app.

Learn With Alphonso is for learners aged 13 and over.

SUBSCRIPTION
Learn With Alphonso is free to download, and lessons, review, speaking practice and listening are free to use, within the hearts and AI limits of a free account. Alphonso Pro is an optional auto-renewable monthly subscription. It gives you Hector, the AI voice tutor, unlimited hearts in lessons, and a larger monthly allowance for the AI features. Eligible new subscribers start with a free trial. Payment is charged to your Apple Account when you confirm the purchase, after any free trial ends. The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period, and your account is charged for the renewal within the 24 hours before the period ends. You can manage or cancel it in your Apple Account settings.

Terms of Use: ${TERMS}
Apple Standard EULA: ${EULA}
Privacy Policy: ${PRIVACY}`;

export const LISTING: Listing = {
  subtitle: "English, French and Spanish",
  promotionalText:
    "Short lessons, speaking practice, podcasts and choose-your-path stories in English, French and Spanish. Hector, your AI voice tutor, comes with Alphonso Pro.",
  keywords:
    "speaking,vocabulary,grammar,listening,podcast,tutor,fluency,cefr,conversation,practice,review,ai",
  supportUrl: "https://learnwithalphonso.com/support",
  marketingUrl: "https://discover.alphonsoecosystem.app",
  description: DESCRIPTION,
};

// The leagues were renamed (Sprout, Sapling, Grove, Treetop, Summit); the old tier names must not
// reappear in anything a reviewer or shopper reads.
const FORBIDDEN = [
  /coming soon/i,
  /--/,
  /\$\s?\d/,
  /\bduolingo\b/i,
  /\bbabbel\b/i,
  /\bbusuu\b/i,
  /\bbest\b/i,
  /\bandroid\b/i,
  /google play/i,
  /#1\b/,
  /\bbronze\b/i,
  /\bsilver\b/i,
  /\bsapphire\b/i,
  /\bruby\b/i,
  /\bdiamond\b/i,
];

export function listingProblems(l: Listing, appName = "Learn With Alphonso"): string[] {
  const p: string[] = [];
  const lim = LISTING_LIMITS;
  if (l.subtitle.length > lim.subtitle) p.push(`subtitle: ${l.subtitle.length} > ${lim.subtitle}`);
  if (l.promotionalText.length > lim.promotionalText) p.push("promotionalText: too long");
  if (l.keywords.length > lim.keywords) p.push(`keywords: ${l.keywords.length} > ${lim.keywords}`);
  if (l.description.length > lim.description) p.push("description: too long");
  if (!l.description.includes(TERMS)) p.push("description: missing Terms of Use URL");
  if (!l.description.includes(PRIVACY)) p.push("description: missing Privacy Policy URL");
  if (!l.description.includes(EULA)) p.push("description: missing Apple Standard EULA URL");
  if (
    !/auto-renewable/.test(l.description) ||
    !l.description.includes("at least 24 hours before the end of the current period")
  )
    p.push("description: missing auto-renewal disclosure");
  for (const [field, text] of Object.entries(l)) {
    for (const re of FORBIDDEN) if (re.test(text)) p.push(`${field}: forbidden ${re}`);
  }
  const words = l.keywords.split(",");
  if (words.some((w) => w !== w.trim())) p.push("keywords: space after comma wastes characters");
  if (new Set(words).size !== words.length) p.push("keywords: duplicate keyword");
  const taken = new Set(
    `${appName} ${l.subtitle}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
  );
  for (const w of words)
    if (taken.has(w.trim().toLowerCase())) p.push(`keywords: "${w}" already in name or subtitle`);
  return p;
}
