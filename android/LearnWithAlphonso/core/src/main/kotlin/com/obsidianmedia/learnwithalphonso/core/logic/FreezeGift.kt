package com.obsidianmedia.learnwithalphonso.core.logic

/**
 * Gift a streak freeze, the mobile side (mirrors src/lib/freeze-gift.ts on the web). The rules live in the database
 * (gift_streak_freeze: a transfer of a freeze the sender holds, one per friend per UTC day, refused when the friend
 * already holds 3). This file only turns the database's answer into words and decides what the row's button shows;
 * the app never decides whether a gift is allowed, it only avoids offering one it already knows will be refused.
 */
enum class GiftFreezeReason(val raw: String) {
    UNAUTHENTICATED("unauthenticated"),
    NOT_FRIENDS("not-friends"),
    ALREADY_GIFTED_TODAY("already-gifted-today"),
    NO_FREEZE("no-freeze"),
    RECIPIENT_FULL("recipient-full"),
    ERROR("error"),
}

/** [reason] is null on success; [freezes] is the sender's balance after the call, as the server reports it. */
data class GiftFreezeOutcome(val ok: Boolean, val reason: GiftFreezeReason?, val freezes: Int?)

/** A received gift row (streak_freeze_gifts) the learner has not yet seen. */
data class FreezeGift(val id: String, val senderId: String)

/** What the Friends screen needs to draw the gift buttons: the caller's own balance (null = unknown) and today's recipients. */
data class FreezeGiftState(val freezes: Int?, val giftedTodayTo: Set<String>)

enum class GiftButtonState { SEND, SENT_TODAY, NO_FREEZE }

object FreezeGiftLogic {
    /** Anything the database says that is not a known reason reads as a plain error (never shown as a made-up reason). */
    fun reason(raw: String?): GiftFreezeReason =
        GiftFreezeReason.entries.firstOrNull { it != GiftFreezeReason.ERROR && it.raw == raw } ?: GiftFreezeReason.ERROR

    fun message(outcome: GiftFreezeOutcome, friendName: String): String {
        if (outcome.ok) return "Freeze sent to $friendName."
        return when (outcome.reason) {
            GiftFreezeReason.RECIPIENT_FULL -> "$friendName already has all the freezes they can hold."
            GiftFreezeReason.ALREADY_GIFTED_TODAY -> "You already gifted $friendName a freeze today. Try again tomorrow."
            GiftFreezeReason.NO_FREEZE -> "You have no streak freeze to give."
            GiftFreezeReason.NOT_FRIENDS -> "Couldn't send a freeze to $friendName."
            else -> "Couldn't send a freeze to $friendName. Try again."
        }
    }

    /** What the row's gift button shows, from what the screen has loaded (the database still has the last word). */
    fun buttonState(myFreezes: Int?, giftedTodayTo: Set<String>, friendId: String): GiftButtonState = when {
        friendId in giftedTodayTo -> GiftButtonState.SENT_TODAY
        myFreezes != null && myFreezes < 1 -> GiftButtonState.NO_FREEZE
        else -> GiftButtonState.SEND
    }

    /** The accessible name of the row's gift button: says what it does, or why it is off. */
    fun accessibilityLabel(friendName: String, state: GiftButtonState): String = when (state) {
        GiftButtonState.SENT_TODAY -> "Streak freeze already sent to $friendName today"
        GiftButtonState.NO_FREEZE -> "Gift a streak freeze to $friendName (you have none to give)"
        GiftButtonState.SEND -> "Gift a streak freeze to $friendName"
    }

    /** The toast for freezes received: one friend by name, several by count. */
    fun receivedToast(senderNames: List<String>): String =
        if (senderNames.size == 1) "${senderNames[0]} gifted you a streak freeze!" else "${senderNames.size} friends gifted you a streak freeze!"
}
