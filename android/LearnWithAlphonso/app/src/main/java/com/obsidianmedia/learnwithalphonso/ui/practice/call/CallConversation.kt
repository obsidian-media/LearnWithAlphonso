package com.obsidianmedia.learnwithalphonso.ui.practice.call

import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
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
}
