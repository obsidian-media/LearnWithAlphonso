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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
import com.obsidianmedia.learnwithalphonso.ui.explain.ExplainInMyLanguage
import com.obsidianmedia.learnwithalphonso.audio.HoldToTalkButton
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReporting
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.AiReportSender
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode
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
import com.obsidianmedia.learnwithalphonso.ui.practice.call.PracticeCallScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.call.alphonsoKit
import com.obsidianmedia.learnwithalphonso.ui.practice.call.systemMotionReduced
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.word.LocalSaveWordHandler
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHintLine
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import com.obsidianmedia.learnwithalphonso.ui.word.TappableText

/** What a conversation screen needs to report one of its replies: the client and how to build the report for a turn. */
private class ReplyReporting(val sender: AiReportSender, val makeReport: (message: String, sceneIndex: Int, reason: AiResponseReportReason) -> AiResponseReport)

@Composable
private fun Bubble(container: AppContainer, turn: ChatMessage, confidence: Double?, userTint: Color, userText: Color, reportable: Boolean, sender: AiReportSender, makeReport: (AiResponseReportReason) -> AiResponseReport, course: String) {
    val palette = LocalAlphonsoTokens.current
    val isUser = turn.role == "user"
    val saveWord = LocalSaveWordHandler.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
            if (isUser) Spacer(Modifier.width(AlphonsoTokens.Space.minTouch))
            ReportableAiMessage(enabled = reportable, sender = sender, makeReport = makeReport) { reportModifier, reportActions ->
                val bubble = Modifier.widthIn(max = AlphonsoTokens.Space.s12 * 6).clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).then(reportModifier).background(if (isUser) userTint else palette.card).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3)
                // The partner speaks the course's language, so every word of a reply is a word of the course.
                if (!isUser && saveWord != null) {
                    TappableText(turn.content, course, SaveWordMode.AllWords, saveWord, modifier = bubble, style = AlphonsoTokens.Type.body.toTextStyle(), color = palette.ink, extraActions = reportActions)
                } else {
                    Text(turn.content, modifier = bubble.accessibilityActions(reportActions), style = AlphonsoTokens.Type.body.toTextStyle(), color = if (isUser) userText else palette.ink)
                }
            }
            if (!isUser) Spacer(Modifier.width(AlphonsoTokens.Space.minTouch))
        }
        // "Say that in <language>": the partner's reply, translated under its bubble on request.
        if (!isUser) ExplainInMyLanguage(container, remember(turn.content, course) { ExplainRules.message(turn.content, course) }, Modifier.padding(top = AlphonsoTokens.Space.s1))
        confidence?.let { Text(BaseConversationViewModel.clarityLabel(it), style = AlphonsoTokens.Type.caption.toTextStyle(), color = palette.inkSoft, modifier = Modifier.padding(end = AlphonsoTokens.Space.s2)) }
    }
}

/** The bubbles and the "tap a word" hint: the middle of the classic screen, and the body of the call's sheet. */
@Composable
private fun TranscriptList(container: AppContainer, vm: BaseConversationViewModel, tint: Color, userText: Color, reporting: ReplyReporting, course: String, modifier: Modifier, footer: @Composable () -> Unit = {}) {
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    LaunchedEffect(state.turns.size) { if (state.turns.isNotEmpty()) listState.animateScrollToItem(state.turns.size) }
    Column(modifier) {
        // Words are plain-looking links, so say they are tappable.
        SaveWordHintLine(container, SavedWordCopy.REPLY_HINT, limited = false)
        LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(AlphonsoTokens.Space.s4), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            itemsIndexed(state.turns) { index, turn ->
                Bubble(
                    container, turn, state.confidenceByTurn[index], tint, userText,
                    reportable = AiReplyReporting.isReportable(turn.role, index, state.openerIndices),
                    sender = reporting.sender,
                    makeReport = { reason -> reporting.makeReport(turn.content, state.sceneOffset + AiReplyReporting.sceneIndexOfTurn(index, state.openerIndices), reason) },
                    course = course,
                )
            }
            item { footer() }
        }
    }
}

