package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Every word of the Help chat: the Kotlin twin of the web's `src/lib/support-copy.ts` (owner-approved in the round 12
 * mock). A change to a string here is a change to the mock; `SupportViewTest` pins the strings that the server or the
 * other platforms also say.
 */
object SupportCopy {
    const val ENTRY_TITLE = "Help"
    const val ENTRY_SUBTITLE = "Ask a question or talk to a person"
    const val GET_HELP = "Get help"
    const val TITLE = "Help"
    const val BACK = "Back"
    const val TALK_TO_PERSON = "Talk to a person"
    const val YOU = "You"
    const val AI = "Miya (AI helper)"
    const val AI_TAG = "AI"
    const val PERSON = "Support team"
    const val PERSON_TAG = "Person"
    const val IS_WRITING = "is writing…"
    const val NEW_REPLY = "New reply"
    const val SEND_LABEL = "Send"
    const val MESSAGE_LOG = "Conversation"

    const val LOOKING_UP = "Looking up: checking your account"

    const val WELCOME_AI_TITLE = "How can I help?"
    const val WELCOME_AI_BODY = "I'm an AI helper for Learn With Alphonso. I can look at your own account and explain how things work. I can't change anything on your account. A person can."
    const val CAN_HELP_WITH = "I can help with"
    const val AI_MODE_TITLE = "You are chatting with an AI"
    const val AI_MODE_BODY = "It can look and explain, not change your account. Tap Talk to a person any time."
    const val AI_FINE = "Answers can be wrong. For refunds, billing, safety or your data, a person takes over. Don't send passwords or card numbers."

    const val WELCOME_TITLE = "Write to us"
    const val WELCOME_BODY = "A person reads every message and replies right here in the chat. You can close the app; we will tell you when there is a reply."
    const val WELCOME_TIP = "Tell us what happened: what you tapped, and what you expected. That helps us answer faster."
    const val PERSON_MODE_TITLE = "Replies come from a person"
    const val PERSON_MODE_BODY = "We will notify you when there is a reply."
    const val DECLINED_TITLE = "AI answers are off for you"
    const val DECLINED_BODY = "You turned off AI features, so a person reads your messages. You can change this in Settings, AI features."

    const val TEAM_TITLE = "With our team"
    const val TEAM_BODY = "A person will read this and reply here."
    const val WAIT_TITLE = "Waiting for your reply"
    const val WAIT_BODY = "The team wrote to you."
    const val SOLVED_TITLE = "Solved"
    const val SOLVED_BODY = "Write below if you still need help."

    const val PLACEHOLDER = "Write your message"
    const val PLACEHOLDER_MORE = "Add something"
    const val PLACEHOLDER_REPLY = "Reply to the team"
    const val PLACEHOLDER_SOLVED = "Still need help? Write here"
    const val PLACEHOLDER_LIMIT = "Come back tomorrow to write again"
    const val PLACEHOLDER_FULL = "This chat is full"
    const val FINE = "Don't send passwords or card numbers."
    const val FINE_SOLVED = "Writing within 7 days reopens this chat. After that, a new chat starts."
    const val FINE_OFFLINE = "Your draft is kept on this device."
    const val FINE_LIMIT = "Limit: 50 messages a day."

    const val STATE_SENT = "Sent"
    const val STATE_SAVED = "Saved"
    const val STATE_NOT_SENT = "Not sent"

    const val TODAY = "Today"
    const val YESTERDAY = "Yesterday"

    const val UNREACHABLE = "We couldn't reach support. Your message is saved. Try again in a moment."
    const val SEND_FAILED = "Could not send your message. Try again."
    const val TRY_AGAIN = "Try again"
    const val LOAD_FAILED = "Could not load your messages."
    const val DAILY_LIMIT = "You have reached today's limit of messages to Help. Try again tomorrow."
    const val DAILY_LIMIT_NOTE = "A person can still read what you already sent."
    const val CONVERSATION_LIMIT = "This conversation has reached its message limit. A person will read what you have sent."
    const val OFFLINE_TITLE = "You're offline"
    const val OFFLINE_BODY = "Reconnect to send. Your draft is kept."
    const val HANDOFF_FAILED = "We couldn't reach support. Try again in a moment."

