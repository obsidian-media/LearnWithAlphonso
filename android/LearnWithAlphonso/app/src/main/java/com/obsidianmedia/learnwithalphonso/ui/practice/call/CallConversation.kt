package com.obsidianmedia.learnwithalphonso.ui.practice.call

import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeController
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState
import kotlinx.coroutines.flow.StateFlow

/**
 * What the full-screen call needs from a conversation, whoever the character is: the turns and phases, the turn engine
 * (the recorder's phase), the microphone level for the "You" tile, and the hold-to-talk presses. Practice scenarios,
 * campaigns and Hector's view model implement it.
 */
interface CallConversation {
    val state: StateFlow<ConversationUiState>
    val engine: ConversationTurnEngine
    fun micLevelDBFS(): Double?
    fun pressBegan()
    fun pressEnded()

    /** Hands-free turn-taking for this call: starts as the learner last left it on this device (ApplyStoredHandsFree), driven by the call screen's switch. */
    val handsFree: HandsFreeController

    /** The call has nothing left to say (a finished campaign): hands-free must not start on it. */
    val isCallOver: Boolean get() = false
}
