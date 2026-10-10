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
  feedbackEmail: "support@alphonsoecosystem.app",
  marketingUrl: "https://discover.alphonsoecosystem.app",
  privacyPolicyUrl: "https://learn.alphonsoecosystem.app/privacy",
  whatToTest: `Thanks for testing! Please try:
- Sign up, take the placement test and finish a few lessons in any course.
- Review, speaking practice in Practice, and an audio episode in Listen (also with the screen locked).
- Friends, leagues and teams, if you like.

Known in this build: buying Alphonso Pro is not open to testers yet, so the subscription screen may say it couldn't load the options. Everything else is free to use.

Send feedback with a screenshot from TestFlight, or write to support@alphonsoecosystem.app.`,
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