    /** The seven starters on the AI first-open screen: the help-file topic titles. They fill the box and never send. */
    val STARTERS = listOf(
        "Alphonso Pro",
        "Pro is missing, or restoring a purchase",
        "Streaks",
        "Weekly league",
        "Your account, sign-in and deleting it",
        "Your data and privacy",
        "Reporting and blocking",
    )

    const val DAILY_LIMIT_MESSAGES = 50
    const val MAX_MESSAGE_LENGTH = 2000
}

enum class SupportStatus(val wire: String) {
    NONE("none"), AI("ai"), NEW("new"), OPEN("open"), WAITING_LEARNER("waiting_learner"), SOLVED("solved");

    companion object { fun parse(wire: String?): SupportStatus? = entries.firstOrNull { it.wire == wire } }
}

enum class SupportBanner(val title: String, val body: String) {
    AI(SupportCopy.AI_MODE_TITLE, SupportCopy.AI_MODE_BODY),
    PERSON(SupportCopy.PERSON_MODE_TITLE, SupportCopy.PERSON_MODE_BODY),
    DECLINED(SupportCopy.DECLINED_TITLE, SupportCopy.DECLINED_BODY),
    TEAM(SupportCopy.TEAM_TITLE, SupportCopy.TEAM_BODY),
    WAIT(SupportCopy.WAIT_TITLE, SupportCopy.WAIT_BODY),
    DONE(SupportCopy.SOLVED_TITLE, SupportCopy.SOLVED_BODY),
    OFFLINE(SupportCopy.OFFLINE_TITLE, SupportCopy.OFFLINE_BODY),
}

enum class SendLimit { DAILY, CONVERSATION }

data class SupportComposer(val placeholder: String, val fine: String, val disabled: Boolean)

/**
 * What the Help chat shows for each state, as pure functions (the twin of `src/lib/support-view.ts`). The status is the
 * server's; nothing here decides anything about the learner's account.
 */
object SupportView {
    const val POLL_INTERVAL_MS = 20_000L

    /** The server's hand-off line (the web's HANDOFF_NOTICE; the parity test keeps the words equal). */
    const val HANDOFF_NOTICE = "A person will reply here."

    /**
     * The name line of a person's reply: "<first name> · Support team", or just "Support team" with no name. A person is
     * never labelled with Miya's name (she is the AI helper), even a staff member called Miya.
     */
    fun staffLabel(firstName: String?): String {
        val name = firstName?.trim().orEmpty()
        return if (name.isNotEmpty() && !name.equals("miya", ignoreCase = true)) "$name \u00B7 ${SupportCopy.PERSON}" else SupportCopy.PERSON
    }

    /** The words above a message: Miya for the AI (the AI tag is drawn beside it), the staff label for a person, none otherwise. */
    fun speakerLabel(message: SupportMessage): String? = when (message.kind) {
        SupportMessageKind.AI -> SupportCopy.AI
        SupportMessageKind.SUPPORT -> staffLabel(message.staffName)
        else -> null
    }

    /** Whether Miya's hand-off pose goes above this system line: it is the hand-off notice and an AI message came earlier. */
    fun showsHandoffPose(messages: List<SupportMessage>, index: Int): Boolean {
        val m = messages.getOrNull(index) ?: return false
        if (m.kind != SupportMessageKind.SYSTEM || m.body != HANDOFF_NOTICE) return false
        return messages.subList(0, index).any { it.kind == SupportMessageKind.AI }
    }

    /** Null while the first load has not finished or failed: no banner then (offline still shows). */
    fun bannerFor(status: SupportStatus?, aiAvailable: Boolean, aiDeclined: Boolean, online: Boolean): SupportBanner? {
        if (!online) return SupportBanner.OFFLINE
        return when (status) {
            null -> null
            SupportStatus.NEW, SupportStatus.OPEN -> SupportBanner.TEAM
            SupportStatus.WAITING_LEARNER -> SupportBanner.WAIT
            SupportStatus.SOLVED -> SupportBanner.DONE
            SupportStatus.NONE, SupportStatus.AI -> when {
                !aiAvailable -> SupportBanner.PERSON
                aiDeclined -> SupportBanner.DECLINED
                else -> SupportBanner.AI
            }
        }
    }

