package com.obsidianmedia.learnwithalphonso.ui.ai

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.reportAiResponse
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Long-press an AI message to report it into the moderation queue (`content_reports`, kind 'ai_response'), with a
 * TalkBack custom action for the same. Port of ReportableAIMessage in AIResponseReporting.swift. [content] draws the
 * message and applies the modifier it is given. `enabled` is false for the learner's own turns and for fixed opening
 * lines (written by us, not the model).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReportableAiMessage(
    enabled: Boolean,
    client: ProgressSyncClient,
    makeReport: (AiResponseReportReason) -> AiResponseReport,
    content: @Composable (Modifier) -> Unit,
) {
    if (!enabled) {
        content(Modifier)
        return
    }
    val palette = AlphonsoColor.palette
    val scope = rememberCoroutineScope()
    var showMenu by rememberSaveable { mutableStateOf(false) }
    var showReasons by rememberSaveable { mutableStateOf(false) }
    var result by rememberSaveable { mutableStateOf<String?>(null) }

    content(
        Modifier
            .combinedClickable(onClick = {}, onLongClick = { showMenu = true }, onLongClickLabel = AiConsentCopy.reportAction)
            .semantics { customActions = listOf(CustomAccessibilityAction(AiConsentCopy.reportAction) { showReasons = true; true }) },
    )
    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
        DropdownMenuItem(text = { Text(AiConsentCopy.reportAction) }, onClick = { showMenu = false; showReasons = true })
    }
    if (showReasons) {
        AlertDialog(
            onDismissRequest = { showReasons = false },
            title = { Text(AiConsentCopy.reportAction) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(AiConsentCopy.reportReviewNote, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    AiResponseReportReason.entries.forEach { reason ->
                        TextButton(onClick = {
                            showReasons = false
                            scope.launch {
                                result = try {
                                    client.reportAiResponse(makeReport(reason))
                                    AiConsentCopy.reportThanks
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    AiConsentCopy.reportFailed
                                }
                            }
                        }) { Text(reason.label, color = palette.ink) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showReasons = false }) { Text("Cancel", color = palette.inkSoft) } },
        )
    }
    result?.let { message ->
        AlertDialog(
            onDismissRequest = { result = null },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { result = null }) { Text("OK", color = palette.moss) } },
        )
    }
}
