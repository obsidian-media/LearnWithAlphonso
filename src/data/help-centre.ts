import { SUPPORT_EMAIL } from "@/lib/legal-required-phrases";

/**
 * The help file the Help chat's AI answers from (docs/superpowers/plans/2026-11-14-support-help-chat.md). Plain
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
export const HELP_ALLOWED_HOSTS: readonly string[] = ["learn.alphonsoecosystem.app"];

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "pro",
    title: "Alphonso Pro",
    body: [
      "Alphonso Pro is an auto-renewing monthly subscription. It unlocks Hector, the AI voice tutor. Lessons, reviews and the rest of the app are free.",
      "If you start with a free trial, you are charged when it ends unless you cancel at least 24 hours before.",
      "On iPhone, manage or cancel it in the Settings app: tap your name, then Subscriptions. On Android, use Google Play, under Payments and subscriptions. If you subscribed on our website, use the link in your Profile. We cannot cancel a subscription for you.",
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
      "If a streak looks wrong, check that the app is up to date and that you are signed in to the same account. The facts show the current streak and the last day with activity.",
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
      "The privacy page explains what we keep and why: https://learn.alphonsoecosystem.app/privacy",
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
      `A person reads every conversation that is handed over, and replies in the same chat. You can also write to ${SUPPORT_EMAIL}.`,
      "We never promise a refund, a credit, a gift, a fix or a time. We say a person will look at it.",
    ].join("\n"),
  },
];

/** The help file as one block of text for the model's system message. */
export function helpCentreText(topics: readonly HelpTopic[] = HELP_TOPICS): string {
  return topics.map((t) => `## ${t.title}\n${t.body}`).join("\n\n");
}
