package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.audio.HoldToTalkButton
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReporting
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.AiReportSender
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordCopy
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.ui.ai.AiReportStatusHost
import com.obsidianmedia.learnwithalphonso.ui.ai.ReportableAiMessage
import com.obsidianmedia.learnwithalphonso.ui.ai.accessibilityActions
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.league.ScreenHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHintLine
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText

/** Port of ConversationView.swift's list: campaigns first, then scenarios. */
@Composable
fun PracticeScreen(container: AppContainer, onOpenScenario: (String) -> Unit, onOpenCampaign: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    // Practice follows the course chosen on the Learn tab, so a French learner practises with the French partners.
    val course by container.activeCourse.course.collectAsState()
    val campaigns = container.content.campaigns(course)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Practice speaking", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(bottom = 8.dp)) }
        if (campaigns.isNotEmpty()) {
            item { AlphonsoSectionHeader("Campaigns") }
            items(campaigns, key = { "c-${course.code}-${it.id}" }) { c ->
                AlphonsoRowCard(c.title, c.blurb, leadingEmoji = c.emoji, modifier = Modifier.clickable { onOpenCampaign(c.id) })
            }
            item { AlphonsoSectionHeader("Scenarios", Modifier.padding(top = 8.dp)) }
        }
        items(container.content.scenarios(course), key = { "s-${course.code}-${it.id}" }) { s ->
            AlphonsoRowCard(s.title, s.blurb, leadingEmoji = s.emoji, modifier = Modifier.clickable { onOpenScenario(s.id) })
        }
    }
}

/** What a conversation screen needs to report one of its replies: the client and how to build the report for a turn. */
private class ReplyReporting(val sender: AiReportSender, val makeReport: (message: String, sceneIndex: Int, reason: AiResponseReportReason) -> AiResponseReport)

@Composable
private fun Bubble(turn: ChatMessage, confidence: Double?, userTint: Color, userText: Color, reportable: Boolean, sender: AiReportSender, makeReport: (AiResponseReportReason) -> AiResponseReport, course: String) {
    val palette = AlphonsoColor.palette
    val isUser = turn.role == "user"
    val saveWord = LocalSaveWordHandler.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
            if (isUser) Spacer(Modifier.width(40.dp))
            ReportableAiMessage(enabled = reportable, sender = sender, makeReport = makeReport) { reportModifier, reportActions ->
                val bubble = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(AlphonsoRadius.xl)).then(reportModifier).background(if (isUser) userTint else palette.parchment).padding(horizontal = 14.dp, vertical = 10.dp)
                // The partner speaks the course's language, so every word of a reply is a word of the course.
                if (!isUser && saveWord != null) {
                    TappableText(turn.content, course, saveWord, modifier = bubble, style = MaterialTheme.typography.bodyLarge, color = palette.ink, extraActions = reportActions)
                } else {
                    Text(turn.content, modifier = bubble.accessibilityActions(reportActions), style = MaterialTheme.typography.bodyLarge, color = if (isUser) userText else palette.ink)
                }
            }
            if (!isUser) Spacer(Modifier.width(40.dp))
        }
        confidence?.let { Text(BaseConversationViewModel.clarityLabel(it), style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, modifier = Modifier.padding(end = 6.dp)) }
    }
}

