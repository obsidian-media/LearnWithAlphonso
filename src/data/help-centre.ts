import { SUPPORT_EMAIL } from "@/lib/legal-required-phrases";

/**
 * The help file the Help chat's AI answers from (docs/archive/2026-11/2026-11-14-support-help-chat.md). Plain
 * strings, reviewed by the owner: the AI may say what is written here and what is in the learner's own facts
 * snapshot, and nothing else. Every sentence is a promise the product makes, so keep it short and true, and change
 * it here, not in the prompt.
 *
 * DRAFT for owner review (2026-11-14). The wording follows the public Support page (src/routes/support.tsx) and the
 * privacy page; where those change, change this.
 *
 * No URL here may point outside HELP_ALLOWED_HOSTS (help-centre.test.ts), and the model's replies are held to the
 * same list (support-ai.server.ts), so an injected link never reaches a learner.
 */
export type HelpTopic = { id: string; title: string; body: string };

/** Hosts a help sentence or an AI reply may link to. Email addresses are checked separately (SUPPORT_EMAIL only). */
export const HELP_ALLOWED_HOSTS: readonly string[] = [
  "learnwithalphonso.com",
  // The previous hosts keep working and older replies/links may still name them.
  "alphonsoecosystem.app",
  "learn.alphonsoecosystem.app",
];

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "pro",
    title: "Alphonso Pro",
    body: [
      "Alphonso Pro is an auto-renewing subscription. The plans on offer (monthly, and yearly where offered) differ by platform and are shown before the learner confirms. It gives Hector, the AI voice tutor, unlimited hearts in lessons, and a larger monthly allowance for the AI features. Lessons, review, the placement test, the audio library, practice calls with Alphonso and What Alphonso remembers stay free, within the hearts and AI limits of a free account.",
      "If you start with a free trial, you are charged when it ends unless you cancel at least 24 hours before. In the apps, Apple or Google decides who gets a trial. On the website, a trial is offered only to an account that has never had Pro.",
      "On iPhone, manage or cancel it in the Settings app: tap your name, then Subscriptions. On Android, use Google Play, under Payments and subscriptions. If you subscribed on our website, use Manage Subscription on the Hector page. We cannot cancel an App Store or Google Play subscription for you.",
      "Withdrawing (EU and UK, website purchases): within 14 days of subscribing, the learner can withdraw and get a refund minus a proportionate amount for the time Pro was available. A person handles every withdrawal and refund, so hand it over. App Store and Google Play purchases follow Apple's and Google's rules.",
      "Pro can also be a gift from us for a set time. The facts about the learner say whether Pro is active and where it comes from.",
    ].join("\n"),
  },
  {
    id: "restore",
    title: "Pro is missing, or restoring a purchase",
    body: [
      "If you reinstalled the app, moved to a new phone, or signed in on another device, tap Restore Purchases on the subscription screen.",
      "Sign in the same way you did when you subscribed (the same Apple, Google or email sign-in). A different sign-in method is a different account, and the purchase belongs to the account that bought it.",
      "If the facts say Pro could not be checked right now, say so: that does not mean there is no Pro. Suggest trying again in a few minutes.",
      "If Restore Purchases does not fix it, a person can look into it. Offer to hand over to a person.",
    ].join("\n"),
  },
  {
    id: "streak",
    title: "Streaks",
    body: [
      "A streak counts the days in a row you finished a lesson or review. Days follow the time zone of your phone or browser.",
      "The streak the app shows is the one the facts give. A streak that shows 0 has lapsed: you missed a day and had no streak freeze for it, so your next lesson starts a new streak at 1. The facts give the streak as the app shows it today, never an older stored number.",
      "If a streak looks wrong, check that the app is up to date and that you are signed in to the same account. The facts show the streak, whether a streak freeze is protecting it, how many freezes the learner holds, and the last day with activity.",
      "We cannot change a streak from here. A person can look at it.",
    ].join("\n"),
  },
  {
    id: "league",
    title: "Weekly league",
    body: [
      "The weekly league ranks learners by the XP earned that week. Each week runs on one shared clock (UTC), so the week can end at a different local time for you.",
      "XP comes from finishing lessons and reviews. A league can take a short moment to update after a lesson.",
    ].join("\n"),
  },
  {
    id: "account",
    title: "Your account, sign-in and deleting it",
    body: [
      "You can sign in with Apple, with Google, or with your email address and a password. If your progress seems to be missing, sign in the same way you did the first time.",
      "To reset a password, use Forgot your password on the sign-in page.",
      "Delete your account on the web: Profile, Your data, Delete my account. In the app: Profile, Settings, Account, Delete My Account (type DELETE to confirm). Deleting erases your account and its records for good, and cancels a subscription bought on our website.",
      "A request to delete someone else's account cannot be done here. Hand over to a person.",
    ].join("\n"),
  },
  {
    id: "privacy",
    title: "Your data and privacy",
    body: [
      "You can download a copy of your data: on the web, Profile, Your data, Download my data. In the app: Profile, Settings, Account, Export My Data.",
      "The privacy page explains what we keep and why: https://learnwithalphonso.com/privacy",
      "Requests about legal rights over your data (access, correction, erasure under a law) go to a person.",
    ].join("\n"),
  },
  {
    id: "safety",
    title: "Reporting and blocking",
    body: [
      "Every post, name or message from another learner has a menu with Report and Block. We review every report and act on it within 24 hours.",
      "Blocking removes the other person from your social features. It does not stop you from using the app.",
      "Anything about someone's safety, harassment or abuse goes to a person straight away.",
    ].join("\n"),
  },
  // The first seven topic titles are the Help chat's starters (support-copy.ts and the native twins): new topics go after them.
  {
    id: "streak-freeze",
    title: "Streak freezes",
    body: [
      "A streak freeze protects your streak when you miss one day. If you skip exactly one day, your next lesson uses one freeze, the streak carries on instead of restarting, and the freeze is used up. Missing two or more days in a row is not covered: the streak restarts at 1 even if you hold freezes.",
      'A freeze is used on its own the next time you finish a lesson or review after the missed day; there is nothing to switch on. While a freeze is the only thing keeping the streak alive, the app shows the streak as protected (a snowflake mark, and the line "Protected by a streak freeze" on Profile).',
      "You earn one freeze each time your streak reaches a multiple of 10 days (day 10, 20, 30 and so on). In the iPhone and Android apps you can also buy one for 75 XP, from the streak freeze row on the Learn screen (not on the website). The XP is taken from the course you are learning. A freeze can also arrive as a gift: a friend can give you one of theirs (they give up one of their own, and it cannot be given to someone who already holds 3), and a Pro learner whose invited friend finishes a first lesson is rewarded with one (not when they already hold 3). The facts show how many freezes you hold.",
      "A freeze cannot bring back a streak that has already lapsed (one that shows 0). We cannot add freezes or restore a streak from here; a person can look at it.",
    ].join("\n"),
  },
  {
    id: "hands-free",
    title: "Hands-free calls",
    body: [
      "On a practice call with Alphonso (single scenes and campaigns) and on a call with Hector, you can talk without holding the button. Turn on Hands-free, on the call screen on iPhone, or in the conversation sheet on Android and the web. The first time on a device, a short note explains how it works and asks you to confirm.",
      "With Hands-free on, the call listens after each reply and answers when you pause. In Practice the turn ends after about 2.5 seconds of quiet; with Hector, after about 1.2 seconds. Tap Pause to stop listening and Resume to carry on; turning the switch off goes back to holding the button.",
      "The app remembers your last choice on that device: if you left Hands-free on, the next call starts with it on, and off if you turned it off. If the microphone is not allowed, the call falls back to holding the button.",
      "For safety it pauses by itself after 8 seconds of quiet, after only background noise, after a very long turn, after 20 turns in a row without you touching the screen, after a problem, or when the audio is interrupted (a phone call, earbuds removed). Tap Resume to carry on. On the web it works only while the page is open and awake. What it hears is sent for transcription like a held recording. It is best with earbuds or a quiet room, and not for use while driving.",
      "Practice calls are free and use the same daily limits as a held press. Hector, and so Hector hands-free, is part of Alphonso Pro.",
    ].join("\n"),
  },
  {
    id: "stories",
    title: "Stories",
    body: [
      "Stories are short graded stories in the Library, organised by level. Open one to read along: the story is cut into sentences, the narration voice reads them one by one with the current sentence highlighted, and you can tap any word to see it and save it. Tap Pause narration to stop it. When you have finished you can check what you understood.",
      "Some stories are choose-your-path stories: you read a part, then choose what happens next, and the story continues from your choice.",
      "Most stories play a pre-recorded narration, which needs no AI allowance. A sentence without a recording is read by the live voice instead. If the voice cannot be reached, the text stays readable.",
    ].join("\n"),
  },
  {
    id: "troubleshooting",
    title: "Things you can try yourself",
    body: [
      "Update the app to the latest version.",
      "Sign out and sign in again.",
      "Check your internet connection. Lessons you finish offline are saved and sent when you are back online.",
      "Restart the app.",
    ].join("\n"),
  },
  {
    id: "contact",
    title: "Reaching a person",
    body: [
      "Miya is the AI helper in the Help chat. She is an AI, not a person. She answers from this help file and from a few facts about your account (such as your streak and whether Pro is active), and she cannot change anything on your account or see payments, passwords, lesson answers or chats with Alphonso or Hector.",
      'To talk to a person, say so in the Help chat at any time (for example "I want to talk to a person"). Refunds, billing disputes, deleting an account, safety, and legal or privacy requests always go to a person.',
      `A person reads every conversation that is handed over, and replies in the same chat. You can also write to ${SUPPORT_EMAIL}.`,
      "We never promise a refund, a credit, a gift, a fix or a time. We say a person will look at it.",
    ].join("\n"),
  },
];

/** The help file as one block of text for the model's system message. */
export function helpCentreText(topics: readonly HelpTopic[] = HELP_TOPICS): string {
  return topics.map((t) => `## ${t.title}\n${t.body}`).join("\n\n");
}
