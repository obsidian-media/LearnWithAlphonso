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
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.ui.ai.AiDisclosureGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoMascotBanner
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.league.ScreenHeader
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** Port of ConversationView.swift's list: campaigns first, then scenarios. */
@Composable
fun PracticeScreen(container: AppContainer, onOpenScenario: (String) -> Unit, onOpenCampaign: (String) -> Unit) {
    val palette = AlphonsoColor.palette
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Practice speaking", style = MaterialTheme.typography.headlineMedium, color = palette.ink, modifier = Modifier.padding(bottom = 8.dp)) }
        if (container.content.campaigns.isNotEmpty()) {
            item { AlphonsoSectionHeader("Campaigns") }
            items(container.content.campaigns, key = { "c-${it.id}" }) { c ->
                AlphonsoRowCard(c.title, c.blurb, leadingEmoji = c.emoji, modifier = Modifier.clickable { onOpenCampaign(c.id) })
            }
            item { AlphonsoSectionHeader("Scenarios", Modifier.padding(top = 8.dp)) }
        }
        items(container.content.scenarios, key = { "s-${it.id}" }) { s ->
            AlphonsoRowCard(s.title, s.blurb, leadingEmoji = s.emoji, modifier = Modifier.clickable { onOpenScenario(s.id) })
        }
    }
}

@Composable
private fun Bubble(turn: ChatMessage, confidence: Double?, userTint: Color, userText: Color) {
    val palette = AlphonsoColor.palette
    val isUser = turn.role == "user"
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
            if (isUser) Spacer(Modifier.width(40.dp))
            Text(
                turn.content,
                modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(AlphonsoRadius.xl)).background(if (isUser) userTint else palette.parchment).padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyLarge, color = if (isUser) userText else palette.ink,
            )
            if (!isUser) Spacer(Modifier.width(40.dp))
        }
        confidence?.let { Text(BaseConversationViewModel.clarityLabel(it), style = MaterialTheme.typography.labelSmall, color = palette.inkSoft, modifier = Modifier.padding(end = 6.dp)) }
    }
}

@Composable
private fun ConversationBody(vm: BaseConversationViewModel, title: String, tint: Color, userText: Color, onBack: () -> Unit, header: @Composable () -> Unit = {}, footer: @Composable () -> Unit = {}, actions: @Composable () -> Unit = {}) {
    val palette = AlphonsoColor.palette
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    val listState = rememberLazyListState()
    DisposableEffect(Unit) { onDispose { vm.onLeave() } }
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size) }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader(title, onBack, actions)
        header()
        LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(state.turns) { index, turn -> Bubble(turn, state.confidenceByTurn[index], tint, userText) }
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
    val scenario = container.content.scenarios.firstOrNull { it.id == scenarioId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: ScenarioConversationViewModel = viewModel(key = "scenario-$scenarioId") {
        ScenarioConversationViewModel(scenario, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient) { playback.play(it) }
    }
    val palette = AlphonsoColor.palette
    AiDisclosureGate(container.prefs) {
        ConversationBody(vm, scenario.title, palette.moss, Color.White, onBack)
    }
}

@Composable
fun CampaignConversationScreen(container: AppContainer, campaignId: String, onBack: () -> Unit) {
    val campaign = container.content.campaigns.firstOrNull { it.id == campaignId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: CampaignConversationViewModel = viewModel(key = "campaign-$campaignId") {
        CampaignConversationViewModel(campaign, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient) { playback.play(it) }
    }
    val palette = AlphonsoColor.palette
    val progress by vm.campaignState.collectAsState()
    val state by vm.state.collectAsState()
    AiDisclosureGate(container.prefs) {
        ConversationBody(
            vm, campaign.title, palette.moss, Color.White, onBack,
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
