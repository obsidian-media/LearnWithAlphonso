package com.obsidianmedia.learnwithalphonso.ui.rehearsal

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.rehearsal.CallSource
import com.obsidianmedia.learnwithalphonso.core.rehearsal.EventKind
import com.obsidianmedia.learnwithalphonso.core.rehearsal.REHEARSAL_FINISH_MIN_REPLIES
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalCopy
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalOpeners
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalSpeaking
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Stage
import com.obsidianmedia.learnwithalphonso.core.logic.RecorderPort
import com.obsidianmedia.learnwithalphonso.core.voice.VoiceCharacter
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentGate
import com.obsidianmedia.learnwithalphonso.ui.ai.AiReportStatusHost
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.practice.BaseConversationViewModel
import com.obsidianmedia.learnwithalphonso.ui.practice.CallRecapController
import com.obsidianmedia.learnwithalphonso.ui.practice.OpenerSpeechCache
import com.obsidianmedia.learnwithalphonso.ui.practice.RehearsalTranscript
import com.obsidianmedia.learnwithalphonso.ui.practice.call.CallHeader
import com.obsidianmedia.learnwithalphonso.ui.practice.call.PracticeCallScreen
import com.obsidianmedia.learnwithalphonso.ui.practice.call.alphonsoKit
import com.obsidianmedia.learnwithalphonso.ui.practice.call.systemMotionReduced
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch

/**
 * One stage of a rehearsal as a live call. The opener is ours (RehearsalOpeners); every reply is asked of the server with
 * only the rehearsal id and stage: it builds the prompt from the stored brief and the memory of earlier runs, so the
 * app holds and sends no prompt text.
 */
class RehearsalConversationViewModel(
    private val rehearsalId: String,
    private val stage: Stage,
    recorder: RecorderPort, requestMic: suspend () -> Boolean, ai: AiConversationClient, progress: ProgressSyncClient,
    player: com.obsidianmedia.learnwithalphonso.ui.practice.ReplyPlayer,
    course: Course = Course.ENGLISH,
    alphonsoVoice: (String) -> String? = { null },
    openerCache: OpenerSpeechCache = OpenerSpeechCache.shared,
) : BaseConversationViewModel(recorder, requestMic, ai, progress, player, RehearsalOpeners.opener(course.code, stage), course, alphonsoVoice, openerCache) {
    override fun systemPrompt(): String = ""
    override val callSource: CallSource get() = CallSource.Rehearsal(rehearsalId, stage)
}

