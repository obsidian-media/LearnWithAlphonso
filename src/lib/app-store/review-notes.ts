/**
 * App Review notes for the v1.0 submission. Answers Apple's 2.1 information request point by
 * point (purpose and audience, how to reach each feature, external services, regional
 * differences, regulated content, the subscription, a device recording) and covers the demo
 * sign-in order, new features, Report/Block, AI consent, hearts, languages, the pre-paired demo
 * study buddy, and the stranger-matching guardrails and kill switch. Plain ASCII so nothing
 * renders oddly in App Store Connect. The product title is read live from App Store Connect by
 * the caller, so the notes can never name a product the paywall does not show.
 */
export type ReviewNotesInput = {
  demoAccountEmail: string;
  reviewContactEmail: string;
  demoCodeURL: string;
  recordingURL: string;
  productTitle: string;
};

export const NOTES_LIMIT = 4000;

export const REQUIRED_NOTE_MARKERS = [
  "aged 13+", // audience
  "Send code", // demo order, step 1
  "Verify", // demo order, step 3
  "display name", // name step
  "course picker", // languages
  "Hearts", // hearts gate
  "AI CONSENT", // consent
  "Not now", // consent decline path
  "Report this response", // AI reply report
  "Report", // report paths
  "Block", // block paths
  '"Matched learner"', // the pre-paired demo buddy card, quoted as the app shows it
  '"End study buddy"', // how to reach the opt-in, quoted as the app shows it
  "I'm 13 or older", // stranger matching
  "preset messages", // stranger matching guardrail
  "server switch", // kill switch
  "Delete My Account", // account deletion
  "SUBSCRIPTION", // subscription block
  "Restore", // restore purchases
  "Regional differences", // 2.1 regional differences
  "Regulated or protected content", // 2.1 regulated content
  "Supabase",
  "Vercel",
  "Resend",
  "Deepgram",
  "NVIDIA",
  "RevenueCat",
  "Sign in with Apple",
  "Google Sign-In", // 2.1 services
  "AI-narrated", // podcast audio provenance
  "New since build 49", // new features
  "recording", // 2.1 device recording
] as const;

export function buildReviewNotes(i: ReviewNotesInput): string {
  return `Learn With Alphonso teaches English, French and Spanish (CEFR A1 to C1) to learners aged 13+: lessons, spaced review, speaking practice, an audio library and Hector, an AI voice tutor (Pro). Screen recording on a physical iPhone: ${i.recordingURL}

SIGN IN (no password)
1. Enter ${i.demoAccountEmail} and tap "Send code".
2. Open ${i.demoCodeURL} (no login) to see the current code. Opening it issues a new code, so do step 1 first.
3. Enter the code. It submits at 6 digits (or tap "Verify").
The account (display name Alex) has lessons done, a streak, due reviews, a placement in all 3 courses and a promotional Pro entitlement. Contact: ${i.reviewContactEmail}

LEARNING
- Learn tab: course picker (EN, FR, ES) top left, the Review row (due reviews) at the top, then any lesson.
- Hearts: a wrong lesson answer costs a heart. At 0 a lesson cannot start: wait, spend 50 XP on a heart, or review or practice (no hearts needed).
- Practice tab: pick a scenario, hold the mic to talk (active course).
- Hector tab (Pro, unlocked here): same mic; replies follow the active course and level.
- Listen tab follows the Learn course: English > A1 > "Ordering Coffee". FR and ES: switch course. Plays when locked; downloadable.
- New since build 49: account-level AI consent, native FR and ES tutor voices, learning goals, saved words, team missions, study buddies.

AI CONSENT
Nothing goes to an AI provider until the learner taps Allow on a sheet naming Deepgram (speech) and NVIDIA (text). The choice is saved on the account and enforced by our server. With "Not now" the app still works: answers are checked on the device and speaking falls back to typing. Change it in Profile > Settings > AI features. Press and hold any AI reply, then "Report this response", to report it.

SOCIAL SAFETY
- New accounts choose a public display name once (filtered; Skip gives a name like Learner-4F2A). Emails are never shown.
- Profile > Friends, League (Teams inside), Duels. Every other learner shown has a "..." menu with Block and Report; team names have Report Team Name. Reports email us and we act within 24 hours.
- Study buddy (Profile > Friends): this account is already paired with a demo learner, shown as "Matched learner", so you can try the preset messages, Block and Report. "End study buddy" ends it and shows the opt-in: stranger matching is per course and needs "I'm 13 or older". Similar level only; never a blocked or past partner. Matched learners see only a name and weekly progress and can send only preset messages (no free text, 20 an hour). Block ends the pair. A server switch stops new matches and messages between matched strangers without an app update.
- Delete account: Profile > Settings > Account > Delete My Account (type DELETE). Export My Data is next to it.

SUBSCRIPTION
"${i.productTitle}", a monthly auto-renewable subscription with a free trial for eligible users, unlocks Hector and is submitted with this version. To see the paywall: Profile > Settings > Sign out, create a new account with "Continue with Apple", open Hector. It shows the price, trial terms, Restore, Terms of Use and Privacy Policy.

OTHER 2.1 ANSWERS
- Services: Supabase (database, sign-in), Vercel (API), Resend (sign-in code email), Deepgram (speech, model-improvement opt-out), NVIDIA (AI text), RevenueCat (subscription status), Sign in with Apple, Google Sign-In, Apple Push Notifications.
- Regional differences: none. The price comes from StoreKit in each storefront.
- Regulated or protected content: none. Images are licensed stock photos we host; podcast audio is AI-narrated (Deepgram) from scripts we wrote.
- No ads, analytics, tracking or crash SDKs. Background audio is used only by Listen.`;
}