@Composable
private fun ConversationBody(container: AppContainer, vm: BaseConversationViewModel, title: String, tint: Color, userText: Color, onBack: () -> Unit, reporting: ReplyReporting, course: String, header: @Composable () -> Unit = {}, footer: @Composable () -> Unit = {}, actions: @Composable () -> Unit = {}) {
    val palette = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    val phase by vm.engine.phase.collectAsState()
    DisposableEffect(Unit) { onDispose { vm.onLeave() } }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        AiReportStatusHost(reporting.sender)
        ScreenHeader(title, onBack, actions)
        header()
        TranscriptList(container, vm, tint, userText, reporting, course, Modifier.weight(1f), footer)
        state.error?.let { Text(it, style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.wrongInk, modifier = Modifier.padding(horizontal = AlphonsoTokens.Space.s4)) }
        val busy = when (state.phase) { ConversationPhase.TRANSCRIBING -> "Listening..."; ConversationPhase.THINKING -> "Thinking..."; ConversationPhase.SPEAKING -> "..."; ConversationPhase.IDLE -> null }
            ?: if (phase == TurnPhase.TRANSCRIBING) "Listening..." else null
        Column(Modifier.padding(AlphonsoTokens.Space.s4)) {
            if (vm.chatMode) PracticeTextComposer(vm) else HoldToTalkButton(
                phase = phase, busyLabel = busy, tint = tint,
                hint = if (phase == TurnPhase.RECORDING) "Listening. Release to send" else "Hold to talk",
                accessibilityLabel = "Hold to talk", onPressBegan = vm::pressBegan, onPressEnded = vm::pressEnded,
            )
        }
    }
}

@Composable
fun ScenarioConversationScreen(container: AppContainer, scenarioId: String, onBack: () -> Unit, chatMode: Boolean = false) {
    // The course is fixed when the screen opens; the conversation stays in it. The view model is keyed by it.
    val course = remember { container.activeCourse.course.value }
    val scenario = container.content.scenarios(course).firstOrNull { it.id == scenarioId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: ScenarioConversationViewModel = viewModel(key = "scenario-${course.code}-$scenarioId") {
        ScenarioConversationViewModel(scenario, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course, alphonsoVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Alphonso, c) })
    }
    vm.chatMode = chatMode
    val scope = rememberCoroutineScope()
    val result by vm.result.collectAsState()
    val endCall: () -> Unit = { scope.launch { if (vm.finishPractice() == null) onBack() } }
    androidx.activity.compose.BackHandler(enabled = result == null, onBack = endCall)
    result?.let { r ->
        PracticeResultScreen(r, scenario.id, course.code, vm.elapsedSeconds, vm.slip, retry = { vm.retryScenario(speak = false) }, nextLabel = "Done", done = onBack)
        return
    }
    val palette = LocalAlphonsoTokens.current
    val context = LocalContext.current
    // "Show Alphonso while practicing" (Settings, on by default): a full-screen call. Off keeps the classic screen.
    val showCall = !chatMode
    val reporting = ReplyReporting(container.aiReports) { message, _, reason ->
        AiReplyReports.scenario(message, course.code, scenario.id, reason)
    }
    AiConsentGate(container, onDecline = onBack) {
        // Alphonso says the scene's opening line out loud (build 59 only showed it). Inside the gate, so nothing is
        // fetched before consent; again on each return, from the cache, while the learner has not answered.
        LaunchedEffect(Unit) { vm.speakOpener() }
        SaveWordHost(container) {
            if (showCall) {
                DisposableEffect(Unit) { onDispose { vm.onLeave() } }
                PracticeCallScreen(
                    kit = remember { alphonsoKit(context) }, title = scenario.title, scenarioId = scenario.id, course = course,
                    vm = vm, playback = playback, reducedMotion = systemMotionReduced(context), onEnd = endCall,
                    statusHost = { AiReportStatusHost(reporting.sender) },
                    transcript = { TranscriptList(container, vm, palette.choice, LocalAlphonsoTokens.current.onHero, reporting, course.code, Modifier) },
                )
            } else {
                ConversationBody(container, vm, scenario.title, palette.choice, LocalAlphonsoTokens.current.onHero, endCall, reporting = reporting, course = course.code)
            }
        }
    }
}

