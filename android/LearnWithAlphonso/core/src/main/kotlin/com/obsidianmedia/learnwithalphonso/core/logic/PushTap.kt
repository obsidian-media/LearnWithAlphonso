package com.obsidianmedia.learnwithalphonso.core.logic

/** Where tapping a push notification takes the learner. */
enum class PushTapDestination { HELP }

/**
 * The one pure rule of notification taps. The server sends every push with a `type` word in its data block beside the
 * alert (supabase/functions/_shared/fcm.ts): "nudge", "overtake" and, for a person's reply, "support". FCM puts that
 * data in the launch intent's extras when the app is closed or in the background, and the foreground handler copies
 * it onto the notification it posts, so both paths reach this one rule. Only "support" has a destination, the Help
 * chat; any other type, or none, returns null and the tap just opens the app as before. The words on the lock screen
 * never decide where a tap goes.
 */
object PushTap {
    /** The extra (and FCM data key) that carries the type. */
    const val EXTRA_TYPE = "type"

    fun destination(type: String?): PushTapDestination? = if (type == "support") PushTapDestination.HELP else null
}
