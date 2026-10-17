package com.obsidianmedia.learnwithalphonso.ui.ai

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiReportSender
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * Long-press an AI message to report it into the moderation queue (`content_reports`, kind 'ai_response'), with a
 * TalkBack long-click action and custom action for the same. Port of ReportableAIMessage in AIResponseReporting.swift.
 * [content] draws the message and applies the modifier it is given. `enabled` is false for the learner's own turns and
 * for fixed opening lines (written by us, not the model).
 *
 * The request is sent by [sender], which outlives this bubble; its progress and result are shown once per screen by
 * [AiReportStatusHost]. While a report is in flight the reasons are disabled, so a second tap cannot add a second row.
 */
@Composable
fun ReportableAiMessage(
    enabled: Boolean,
    sender: AiReportSender,
    makeReport: (AiResponseReportReason) -> AiResponseReport,
    content: @Composable (Modifier) -> Unit,
) {
    if (!enabled) {
        content(Modifier)
        return
    }
    val palette = AlphonsoColor.palette
    val sending by sender.state.collectAsState()
    var showMenu by rememberSaveable { mutableStateOf(false) }
    var showReasons by rememberSaveable { mutableStateOf(false) }

    // A long press, not a click: a plain tap does nothing, shows no ripple and is not announced as a button. TalkBack
    // gets the same action as a long click and as a named custom action.
    content(
        Modifier
            .pointerInput(Unit) { detectTapGestures(onLongPress = { showMenu = true }) }
            .semantics {
                onLongClick(label = AiConsentCopy.reportAction) { showReasons = true; true }
                customActions = listOf(CustomAccessibilityAction(AiConsentCopy.reportAction) { showReasons = true; true })
            },
    )
    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
        DropdownMenuItem(
            text = { Text(AiConsentCopy.reportAction) }, enabled = !sending.sending,
            onClick = { showMenu = false; showReasons = true },
        )
    }
    if (showReasons) {
        AlertDialog(
            onDismissRequest = { showReasons = false },
            title = { Text(AiConsentCopy.reportAction) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(AiConsentCopy.reportReviewNote, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    AiResponseReportReason.entries.forEach { reason ->
                        TextButton(
                            enabled = !sending.sending,
                            onClick = {
                                // Ignored by the sender when a report is already in flight.
                                if (sender.submit(makeReport(reason)) != null) showReasons = false
                            },
                        ) { Text(reason.label, color = if (sending.sending) palette.inkSoft else palette.ink) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showReasons = false }) { Text("Cancel", color = palette.inkSoft) } },
        )
    }
}

/** Shows "Sending your report..." while a report is in flight and its outcome after, once per screen. */
@Composable
fun AiReportStatusHost(sender: AiReportSender) {
    val palette = AlphonsoColor.palette
    val status by sender.state.collectAsState()
    if (status.sending) {
        AlertDialog(
            onDismissRequest = { },
            text = {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = palette.moss, modifier = Modifier.then(Modifier))
                    Text("Sending your report...", style = MaterialTheme.typography.bodyMedium, color = palette.ink)
                }
            },
            confirmButton = {},
        )
    }
    status.message?.let { message ->
        AlertDialog(
            onDismissRequest = sender::dismissMessage,
            text = { Text(message) },
            confirmButton = { TextButton(onClick = sender::dismissMessage) { Text("OK", color = palette.moss) } },
        )
    }
}