@Composable
fun CampaignConversationScreen(container: AppContainer, campaignId: String, onBack: () -> Unit, startScene: Int = 0, chatMode: Boolean = false) {
    val course = remember { container.activeCourse.course.value }
    val campaign = container.content.campaigns(course).firstOrNull { it.id == campaignId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: CampaignConversationViewModel = viewModel(key = "campaign-${course.code}-$campaignId") {
        CampaignConversationViewModel(campaign, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course, alphonsoVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Alphonso, c) }, startScene = startScene)
    }
    vm.chatMode = chatMode
    val scope = rememberCoroutineScope()
    val result by vm.result.collectAsState()
    var advancing by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val endCall: () -> Unit = { advancing = false; scope.launch { if (vm.finishPractice() == null) onBack() } }
    val advanceCall: () -> Unit = { advancing = true; scope.launch { if (vm.finishPractice() == null) { vm.resetPractice(); vm.continueToNextScene() } } }
    androidx.activity.compose.BackHandler(enabled = result == null, onBack = endCall)
    result?.let { r ->
        PracticeResultScreen(r, com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.room(campaign.id, vm.scene.id), course.code, vm.elapsedSeconds, vm.slip, retry = { vm.restartScene(speak = false) }, nextLabel = if (vm.isLastScene || (r.stars == 0 && !advancing)) "Done" else "Continue", done = { if (vm.isLastScene || (r.stars == 0 && !advancing)) onBack() else vm.continueToNextScene(speak = false) })
        return
    }
    val palette = LocalAlphonsoTokens.current
    val progress by vm.campaignState.collectAsState()
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    // "Show Alphonso while practicing" (Settings, on by default): a full-screen call in the default study room.
    val showCall = !chatMode
    val reporting = ReplyReporting(container.aiReports) { message, sceneIndex, reason ->
        AiReplyReports.campaign(message, course.code, campaign.id, sceneIndex, reason)
    }
    val sceneFooter: @Composable () -> Unit = {
        val canContinue = state.turns.drop(progress.sceneAnchor).count { it.role == "user" } >= vm.scene.minTurns
        if (progress.finished) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                AlphonsoMascotBanner("Nice work. Campaign complete!")
                Text("You made it through all ${campaign.scenes.size} scenes of ${campaign.title}.", style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.inkSoft, textAlign = TextAlign.Center)
            }
        } else if (canContinue) {
            AlphonsoPrimaryButton(if (vm.isLastScene) "Finish campaign" else "Continue: ${campaign.scenes[progress.sceneIndex + 1].title} →", onClick = advanceCall)
        }
    }
    AiConsentGate(container, onDecline = onBack) {
      // Alphonso says the scene's opening line out loud (build 59 only showed it); inside the gate, as above.
      LaunchedEffect(Unit) { vm.speakOpener() }
      SaveWordHost(container) {
        if (showCall) {
            DisposableEffect(Unit) { onDispose { vm.onLeave() } }
            PracticeCallScreen(
                kit = remember { alphonsoKit(context) },
                title = if (progress.finished) campaign.title else "${campaign.title}: scene ${progress.sceneIndex + 1} of ${campaign.scenes.size}",
                scenarioId = com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.room(campaign.id, vm.scene.id), course = course, vm = vm, playback = playback,
                reducedMotion = systemMotionReduced(context), onEnd = endCall,
                statusHost = { AiReportStatusHost(reporting.sender) },
                extra = {
                    val canContinue = state.turns.drop(progress.sceneAnchor).count { it.role == "user" } >= vm.scene.minTurns
                    if (progress.finished) {
                        Text("Nice work, campaign complete!", color = LocalAlphonsoTokens.current.onHero, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.pill)).background(LocalAlphonsoTokens.current.hero).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s2))
                    } else if (canContinue) {
                        AlphonsoPrimaryButton(if (vm.isLastScene) "Finish campaign" else "Continue: ${campaign.scenes[progress.sceneIndex + 1].title} →", onClick = advanceCall)
                    }
                },
                transcript = {
                    Column {
                        if (!progress.finished) TextButton(onClick = { vm.restartScene() }) { Text("Restart scene", color = palette.choice) }
                        TranscriptList(container, vm, palette.choice, LocalAlphonsoTokens.current.onHero, reporting, course.code, Modifier, sceneFooter)
                    }
                },
            )
            return@SaveWordHost
        }
        ConversationBody(
            container, vm, campaign.title, palette.choice, LocalAlphonsoTokens.current.onHero, endCall,
            reporting = reporting,
            course = course.code,
            header = {
                if (!progress.finished) Text("Scene ${progress.sceneIndex + 1} of ${campaign.scenes.size}: ${vm.scene.title}", style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1))
            },
            footer = {
                val canContinue = state.turns.drop(progress.sceneAnchor).count { it.role == "user" } >= vm.scene.minTurns
                if (progress.finished) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        AlphonsoMascotBanner("Nice work. Campaign complete!")
                        Text("You made it through all ${campaign.scenes.size} scenes of ${campaign.title}.", style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.inkSoft, textAlign = TextAlign.Center)
                    }
                } else if (canContinue) {
                    AlphonsoPrimaryButton(if (vm.isLastScene) "Finish campaign" else "Continue: ${campaign.scenes[progress.sceneIndex + 1].title} →", onClick = advanceCall)
                }
            },
            actions = { if (!progress.finished) TextButton(onClick = { vm.restartScene() }) { Text("Restart scene", color = palette.choice) } },
        )
      }
    }
}
