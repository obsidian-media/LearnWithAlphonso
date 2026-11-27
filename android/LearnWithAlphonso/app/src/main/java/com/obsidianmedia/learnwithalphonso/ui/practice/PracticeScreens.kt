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
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.semantics.semantics
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
import com.obsidianmedia.learnwithalphonso.core.logic.PracticeResultContext
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
        // Chat mode (Practice hub v3): the back chip with the screen's actions, then the scenario's title and the scene line.
        DsBackBar("Practice", onBack, actions = actions)
        Text(title, style = HeadlineType, color = palette.ink, modifier = Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).semantics { heading() })
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
fun ScenarioConversationScreen(container: AppContainer, scenarioId: String, onBack: () -> Unit, chatMode: Boolean = false, onOpenMemory: () -> Unit = {}) {
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
    var unscored by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val endCall: () -> Unit = { scope.launch {
        if (vm.finishPractice() == null) {
            // Offline: stay with a notice when replies were sent; with none there is nothing to keep.
            if (com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.staysOnUnscored(vm.state.value.turns.count { it.role == "user" })) unscored = true else onBack()
        }
    } }
    androidx.activity.compose.BackHandler(enabled = result == null && !unscored, onBack = endCall)
    if (unscored) {
        PracticeUnscoredScreen(retry = { unscored = false; vm.retryScenario(speak = false) })
        return
    }
    result?.let { r ->
        val recapUi by vm.recap.ui.collectAsState()
        PracticeResultScreen(r, scenario.id, course.code, vm.elapsedSeconds, vm.slip, context = PracticeResultContext.Scenario, retry = { vm.retryScenario(speak = false) }, forward = onBack,
            recap = recapUi, onSpeakPhrase = vm::speakPhrase, onReviewRecap = vm.recap::addToReview, onOpenMemory = onOpenMemory, onRetryRecap = vm.recap::retry)
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
fun CampaignConversationScreen(container: AppContainer, campaignId: String, onBack: () -> Unit, startScene: Int = 0, chatMode: Boolean = false, onOpenMemory: () -> Unit = {}) {
    val course = remember { container.activeCourse.course.value }
    val campaign = container.content.campaigns(course).firstOrNull { it.id == campaignId } ?: run { onBack(); return }
    val playback = remember { container.newPlayback() }
    val vm: CampaignConversationViewModel = viewModel(key = "campaign-${course.code}-$campaignId") {
        CampaignConversationViewModel(campaign, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course, alphonsoVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Alphonso, c) }, startScene = startScene)
    }
    vm.chatMode = chatMode
    val scope = rememberCoroutineScope()
    val result by vm.result.collectAsState()
    // Ending the scene scores it and opens its result; the result's Next scene (Finish campaign on the last scene) moves on.
    // Without a scored result (offline, or no judged reply) there is nothing to show and no star to earn: the learner leaves.
    var unscored by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    // Hands-free carries across the scenes of one run: noted before the call finishes (which turns it off), re-armed when the next scene's call opens.
    val endCall: () -> Unit = { vm.carryHandsFreeToNextScene(); scope.launch {
        if (vm.finishPractice() == null) {
            // Offline: stay on the scene (earlier scenes keep their progress) when replies were sent.
            val replies = vm.state.value.turns.drop(vm.campaignState.value.sceneAnchor).count { it.role == "user" }
            if (com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.staysOnUnscored(replies)) unscored = true else onBack()
        }
    } }
    androidx.activity.compose.BackHandler(enabled = result == null && !unscored, onBack = endCall)
    if (unscored) {
        PracticeUnscoredScreen(retry = { unscored = false; vm.resetPractice(); vm.restartScene(speak = false) })
        return
    }
    result?.let { r ->
        val recapUi by vm.recap.ui.collectAsState()
        PracticeResultScreen(
            r, com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.room(campaign.id, vm.scene.id), course.code, vm.elapsedSeconds, vm.slip,
            context = PracticeResultContext.CampaignScene(isLast = vm.isLastScene),
            retry = { vm.restartScene(speak = false) },
            // Next scene needs a star: a scene with none shows Done, which leaves (a talk counts done from one star, #511).
            forward = { if (r.stars >= 1) vm.continueToNextScene(speak = false) else onBack() },
            recap = recapUi, onSpeakPhrase = vm::speakPhrase, onReviewRecap = vm.recap::addToReview, onOpenMemory = onOpenMemory, onRetryRecap = vm.recap::retry,
        )
        return
    }
    val palette = LocalAlphonsoTokens.current
    val progress by vm.campaignState.collectAsState()
    val context = LocalContext.current
    // "Show Alphonso while practicing" (Settings, on by default): a full-screen call in the default study room.
    val showCall = !chatMode
    val reporting = ReplyReporting(container.aiReports) { message, sceneIndex, reason ->
        AiReplyReports.campaign(message, course.code, campaign.id, sceneIndex, reason)
    }
    val sceneFooter: @Composable () -> Unit = {
        if (progress.finished) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                AlphonsoMascotBanner("Nice work. Campaign complete!")
                Text("You made it through all ${campaign.scenes.size} scenes of ${campaign.title}.", style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.inkSoft, textAlign = TextAlign.Center)
            }
        }
    }
    AiConsentGate(container, onDecline = onBack) {
      // Alphonso says the scene's opening line out loud (build 59 only showed it); inside the gate, as above.
      LaunchedEffect(Unit) { vm.speakOpener(); vm.rearmHandsFreeIfCarried() }
      SaveWordHost(container) {
        if (showCall) {
            DisposableEffect(Unit) { onDispose { vm.onLeave() } }
            PracticeCallScreen(
                kit = remember { alphonsoKit(context) },
                title = if (progress.finished) campaign.title else "${campaign.title}: scene ${progress.sceneIndex + 1} of ${campaign.scenes.size}",
                scenarioId = com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.room(campaign.id, vm.scene.id), campaignRoom = true, course = course, vm = vm, playback = playback,
                reducedMotion = systemMotionReduced(context), onEnd = endCall,
                statusHost = { AiReportStatusHost(reporting.sender) },
                extra = {
                    if (progress.finished) {
                        Text("Nice work, campaign complete!", color = LocalAlphonsoTokens.current.onHero, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.pill)).background(LocalAlphonsoTokens.current.hero).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s2))
                    }
                },
                transcript = {
                    Column {
                        if (!progress.finished) DsCompactButton("Restart scene", { vm.restartScene() }, Modifier.padding(horizontal = AlphonsoTokens.Space.s2))
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
                if (!progress.finished) Box(Modifier.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1), contentAlignment = Alignment.Center) { DsPill("Scene ${progress.sceneIndex + 1} of ${campaign.scenes.size}: ${vm.scene.title}", DsPillTone.INFO) }
            },
            footer = {
                val state by vm.state.collectAsState()
                val replies = state.turns.drop(progress.sceneAnchor).count { it.role == "user" }
                if (com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.seeResultShown(chatMode, replies, vm.scene.minTurns, progress.finished)) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { HubButton(com.obsidianmedia.learnwithalphonso.core.logic.PracticeHub.SEE_MY_RESULT, endCall) }
                }
                if (progress.finished) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        AlphonsoMascotBanner("Nice work. Campaign complete!")
                        Text("You made it through all ${campaign.scenes.size} scenes of ${campaign.title}.", style = AlphonsoTokens.Type.footnote.toTextStyle(), color = palette.inkSoft, textAlign = TextAlign.Center)
                    }
                }
            },
            actions = { if (!progress.finished) DsGlassChip("Restart scene") { vm.restartScene() } },
        )
      }
    }
}

/**
 * The transcript a rehearsal call shows in its sheet: the same bubbles, tap-a-word and report actions as a Practice talk.
 * Reported replies go in as a conversation reply of the rehearsal course.
 */
@Composable
internal fun RehearsalTranscript(container: AppContainer, vm: BaseConversationViewModel, course: String, modifier: Modifier = Modifier) {
    val palette = LocalAlphonsoTokens.current
    val reporting = ReplyReporting(container.aiReports) { message, _, reason -> AiReplyReports.scenario(message, course, "rehearsal", reason) }
    TranscriptList(container, vm, palette.choice, palette.onHero, reporting, course, modifier)
}
