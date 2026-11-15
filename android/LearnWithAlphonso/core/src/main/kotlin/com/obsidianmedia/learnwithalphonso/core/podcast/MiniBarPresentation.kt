package com.obsidianmedia.learnwithalphonso.core.podcast

/** One action the player offers. Which surface carries it is [MiniBarPresentation]'s decision. */
enum class PlayerAction { TOGGLE, NEXT, TRANSCRIPT, CLOSE }

/**
 * Where each player action lives (round 6.1 "mini player"). The pill holds only what fits at 360 dp and at the largest font:
 * the art, the title and the gold play button. Next, transcript and "Stop and close" are in the expanded player, so the
 * title is never squeezed to a few characters; every action stays reachable from one of the two.
 */
object MiniBarPresentation {
    fun pillActions(): List<PlayerAction> = listOf(PlayerAction.TOGGLE)

    fun expandedActions(hasNext: Boolean): List<PlayerAction> =
        listOf(PlayerAction.TOGGLE, PlayerAction.TRANSCRIPT) + (if (hasNext) listOf(PlayerAction.NEXT) else emptyList()) + PlayerAction.CLOSE

    /** The gold button's spoken label for the control the player machine reports. */
    fun toggleLabel(control: PodcastPlayerControl, retryTitle: String): String = when (control) {
        PodcastPlayerControl.PAUSE -> "Pause"
        PodcastPlayerControl.RETRY -> retryTitle
        PodcastPlayerControl.SPINNER -> "Loading"
        else -> "Play"
    }
}