/** The stage call, then its debrief in place of a stars result. */
@Composable
fun RehearsalCallScreen(
    container: AppContainer, id: String, stageWire: String, onBack: () -> Unit,
    onOpenStage: (String, Stage) -> Unit, onOpenMemory: () -> Unit = {},
) {
    val stage = Stage.fromWire(stageWire) ?: run { onBack(); return }
    val course = remember { container.activeCourse.course.value }
    val host: RehearsalViewModel = viewModel(key = "rehearsal-${course.code}") { RehearsalViewModel(container.rehearsalClient, course.code) }
    val c = host.controller
    val ui by c.ui.collectAsState()
    LaunchedEffect(Unit) { c.load() }
    val ds = LocalAlphonsoTokens.current
    val state = ui.state
    val rehearsal = state?.active?.takeIf { it.id == id }
    if (rehearsal == null) {
        Column(Modifier.fillMaxSize().background(ds.surface).padding(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            if (ui.loading || (state == null && ui.error == null)) Text("Loading…", style = BodyType, color = ds.inkSoft)
            else {
                Text(RehearsalCopy.errorText(ui.error ?: com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError.NOT_FOUND), style = BodyType, color = ds.wrongInk)
                AlphonsoSecondaryButton("Back to Rehearsals", onBack)
            }
        }
        return
    }
    val playback = remember { container.newPlayback() }
    val vm: RehearsalConversationViewModel = viewModel(key = "rehearsal-call-${course.code}-$id-${stage.wire}") {
        RehearsalConversationViewModel(
            id, stage, container.newRecorder(), { container.micPermission.request() }, container.aiClient, container.progressClient, { playback.play(it) }, course,
            alphonsoVoice = { cc -> container.voicePrefs.voice(VoiceCharacter.Alphonso, cc) },
        )
    }
    // Runs of this stage before this call (kept by the controller per call, so a rotation keeps it): a new one after it is what the debrief shows.
    val runsBefore = c.runsBefore(vm.callId, stage)
    val callState by vm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val result by vm.result.collectAsState()
    val endCall: () -> Unit = { scope.launch { if (vm.finishPractice() == null) onBack() } }
    BackHandler(enabled = result == null, onBack = endCall)
    if (result != null) {
        val recapUi by vm.recap.ui.collectAsState()
        // The run is written when the recap lands; read the state again once it is over (done, empty or failed).
        LaunchedEffect(recapUi.status) { if (recapUi.status != CallRecapController.Status.PENDING) c.load() }
        RehearsalDebrief(
            rehearsal.kind, stage, state, runsBefore, vm.elapsedSeconds, callState.turns.count { it.role == "user" },
            pending = recapUi.status == CallRecapController.Status.PENDING, fixCount = recapUi.recap?.reviewCount ?: 0,
            rehearsalSpeaking = recapUi.rehearsalSpeaking, courseCode = course.code,
            onNext = { s -> onOpenStage(id, s) }, onAgain = { onOpenStage(id, stage) }, onDone = onBack,
        )
        return
    }
    val context = LocalContext.current
    AiConsentGate(container, onDecline = onBack) {
        LaunchedEffect(Unit) { vm.speakOpener() }
        DisposableEffect(Unit) { onDispose { vm.onLeave() } }
        PracticeCallScreen(
            kit = remember { alphonsoKit(context) }, title = RehearsalCopy.callTitle(rehearsal.kind), scenarioId = "rehearsal", course = course,
            header = CallHeader(RehearsalCopy.callTitle(rehearsal.kind), RehearsalCopy.callSubline(stage), stage.number),
            vm = vm, playback = playback, reducedMotion = systemMotionReduced(context), onEnd = endCall,
            statusHost = { AiReportStatusHost(container.aiReports) },
            transcript = { RehearsalTranscript(container, vm, course.code) },
        )
    }
}

/**
 * After a run: no stars and no score. What went well, what to try next time (from the run the server wrote for this
 * stage), how many items went to Fix before it sticks (only when the recap says so), and the next step.
 */
@Composable
fun RehearsalDebrief(
    kind: EventKind, stage: Stage, state: com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalState?, runsBefore: Int,
    seconds: Int, turns: Int, pending: Boolean, fixCount: Int, onNext: (Stage) -> Unit, onAgain: () -> Unit, onDone: () -> Unit,
    rehearsalSpeaking: RehearsalSpeaking? = null, courseCode: String = "en",
) {
    val ds = LocalAlphonsoTokens.current
    val counted = state != null && state.runs.count { it.stage == stage.wire } > runsBefore
    val run = if (counted) state?.latestRun(stage) else null
    val next = state?.next ?: stage
    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Text(RehearsalCopy.debriefStageLine(stage).uppercase(), style = OverlineType, color = ds.inkSoft)
            DsPill(RehearsalCopy.AI_LABEL, DsPillTone.INFO)
        }
        when {
            run != null -> {
                Text(RehearsalCopy.debriefHeadline(kind, stage), style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
                Text(RehearsalCopy.debriefStats(seconds, turns), style = FootnoteType, color = ds.inkSoft)
                if (run.wentWell.isNotEmpty()) DebriefList("What went well", run.wentWell)
                if (run.corrections.isNotEmpty()) DebriefList("Try again next time", run.corrections.take(2))
                HowYouSpokeCard(rehearsalSpeaking, courseCode)
                RehearsalCopy.fixLine(fixCount)?.let { DsCard(padding = AlphonsoTokens.Space.s3, fill = ds.heartTint) { Text(it, style = HeadlineType, color = ds.heartText) } }
            }
            pending -> Text("Alphonso is writing up this run…", style = BodyType, color = ds.inkSoft)
            else -> {
                Text("That one was too short to count", style = TitleType, color = ds.ink, modifier = Modifier.semantics { heading() })
                Text("A run counts after about $REHEARSAL_FINISH_MIN_REPLIES replies from you. Nothing was scored.", style = FootnoteType, color = ds.inkSoft)
            }
        }
        if (run != null) AlphonsoPrimaryButton(RehearsalCopy.nextButton(next), { onNext(next) }, modifier = Modifier.padding(top = AlphonsoTokens.Space.s2))
        if (run != null) AlphonsoSecondaryButton("Run this stage again", onAgain) else AlphonsoPrimaryButton("Run this stage again", onAgain, enabled = !pending)
        AlphonsoSecondaryButton("Done", onDone)
        Text(RehearsalCopy.DEBRIEF_FOOTER, style = CaptionType, color = ds.inkSoft)
    }
}

@Composable
private fun DebriefList(title: String, items: List<String>) {
    val ds = LocalAlphonsoTokens.current
    DsCard(padding = AlphonsoTokens.Space.s3) {
        Text(title, style = HeadlineType, color = ds.ink, modifier = Modifier.semantics { heading() })
        items.forEach { Text("• $it", style = BodyType, color = ds.ink, modifier = Modifier.fillMaxWidth()) }
    }
}
