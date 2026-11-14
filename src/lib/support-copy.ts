import { HELP_TOPICS } from "@/data/help-centre";

/**
 * Every word of the Help chat (the owner approved these strings in the round 12 mock, 2026-11-14). The iOS and Android
 * twins use the same wording (milestones 4 and 5; support-copy.test.ts pins the strings so a change here is a change
 * to the mock). A few lines are the server's own words and arrive in its replies: HANDOFF_NOTICE ("A person will
 * reply here.") is stored as a `system` message, and the two limit messages and "We couldn't reach support..." come
 * with their errors; the copies below are what the client shows when it builds the line itself.
 */
export const SUPPORT_COPY = {
  // Entry points.
  entryTitle: "Help",
  entrySubtitle: "Ask a question or talk to a person",
  getHelp: "Get help",

  // Header and speakers.
  title: "Help",
  back: "Back",
  talkToPerson: "Talk to a person",
  you: "You",
  ai: "Alphonso AI",
  aiTag: "AI",
  person: "Alphonso support",
  personTag: "Person",
  isWriting: "is writing…",
  newReply: "New reply",
  sendLabel: "Send",
  messageLog: "Conversation",

  // First open, AI on.
  welcomeAiTitle: "How can I help?",
  welcomeAiBody:
    "I'm an AI helper for Learn With Alphonso. I can look at your own account and explain how things work. I can't change anything on your account. A person can.",
  canHelpWith: "I can help with",
  aiModeTitle: "You are chatting with an AI",
  aiModeBody: "It can look and explain, not change your account. Tap Talk to a person any time.",
  aiFine:
    "Answers can be wrong. For refunds, billing, safety or your data, a person takes over. Don't send passwords or card numbers.",

  // First open, AI off (the launch state), and the learner who turned AI features off.
  welcomeTitle: "Write to us",
  welcomeBody:
    "A person reads every message and replies right here in the chat. You can close the app; we will tell you when there is a reply.",
  welcomeTip:
    "Tell us what happened: what you tapped, and what you expected. That helps us answer faster.",
  personModeTitle: "Replies come from a person",
  personModeBody: "We will notify you when there is a reply.",
  declinedTitle: "AI answers are off for you",
  declinedBody:
    "You turned off AI features, so a person reads your messages. You can change this in Settings, AI features.",

  // The ticket, in words.
  teamTitle: "With our team",
  teamBody: "A person will read this and reply here.",
  waitTitle: "Waiting for your reply",
  waitBody: "Alphonso support wrote to you.",
  solvedTitle: "Solved",
  solvedBody: "Write below if you still need help.",

  // Composer.
  placeholder: "Write your message",
  placeholderMore: "Add something",
  placeholderReply: "Reply to Alphonso support",
  placeholderSolved: "Still need help? Write here",
  placeholderLimit: "Come back tomorrow to write again",
  placeholderFull: "This chat is full",
  fine: "Don't send passwords or card numbers.",
  fineSolved: "Writing within 7 days reopens this chat. After that, a new chat starts.",
  fineOffline: "Your draft is kept on this device.",
  fineLimit: "Limit: 50 messages a day.",

  // Message state under a bubble.
  stateSent: "Sent",
  stateSaved: "Saved",
  stateNotSent: "Not sent",

  // Days.
  today: "Today",
  yesterday: "Yesterday",

  // Errors and limits.
  unreachable: "We couldn't reach support. Your message is saved. Try again in a moment.",
  sendFailed: "Could not send your message. Try again.",
  tryAgain: "Try again",
  loadFailed: "Could not load your messages.",
  dailyLimit: "You have reached today's limit of messages to Help. Try again tomorrow.",
  dailyLimitNote: "A person can still read what you already sent.",
  conversationLimit:
    "This conversation has reached its message limit. A person will read what you have sent.",
  offlineTitle: "You're offline",
  offlineBody: "Reconnect to send. Your draft is kept.",
  handoffFailed: "We couldn't reach support. Try again in a moment.",
} as const;

/** The seven starters on the AI first-open screen: the help-file topic titles. They fill the box and never send. */
export const SUPPORT_STARTERS: readonly string[] = HELP_TOPICS.slice(0, 7).map((t) => t.title);

export const SUPPORT_DAILY_LIMIT = 50;
