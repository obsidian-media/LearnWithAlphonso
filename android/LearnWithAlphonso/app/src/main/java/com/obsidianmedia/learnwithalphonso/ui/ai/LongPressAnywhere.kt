package com.obsidianmedia.learnwithalphonso.ui.ai

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Calls [onLongPress] when a finger stays down on this element for the long-press time without moving, even when the
 * press lands on a child that handles taps (a link in a Text). The usual `detectTapGestures(onLongPress)` waits for a
 * press nobody else consumed, and a link consumes its press, so a long press over a word never reached it.
 *
 * It watches on the Initial pass, before the children, and consumes nothing until the long press has fired; then it
 * consumes the rest of that press so the word under the finger does not also open the save sheet when released. A press
 * that ends early (a tap) or moves past the touch slop (a scroll) is left entirely to the children.
 */
@Composable
fun Modifier.longPressAnywhere(onLongPress: () -> Unit): Modifier {
    val current by rememberUpdatedState(onLongPress)
    return pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var cancelled = false
            withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == down.id }
                    if (change == null || !change.pressed || (change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                        cancelled = true
                        return@withTimeoutOrNull
                    }
                }
            }
            if (!cancelled) {
                current()
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    event.changes.forEach { it.consume() }
                    if (event.changes.none { it.pressed }) break
                }
            }
        }
    }
}
