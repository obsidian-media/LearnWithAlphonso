package com.obsidianmedia.learnwithalphonso.ui.word

import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import java.util.UUID

/** One open save sheet: the tap's own id and what it saves. */
data class OpenSaveRequest(val id: String, val request: SaveWordRequest)

/**
 * Hands out a fresh id for every tap (SaveWordRequest's `id = UUID()` on iOS). The id keys the sheet's state, so it must
 * never repeat: a counter that restarts when the screen holding it is left reused "1" for the next transcript the learner
 * opened, and the sheet showed the previous word and its "Saved" result instead of the new one.
 */
class SaveWordTaps(private val newId: () -> String = { UUID.randomUUID().toString() }) {
    fun open(request: SaveWordRequest) = OpenSaveRequest(newId(), request)
}