    fun composerFor(status: SupportStatus?, limit: SendLimit?, online: Boolean, aiFirstOpen: Boolean): SupportComposer {
        if (limit == SendLimit.DAILY) return SupportComposer(SupportCopy.PLACEHOLDER_LIMIT, SupportCopy.FINE_LIMIT, true)
        if (limit == SendLimit.CONVERSATION) return SupportComposer(SupportCopy.PLACEHOLDER_FULL, "", true)
        val fine = when {
            !online -> SupportCopy.FINE_OFFLINE
            status == SupportStatus.SOLVED -> SupportCopy.FINE_SOLVED
            aiFirstOpen -> SupportCopy.AI_FINE
            else -> SupportCopy.FINE
        }
        val placeholder = when (status) {
            SupportStatus.NEW, SupportStatus.OPEN -> SupportCopy.PLACEHOLDER_MORE
            SupportStatus.WAITING_LEARNER -> SupportCopy.PLACEHOLDER_REPLY
            SupportStatus.SOLVED -> SupportCopy.PLACEHOLDER_SOLVED
            else -> SupportCopy.PLACEHOLDER
        }
        return SupportComposer(placeholder, fine, false)
    }

    /** The conversation is polled while it is open and the AI is not the one answering. */
    fun shouldPoll(status: SupportStatus?): Boolean = status != null && status != SupportStatus.AI

    /** The id of the first unread person reply, where the "New reply" divider goes; null when nothing is unread. */
    fun unreadDividerId(messages: List<SupportMessage>, unread: Int): Long? {
        if (unread <= 0) return null
        val staff = messages.filter { it.kind == SupportMessageKind.SUPPORT }
        if (staff.isEmpty()) return null
        return staff.takeLast(unread).first().id
    }

    /** Messages by id, oldest first: what a poll or a send adds to what is already on screen. */
    fun mergeMessages(current: List<SupportMessage>, incoming: List<SupportMessage>): List<SupportMessage> {
        val byId = LinkedHashMap<Long, SupportMessage>()
        current.forEach { byId[it.id] = it }
        incoming.forEach { byId[it.id] = it }
        return byId.values.sortedBy { it.id }
    }

    private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
    private val DAY = DateTimeFormatter.ofPattern("d MMM", Locale.US)
    private val WEEKDAY = DateTimeFormatter.ofPattern("EEE", Locale.US)

    private fun local(iso: String, zone: ZoneId) = Instant.parse(iso).atZone(zone)

    /** "Today", "Yesterday", or "14 Nov". */
    fun dayLabel(iso: String, now: Instant, zone: ZoneId): String {
        val d = local(iso, zone).toLocalDate()
        val today: LocalDate = now.atZone(zone).toLocalDate()
        return when (d) {
            today -> SupportCopy.TODAY
            today.minusDays(1) -> SupportCopy.YESTERDAY
            else -> DAY.format(d)
        }
    }

    /** "9:41 AM" today; "Mon 11:12 AM" within the last six days; "14 Nov, 10:02 AM" before that. */
    fun timeLabel(iso: String, now: Instant, zone: ZoneId): String {
        val d = local(iso, zone)
        val clock = CLOCK.format(d)
        if (d.toLocalDate() == now.atZone(zone).toLocalDate()) return clock
        val ageDays = (now.toEpochMilli() - d.toInstant().toEpochMilli()) / 86_400_000.0
        if (ageDays >= 0 && ageDays < 6) return "${WEEKDAY.format(d)} $clock"
        return "${DAY.format(d)}, $clock"
    }

    /** A calendar-day key, to put a divider where the day changes. */
    fun dayKey(iso: String, zone: ZoneId): String = local(iso, zone).toLocalDate().toString()
}
