package com.obsidianmedia.learnwithalphonso.core.logic

/** The Pro line shown in Settings; the same rule as the iOS Kit's `EntitlementState.proLabel`. */
object ProLabel {
    /** "Pro (gift)" for a promotional entitlement (a gift from the team), "Pro" for a purchase, null when not Pro. */
    fun of(isPro: Boolean, isGift: Boolean): String? = if (!isPro) null else if (isGift) "Pro (gift)" else "Pro"

    /** RevenueCat's store name for a gifted entitlement. */
    fun isGiftStore(store: String?): Boolean = store?.equals("promotional", ignoreCase = true) == true
}
