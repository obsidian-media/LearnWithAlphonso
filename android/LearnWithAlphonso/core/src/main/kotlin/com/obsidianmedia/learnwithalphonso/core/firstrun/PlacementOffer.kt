package com.obsidianmedia.learnwithalphonso.core.firstrun

/**
 * Whether to offer the placement test now (owner decision, "option 1"). Everyone who said they know "some" or are
 * "confident" and have not taken it is offered it, right after a Hector call and as a prominent card at the top of
 * Learn. True beginners ("new") are not pushed; they keep the small card on Learn. "Not now" hides the Hector-end
 * prompt for that course (kept on this device) and quietens the Learn card. The same rule is on the web
 * (placementOffer in src/lib/placement-offer.ts) and in the iOS Kit (PlacementOffer); keep the three in step.
 */
object PlacementOffer {
    enum class Surface { HECTOR_END, LEARN }
    enum class Style { NONE, PROMINENT, QUIET }

    fun style(level: String?, placementTaken: Boolean, dismissed: Boolean, surface: Surface): Style {
        if (placementTaken) return Style.NONE
        val wantsIt = level == "some" || level == "confident"
        return when (surface) {
            Surface.HECTOR_END -> if (wantsIt && !dismissed) Style.PROMINENT else Style.NONE
            Surface.LEARN -> if (wantsIt && !dismissed) Style.PROMINENT else Style.QUIET
        }
    }

    /** The preferences key that remembers "Not now" for a course. */
    fun dismissKey(course: String): String = "placementOfferDismissed.v1.$course"

    const val TITLE = "Find your level"
    const val BODY = "A 5-minute placement test sets your level so lessons start in the right place."
    const val START = "Start"
    const val NOT_NOW = "Not now"
}