@Composable
private fun ConversationBody(container: AppContainer, vm: BaseConversationViewModel, title: String, tint: Color, userText: Color, onBack: () -> Unit, reporting: ReplyReporting, course: String, header: @Composable () -> Unit = {}, footer: @Composable () -> Unit = {}, actions: @Composable () -> Unit = {}) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val listState = rememberLazyListState()
    DisposableEffect(Unit) { onDispose { vm.onLeave() } }
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size) }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        AiReportStatusHost(reporting.sender)
        ScreenHeader(title, onBack, actions)
        header()
        // Words are plain-looking links, so say they are tappable.
        SaveWordHintLine(container, SavedWordCopy.REPLY_HINT, limited = false)
        LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(state.turns) { index, turn ->
                Bubble(
                    turn, state.confidenceByTurn[index], tint, userText,
                    reportable = AiReplyReporting.isReportable(turn.role, index, state.openerIndices),
                    sender = reporting.sender,
                    makeReport = { reason -> reporting.makeReport(turn.content, AiReplyReporting.sceneIndexOfTurn(index, state.openerIndices), reason) },
                    course = course,
                )
            }
            item { footer() }
        }
        state.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, modifier = Modifier.padding(horizontal = 16.dp)) }
        val busy = when (state.phase) { ConversationPhase.TRANSCRIBING -> "Listening..."; ConversationPhase.THINKING -> "Thinking..."; ConversationPhase.SPEAKING -> "..."; ConversationPhase.IDLE -> null }
            ?: if (phase == TurnPhase.TRANSCRIBING) "Listening..." else null
        Column(Modifier.padding(16.dp)) {
            HoldToTalkButton(
                phase = phase, busyLabel = busy, tint = tint,
                hint = if (phase == TurnPhase.RECORDING) "Listening. Release to send" else "Hold to talk",
                accessibilityLabel = "Hold to talk", onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
            )
        }
    }
}

@Composable
fun ScenarioConversationScreen(container: AppContainer, scenarioId: String, onBack: () -> Unit) {
    // The course is fixed when the screen opens; the conversation stays in it. The view model is keyed by it.
    val course = remember { container.activeCourse.course.value }
    val scenario = container.content.scenarios(course).firstOrNull { it.id == scenarioId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: ScenarioConversationViewModel = viewModel(key = "scenario-${course.code}-$scenarioId") {
        ScenarioConversationViewModel(scenario, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course)
    }
    val palette = AlphonsoColor.palette
    AiConsentGate(container, onDecline = onBack) {
        SaveWordHost(container) {
            ConversationBody(
                container, vm, scenario.title, palette.moss, Color.White, onBack,
                reporting = ReplyReporting(container.aiReports) { message, _, reason ->
                    AiReplyReports.scenario(message, course.code, scenario.id, reason)
                },
                course = course.code,
            )
        }
    }
}

@Composable
fun CampaignConversationScreen(container: AppContainer, campaignId: String, onBack: () -> Unit) {
    val course = remember { container.activeCourse.course.value }
    val campaign = container.content.campaigns(course).firstOrNull { it.id == campaignId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: CampaignConversationViewModel = viewModel(key = "campaign-${course.code}-$campaignId") {
        CampaignConversationViewModel(campaign, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course)
    }
    val palette = AlphonsoColor.palette
    val progress by vm.campaignState.collectAsState()
    val state by vm.state.collectAsState()
    AiConsentGate(container, onDecline = onBack) {
      SaveWordHost(container) {
        ConversationBody(
            container, vm, campaign.title, palette.moss, Color.White, onBack,
            reporting = ReplyReporting(container.aiReports) { message, sceneIndex, reason ->
                AiReplyReports.campaign(message, course.code, campaign.id, sceneIndex, reason)
            },
            course = course.code,
            header = {
                if (!progress.finished) Text("Scene ${progress.sceneIndex + 1} of ${campaign.scenes.size}: ${vm.scene.title}", style = MaterialTheme.typography.labelLarge, color = palette.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            },
            footer = {
                val canContinue = state.turns.drop(progress.sceneAnchor).count { it.role == "user" } >= vm.scene.minTurns
                if (progress.finished) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AlphonsoMascotBanner("Nice work. Campaign complete!")
                        Text("You made it through all ${campaign.scenes.size} scenes of ${campaign.title}.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center)
                    }
                } else if (canContinue) {
                    AlphonsoPrimaryButton(if (vm.isLastScene) "Finish campaign" else "Continue: ${campaign.scenes[progress.sceneIndex + 1].title} →", onClick = vm::continueToNextScene)
                }
            },
            actions = { if (!progress.finished) TextButton(onClick = vm::restartScene) { Text("Restart scene", color = palette.moss) } },
        )
      }
    }
}