export function buildBetaReviewNotes(
  i: Pick<ReviewNotesInput, "demoCodeURL" | "reviewContactEmail">,
): string {
  return `No password. Tap "Send code", then open ${i.demoCodeURL} (no login) for the current 6-digit code and enter it. Opening the page issues a new code, so tap "Send code" first. The account has progress and Pro. Contact: ${i.reviewContactEmail}`;
}

// Deepgram's terms forbid implying that its synthesized audio was made by a human, so the notes
// must never describe the podcasts as human-made.
const HUMAN_NARRATION = [
  /audio is our own/i,
  /\bhuman[- ]?(narrat|voice|record)/i,
  /\b(narrated|voiced|recorded|read) by (a |the )?(human|person|people|native|actor|voice)/i,
  /\bvoice actors?\b/i,
  /\bnative speakers? (record|narrat|voic)/i,
];

/** The notes with the caller's values blanked, so a secret that happens to contain "--" is not a copy defect. */
function withoutInputs(notes: string, i: ReviewNotesInput): string {
  let out = notes;
  for (const value of [i.demoAccountEmail, i.reviewContactEmail, i.demoCodeURL, i.recordingURL]) {
    if (value) out = out.split(value).join("X");
  }
  return out;
}

export function reviewNotesProblems(notes: string, i: ReviewNotesInput): string[] {
  const p: string[] = [];
  if (notes.length > NOTES_LIMIT)
    p.push(`notes are ${notes.length} chars; the limit is ${NOTES_LIMIT}`);
  for (const m of REQUIRED_NOTE_MARKERS) if (!notes.includes(m)) p.push(`missing "${m}"`);
  if (!notes.includes(`"${i.productTitle}"`))
    p.push(`product title "${i.productTitle}" is not quoted exactly`);
  if (/Alphonso Pro Monthly/.test(notes) && i.productTitle !== "Alphonso Pro Monthly")
    p.push("product title: notes say Alphonso Pro Monthly but StoreKit says otherwise");
  if (/Amazon SES|\bSES\b/.test(notes)) p.push("provider: the sign-in email is sent by Resend");
  for (const re of HUMAN_NARRATION)
    if (re.test(notes))
      p.push(`podcast audio must be described as AI-narrated, never human-made (${re})`);
  if (!/^https:\/\//.test(i.recordingURL)) p.push("recording URL must be https");
  if (!/^https:\/\//.test(i.demoCodeURL)) p.push("demo code URL must be https");
  const text = withoutInputs(notes, i);
  if (/--/.test(text)) p.push('literal "--" in notes');
  if (/[^\n\r\t -~]/.test(text)) p.push("notes must be plain ASCII");
  return p;
}
