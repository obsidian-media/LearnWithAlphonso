import { LISTING, PRIVACY } from "./listing-copy";

/**
 * What external TestFlight testers (and Beta App Review) read: the beta app description, the feedback
 * address, the two links, and the per-build "What to Test" note. One reviewed source, like listing-copy.
 */
export type TestflightCopy = {
  betaDescription: string;
  feedbackEmail: string;
  marketingUrl: string;
  privacyPolicyUrl: string;
  whatToTest: string;
};

// Apple's limit for both the beta description and "What to Test".
export const TESTFLIGHT_TEXT_LIMIT = 4000;

export const TESTFLIGHT: TestflightCopy = {
  betaDescription: `Learn With Alphonso is a language-learning app for English, French and Spanish, for learners aged 13 and over.

Take a short placement test, then learn through CEFR-graded lessons from A1 to C1 that mix vocabulary, grammar, translation, listening and speaking. Spaced review brings back what you missed. Practice everyday scenarios out loud, listen to level-graded audio episodes with transcripts, and, if you want, learn with friends, leagues, teams and study buddies.

Sign in with Apple, Google or your email (you get a 6-digit code). AI features run only after you allow them and can be turned off in Settings.`,
  feedbackEmail: "support@learnwithalphonso.com",
  marketingUrl: LISTING.marketingUrl,
  privacyPolicyUrl: PRIVACY,
  // Remove the "Known in this build" paragraph once the Paid Apps Agreement is active and Pro can be
  // bought in TestFlight; this note is reused for every build until then.
  whatToTest: `Thanks for testing build 76! About 10 minutes:
1. Sign up and take the level test, or tap "Find your level" on Learn.
2. On Learn, open "Your path is ready", accept it, and do today's lesson.
3. Set your learning goal to travel, work or school, then do an A1 or A2 lesson. Some questions show a "For your work goal" tag (or travel, or school).
4. Get a few answers wrong on purpose, then look for "Fix before it sticks" on Learn.
5. Have a practice call with Alphonso, hang up, then call again. He should use what you worked on.
6. Open Weekly on Learn and claim a finished quest.

Known in this build: Alphonso Pro cannot be bought by testers yet, so Hector (the AI voice tutor, a Pro feature) is not available. The level test is in English only for now, even for French and Spanish learners. Android is not out yet. Lessons, review, speaking practice and listening are free to use.

Tell us what confused you or broke: send feedback with a screenshot from TestFlight, or write to support@learnwithalphonso.com.`,
};

/** Every reason the copy would be rejected by App Store Connect or mislead a tester; empty when fine. */
export function testflightCopyProblems(c: TestflightCopy): string[] {
  const p: string[] = [];
  for (const [name, text] of [
    ["betaDescription", c.betaDescription],
    ["whatToTest", c.whatToTest],
  ] as const) {
    if (text.trim() === "") p.push(`${name}: empty`);
    if (text.length > TESTFLIGHT_TEXT_LIMIT)
      p.push(`${name}: ${text.length} > ${TESTFLIGHT_TEXT_LIMIT}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c.feedbackEmail)) p.push("feedbackEmail: not an email");
  for (const [name, url] of [
    ["marketingUrl", c.marketingUrl],
    ["privacyPolicyUrl", c.privacyPolicyUrl],
  ] as const) {
    if (!/^https:\/\/[^\s]+$/.test(url)) p.push(`${name}: not an https URL`);
  }
  // Testers must not be promised a purchase that cannot work until the paid agreement is active, and
  // the age must match the listing.
  if (/\bfree trial\b/i.test(c.whatToTest)) p.push("whatToTest: promises a free trial");
  if (!c.betaDescription.includes("13 and over")) p.push("betaDescription: missing the 13+ age");
  return p;
}
