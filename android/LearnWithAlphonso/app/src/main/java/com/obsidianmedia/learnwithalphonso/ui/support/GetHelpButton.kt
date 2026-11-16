package com.obsidianmedia.learnwithalphonso.ui.support

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import com.obsidianmedia.learnwithalphonso.core.logic.SupportCopy
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton

/**
 * Opens the Help chat. The root provides it over the signed-in screens; it is null anywhere else, so "Get help" never
 * shows without a session to chat with (iOS `helpSession`, web `GetHelpLink`).
 */
val LocalOpenHelp = staticCompositionLocalOf<(() -> Unit)?> { null }

/** "Get help" on a screen that reports a problem the learner cannot fix alone. Nothing when the chat cannot be opened. */
@Composable
fun GetHelpButton(prominent: Boolean = false) {
    val open = LocalOpenHelp.current ?: return
    DsCompactButton(SupportCopy.GET_HELP, open, primary = prominent)
}
