import Foundation

/// Every word of the Help chat, word for word the web's `SUPPORT_COPY` (src/lib/support-copy.ts), which is the
/// round 12 mock the owner approved on 2026-11-14. The web test `support-copy-native.test.ts` fails if a string here
/// drifts from the web's. A few lines are the server's own words and arrive in its replies; the copies here are what
/// the app shows when it builds the line itself.
public enum SupportCopy {
    public static let entryTitle = "Help"
    public static let entrySubtitle = "Ask a question or talk to a person"
    public static let getHelp = "Get help"
    public static let title = "Help"
    public static let back = "Back"
    public static let talkToPerson = "Talk to a person"
    public static let you = "You"
    public static let ai = "Alphonso AI"
    public static let aiTag = "AI"
    public static let person = "Alphonso support"
    public static let personTag = "Person"
    public static let isWriting = "is writing…"
    public static let newReply = "New reply"
    public static let sendLabel = "Send"
    public static let messageLog = "Conversation"
    public static let welcomeAiTitle = "How can I help?"
    public static let welcomeAiBody = "I'm an AI helper for Learn With Alphonso. I can look at your own account and explain how things work. I can't change anything on your account. A person can."
    public static let canHelpWith = "I can help with"
    public static let aiModeTitle = "You are chatting with an AI"
    public static let aiModeBody = "It can look and explain, not change your account. Tap Talk to a person any time."
    public static let aiFine = "Answers can be wrong. For refunds, billing, safety or your data, a person takes over. Don't send passwords or card numbers."
    public static let welcomeTitle = "Write to us"
    public static let welcomeBody = "A person reads every message and replies right here in the chat. You can close the app; we will tell you when there is a reply."
    public static let welcomeTip = "Tell us what happened: what you tapped, and what you expected. That helps us answer faster."
    public static let personModeTitle = "Replies come from a person"
    public static let personModeBody = "We will notify you when there is a reply."
    public static let declinedTitle = "AI answers are off for you"
    public static let declinedBody = "You turned off AI features, so a person reads your messages. You can change this in Settings, AI features."
    public static let teamTitle = "With our team"
    public static let teamBody = "A person will read this and reply here."
    public static let waitTitle = "Waiting for your reply"
    public static let waitBody = "Alphonso support wrote to you."
    public static let solvedTitle = "Solved"
    public static let solvedBody = "Write below if you still need help."
    public static let placeholder = "Write your message"
    public static let placeholderMore = "Add something"
    public static let placeholderReply = "Reply to Alphonso support"
    public static let placeholderSolved = "Still need help? Write here"
    public static let placeholderLimit = "Come back tomorrow to write again"
    public static let placeholderFull = "This chat is full"
    public static let fine = "Don't send passwords or card numbers."
    public static let fineSolved = "Writing within 7 days reopens this chat. After that, a new chat starts."
    public static let fineOffline = "Your draft is kept on this device."
    public static let fineLimit = "Limit: 50 messages a day."
    public static let stateSent = "Sent"
    public static let stateSaved = "Saved"
    public static let stateNotSent = "Not sent"
    public static let today = "Today"
    public static let yesterday = "Yesterday"
    public static let unreachable = "We couldn't reach support. Your message is saved. Try again in a moment."
    public static let sendFailed = "Could not send your message. Try again."
    public static let tryAgain = "Try again"
    public static let loadFailed = "Could not load your messages."
    public static let dailyLimit = "You have reached today's limit of messages to Help. Try again tomorrow."
    public static let dailyLimitNote = "A person can still read what you already sent."
    public static let conversationLimit = "This conversation has reached its message limit. A person will read what you have sent."
    public static let offlineTitle = "You're offline"
    public static let offlineBody = "Reconnect to send. Your draft is kept."
    public static let handoffFailed = "We couldn't reach support. Try again in a moment."

    /// The seven starters on the AI first-open screen: the help-file topic titles. They fill the box and never send.
    public static let starters: [String] = [
        "Alphonso Pro",
        "Pro is missing, or restoring a purchase",
        "Streaks",
        "Weekly league",
        "Your account, sign-in and deleting it",
        "Your data and privacy",
        "Reporting and blocking",
    ]

    /// Learner messages allowed a day (the server enforces it; this is what the screen says).
    public static let dailyMessageLimit = 50
}
