package com.obsidianmedia.learnwithalphonso.ui.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.ui.res.painterResource
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogBody
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogTitle
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiReportSender
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason

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
    content: @Composable (modifier: Modifier, actions: List<CustomAccessibilityAction>) -> Unit,
) {
    if (!enabled) {
        content(Modifier, emptyList())
        return
    }
    val ds = LocalAlphonsoTokens.current
    val sending by sender.state.collectAsState()
    var showMenu by rememberSaveable { mutableStateOf(false) }
    var showReasons by rememberSaveable { mutableStateOf(false) }

    // A long press, not a click: a plain tap does nothing, shows no ripple and is not announced as a button. TalkBack
    // gets the same action as a long click and as a named custom action.
    //
    // The long press is watched before the children (see [longPressAnywhere]), so it also works over a word that is a
    // link. The custom action is handed to the content rather than set here: a text with its own custom actions (the
    // save-a-word list) must put both in ONE list, because two semantics modifiers on one node do not add them up.
    content(
        Modifier
            .longPressAnywhere { showMenu = true }
            .semantics { onLongClick(label = AiConsentCopy.reportAction) { showReasons = true; true } },
        listOf(CustomAccessibilityAction(AiConsentCopy.reportAction) { showReasons = true; true }),
    )
    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }, containerColor = ds.card) {
        DropdownMenuItem(
            text = { Text(AiConsentCopy.reportAction, style = FootnoteType, color = if (sending.sending) ds.inkFaint else ds.ink) },
            enabled = !sending.sending,
            onClick = { showMenu = false; showReasons = true },
        )
    }
    if (showReasons) {
        DsDialog({ showReasons = false }) {
            DsDialogTitle(AiConsentCopy.reportAction)
            DsDialogBody(AiConsentCopy.reportReviewNote)
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                AiResponseReportReason.entries.forEach { reason ->
                    // A reason is a button, not a selection: tapping it sends the report (ignored by the sender while one is in flight).
                    DsChip(
                        reason.label, selected = false,
                        onClick = { if (!sending.sending && sender.submit(makeReport(reason)) != null) showReasons = false },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            DsCompactButton("Cancel", { showReasons = false })
        }
    }
}

/** Shows "Sending your report..." while a report is in flight and its outcome after, once per screen. */
@Composable
fun AiReportStatusHost(sender: AiReportSender) {
    val ds = LocalAlphonsoTokens.current
    val status by sender.state.collectAsState()
    if (status.sending) {
        DsDialog(onDismiss = { }, dismissible = false) {
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(color = ds.choice)
                Text("Sending your report...", style = FootnoteType, color = ds.ink)
            }
        }
    }
    status.message?.let { message ->
        DsDialog(sender::dismissMessage) {
            Icon(painterResource(R.drawable.ds_check), null, tint = ds.right, modifier = Modifier.size(AlphonsoTokens.Space.s12))
            DsDialogBody(message)
            DsCompactButton("OK", sender::dismissMessage, primary = true)
        }
    }
}

/** Applies the actions [ReportableAiMessage] hands its content to a plain (non-tappable) text. */
fun Modifier.accessibilityActions(actions: List<CustomAccessibilityAction>): Modifier =
    if (actions.isEmpty()) this else semantics { customActions = actions }
