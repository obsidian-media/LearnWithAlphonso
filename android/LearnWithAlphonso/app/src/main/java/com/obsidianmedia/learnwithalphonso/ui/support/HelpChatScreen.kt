package com.obsidianmedia.learnwithalphonso.ui.support

import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.AiReportSender
import com.obsidianmedia.learnwithalphonso.ui.ai.AiReportStatusHost
import com.obsidianmedia.learnwithalphonso.ui.ai.ReportableAiMessage
import com.obsidianmedia.learnwithalphonso.ui.ai.accessibilityActions
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SupportBanner
import com.obsidianmedia.learnwithalphonso.core.logic.SupportCopy
import com.obsidianmedia.learnwithalphonso.core.logic.SupportLinkId
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessage
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import com.obsidianmedia.learnwithalphonso.core.logic.SupportView
import com.obsidianmedia.learnwithalphonso.core.logic.SendLimit
import com.obsidianmedia.learnwithalphonso.core.net.SupportErrorKind
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import java.time.Instant
import java.time.ZoneId

/**
 * The Help chat (round 12 mock, sections 2 to 6, the same screen as the web's HelpChat.tsx). A learner talks to the AI
 * helper or, when AI answers are off (the launch state) or the learner asks, to a person; staff replies appear in the
 * same chat. The server decides everything that matters (who answers, the status, the limits); this draws it.
 *
 * Every speaker has a text label and its own bubble shape, not colour alone. Learner and AI text is drawn as plain text.
 * The only link an answer can carry is an allow-listed in-app screen ([SupportLinkId]); the destination comes from the
 * caller's fixed table, never from the text.
 */
@Composable
fun HelpChatScreen(container: AppContainer, parent: String, onBack: () -> Unit, onOpenLink: (SupportLinkId) -> Unit) {
    val vm: HelpChatViewModel = viewModel { HelpChatViewModel(LiveHelpChatClient(container.supportClient)) }
    val online by container.connectivity.isConnected.collectAsState()
    val consent by container.aiConsent.state.collectAsState()
    HelpChatContent(vm, online, aiDeclined = container.aiConsent.statusOf(consent) == AiConsentStatus.DENIED, parent, onBack, onOpenLink, reports = container.aiReports)
}

/** The screen over a view-model, so a seeded one can be drawn on its own (the screenshot harness). */
@Composable
fun HelpChatContent(
    vm: HelpChatViewModel, online: Boolean, aiDeclined: Boolean, parent: String, onBack: () -> Unit, onOpenLink: (SupportLinkId) -> Unit,
    /** Where Miya's replies are reported (null in the screenshot harness: no report control). */
    reports: AiReportSender? = null,
) {
    val ds = LocalAlphonsoTokens.current
    val state by vm.state.collectAsState()
    // Poll while the chat is open, online and a person (not the AI) has it.
    val polling = state.load == HelpLoad.READY && online && SupportView.shouldPoll(state.status)
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(polling, lifecycle) {
        if (polling) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { vm.pollWhileStarted() }
    }

    val banner = SupportView.bannerFor(if (state.load == HelpLoad.READY) state.status else null, state.aiAvailable, aiDeclined, online)
    val aiAnswering = state.aiAvailable && !aiDeclined && (state.status == SupportStatus.NONE || state.status == SupportStatus.AI)
    val pending = state.pending
    val pendingShown = pending?.takeUnless { isStored(it, state.messages) }
    val empty = state.load == HelpLoad.READY && state.messages.isEmpty() && pending == null
    val composer = SupportView.composerFor(state.status, state.limit, online, aiFirstOpen = empty && banner == SupportBanner.AI)
    val composerDisabled = composer.disabled || state.load != HelpLoad.READY || (pending != null && !pending.sending)
    val canSend = vm.canSend(online) && !composerDisabled

    val zone = remember { ZoneId.systemDefault() }
    val now = remember(state.messages.size, pending?.clientId) { Instant.now() }
    val listState = rememberLazyListState()
    val endMark = "${state.messages.size}:${pending?.sending}:${state.limit}:${state.load}"
    LaunchedEffect(endMark) { listState.scrollToItem(maxOf(0, listState.layoutInfo.totalItemsCount - 1)) }

    Column(Modifier.fillMaxSize().background(ds.surface).imePadding().navigationBarsPadding()) {
        DsBackBar(parent, onBack) {
            DsCompactButton(SupportCopy.TALK_TO_PERSON, { vm.talkToPerson(online) }, enabled = !state.handoffBusy && online)
        }
        Text(
            SupportCopy.TITLE, style = HeadlineType, color = ds.ink,
            modifier = Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).semantics { heading() },
        )
        if (banner != null) StatusBanner(banner)

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth().semantics { contentDescription = SupportCopy.MESSAGE_LOG; liveRegion = LiveRegionMode.Polite },
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s3),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            if (state.load == HelpLoad.LOADING) item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice, modifier = Modifier.semantics { contentDescription = "Loading your messages" }) } }
            if (state.load == HelpLoad.ERROR) item { ErrorCard(SupportCopy.LOAD_FAILED, onRetry = vm::reload) }
            if (empty) item { Welcome(aiAnswering, onStarter = vm::setDraft) }
            var lastDay = ""
            fun dayRow(iso: String): String? {
                val k = SupportView.dayKey(iso, zone)
                if (k == lastDay) return null
                lastDay = k
                return SupportView.dayLabel(iso, now, zone)
            }
            state.messages.forEachIndexed { index, m ->
                dayRow(m.at)?.let { label -> item(key = "day-${m.id}") { Divider(label, fresh = false) } }
                if (m.id == state.dividerId) item(key = "new-${m.id}") { Divider(SupportCopy.NEW_REPLY, fresh = true) }
                item(key = "m-${m.id}") {
                    val when_ = SupportView.timeLabel(m.at, now, zone)
                    when (m.kind) {
                        SupportMessageKind.YOU -> YouBubble(m.body, when_, if (m.id in state.sentIds) SupportCopy.STATE_SENT else null)
                        SupportMessageKind.AI -> AiBubble(m, when_, onOpenLink, reports)
                        SupportMessageKind.SUPPORT -> PersonBubble(m, when_)
                        SupportMessageKind.SYSTEM -> if (SupportView.showsHandoffPose(state.messages, index)) HandoffPose(m.body) else SystemLine(m.body)
                    }
                }
            }
            if (pendingShown != null) {
                dayRow(pendingShown.at)?.let { label -> item(key = "day-pending") { Divider(label, fresh = false) } }
                item(key = "p-${pendingShown.clientId}") {
                    val stateWord = if (!pendingShown.sending) (if (pendingShown.failure == SupportErrorKind.UNREACHABLE) SupportCopy.STATE_SAVED else SupportCopy.STATE_NOT_SENT) else null
                    YouBubble(pendingShown.text, SupportView.timeLabel(pendingShown.at, now, zone), stateWord)
                }
            }
            if (aiAnswering && pending?.sending == true) item(key = "looking-up") { LookingUp() }
            if (aiAnswering && pending?.sending == true) item(key = "typing") { Typing() }
            if (pending != null && !pending.sending) item(key = "send-error") {
                ErrorCard(if (pending.failure == SupportErrorKind.UNREACHABLE) SupportCopy.UNREACHABLE else SupportCopy.SEND_FAILED, onRetry = vm::retry)
            }
            if (state.handoffFailed) item(key = "handoff-error") { ErrorCard(SupportCopy.HANDOFF_FAILED, onRetry = { vm.talkToPerson(online) }) }
            if (state.limit == SendLimit.CONVERSATION) item(key = "limit-conversation") { SystemLine(SupportCopy.CONVERSATION_LIMIT) }
            if (state.limit == SendLimit.DAILY) item(key = "limit-daily") { DailyLimit() }
        }

        Composer(
            value = state.draft, onChange = vm::setDraft, placeholder = composer.placeholder, fine = composer.fine,
            fieldEnabled = !composer.disabled && state.load == HelpLoad.READY, canSend = canSend, onSend = { vm.send(online) },
        )
    }
    reports?.let { AiReportStatusHost(it) }
}

private fun bannerIcon(b: SupportBanner): ImageVector = when (b) {
    SupportBanner.AI -> Icons.Filled.Info
    SupportBanner.PERSON -> Icons.Filled.Person
    SupportBanner.DECLINED -> Icons.Filled.Lock
    SupportBanner.TEAM -> Icons.Filled.Group
    SupportBanner.WAIT -> Icons.Filled.HourglassTop
    SupportBanner.DONE -> Icons.Filled.Check
    SupportBanner.OFFLINE -> Icons.Filled.WifiOff
}

@Composable
private fun StatusBanner(banner: SupportBanner) {
    val ds = LocalAlphonsoTokens.current
    // fill, text, edge (null: no edge), as the mock: AI, person and declined are quiet; the ticket states have an edge.
    data class Look(val fill: Color, val text: Color, val edge: Color?)
    val look = when (banner) {
        SupportBanner.AI, SupportBanner.PERSON, SupportBanner.DECLINED -> Look(ds.choiceTint, ds.choice, null)
        SupportBanner.TEAM -> Look(ds.choiceTint, ds.choice, ds.choiceEdge)
        SupportBanner.WAIT -> Look(ds.actionTint, ds.actionText, ds.actionEdge)
        SupportBanner.DONE -> Look(ds.rightTint, ds.rightInk, ds.right)
        SupportBanner.OFFLINE -> Look(ds.wrongTint, ds.wrongInk, ds.wrong)
    }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s2).fillMaxWidth().clip(shape).background(look.fill)
            .then(if (look.edge != null) Modifier.border(2.dp, look.edge, shape) else Modifier)
            .padding(AlphonsoTokens.Space.s3)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Icon(bannerIcon(banner), null, tint = look.text, modifier = Modifier.size(AlphonsoTokens.Space.s5))
        Column {
            Text(banner.title, style = FootnoteType, color = look.text)
            Text(banner.body, style = CaptionType, color = look.text)
        }
    }
}

@Composable
private fun Welcome(aiAnswering: Boolean, onStarter: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    // Miya says hello when the AI answers; with AI off she is not in the chat, so Alphonso keeps the first-open screen.
    val pose = rememberFirstRunAsset(if (aiAnswering) "support/miya-hello.webp" else "support/alphonso-explaining-pointer.webp")
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        pose?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * if (aiAnswering) 4 else 3)) }
        if (aiAnswering) Text(SupportCopy.AI, style = FootnoteType, color = ds.ink, textAlign = TextAlign.Center)
        Text(if (aiAnswering) SupportCopy.WELCOME_AI_TITLE else SupportCopy.WELCOME_TITLE, style = TitleType, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
        Text(if (aiAnswering) SupportCopy.WELCOME_AI_BODY else SupportCopy.WELCOME_BODY, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
        if (aiAnswering) StarterChips(onStarter) else {
            val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
            Row(
                Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(AlphonsoTokens.Space.s3),
                horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
            ) {
                Icon(Icons.Filled.Info, null, tint = ds.inkSoft, modifier = Modifier.size(AlphonsoTokens.Space.s4))
                Text(SupportCopy.WELCOME_TIP, style = CaptionType, color = ds.inkSoft)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StarterChips(onStarter: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        Text(SupportCopy.CAN_HELP_WITH.uppercase(), style = OverlineType, color = ds.actionText, modifier = Modifier.semantics { heading() })
        FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            SupportCopy.STARTERS.forEach { s ->
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
                Text(
                    s, style = FootnoteType, color = ds.brand,
                    modifier = Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
                        .clickable(role = Role.Button) { onStarter(s) }.padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s3),
                )
            }
        }
    }
}

@Composable
private fun Divider(label: String, fresh: Boolean) {
    val ds = LocalAlphonsoTokens.current
    val line = if (fresh) ds.action else ds.line
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        Box(Modifier.weight(1f).height(1.dp).background(line))
        Text(label.uppercase(), style = OverlineType, color = if (fresh) ds.actionText else ds.inkFaint)
        Box(Modifier.weight(1f).height(1.dp).background(line))
    }
}

private val MESSAGE_MAX_WIDTH = 330.dp

@Composable
private fun YouBubble(body: String, whenLabel: String, state: String?) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        Column(
            Modifier.widthIn(max = MESSAGE_MAX_WIDTH).semantics(mergeDescendants = true) { contentDescription = "${SupportCopy.YOU}, $whenLabel${state?.let { ", $it" } ?: ""}: $body" },
            horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
        ) {
            Text(SupportCopy.YOU.uppercase(), style = OverlineType, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics { })
            Text(
                body, style = BodyType, color = ds.card,
                modifier = Modifier.clip(RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp)).background(ds.choice).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            )
            Text(whenLabel + (state?.let { " · $it" } ?: ""), style = CaptionType, color = ds.inkFaint, modifier = Modifier.clearAndSetSemantics { })
        }
    }
}

@Composable
private fun SpeakerTag(text: String, quiet: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text.uppercase(), style = OverlineType, color = if (quiet) ds.inkSoft else ds.actionText,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (quiet) ds.sunk else ds.actionTint).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun AiBubble(message: SupportMessage, whenLabel: String, onOpenLink: (SupportLinkId) -> Unit, reports: AiReportSender?) {
    val ds = LocalAlphonsoTokens.current
    val face = rememberFirstRunAsset("support/miya-help-head.webp")
    // Defence in depth: the client already checked the id against the allow-list, and the screen comes from a fixed table.
    val link = message.link
    Column(Modifier.widthIn(max = MESSAGE_MAX_WIDTH), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
        Row(
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "${SupportView.speakerLabel(message)}, ${SupportCopy.AI_TAG}, $whenLabel" },
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(ds.choiceTint).border(2.dp, ds.line, CircleShape)) {
                face?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            }
            Text(SupportView.speakerLabel(message).orEmpty(), style = FootnoteType, color = ds.ink)
            SpeakerTag(SupportCopy.AI_TAG)
        }
        Column(
            Modifier.clip(RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)).background(ds.card).border(2.dp, ds.line, RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp))
                .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        ) {
            // Miya is an AI: long-press (or the TalkBack action) reports the reply into the same queue as Hector's.
            if (reports != null) {
                ReportableAiMessage(enabled = true, sender = reports, makeReport = { reason -> AiReplyReports.support(message.body, reason) }) { reportModifier, reportActions ->
                    Text(message.body, style = BodyType, color = ds.ink, modifier = reportModifier.accessibilityActions(reportActions))
                }
            } else {
                Text(message.body, style = BodyType, color = ds.ink)
            }
            if (link != null) {
                val shape = RoundedCornerShape(AlphonsoTokens.Radius.key + 4.dp)
                Row(
                    Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(ds.choiceTint).border(2.dp, ds.choiceEdge, shape)
                        .clickable(role = Role.Button) { onOpenLink(link) }.padding(horizontal = AlphonsoTokens.Space.s3),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                ) {
                    Text(link.label, style = FootnoteType, color = ds.choice)
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = ds.choice, modifier = Modifier.size(AlphonsoTokens.Space.s4))
                }
            }
        }
        Text(whenLabel, style = CaptionType, color = ds.inkFaint, modifier = Modifier.clearAndSetSemantics { })
    }
}

@Composable
private fun PersonBubble(message: SupportMessage, whenLabel: String) {
    val ds = LocalAlphonsoTokens.current
    val body = message.body
    val speaker = SupportView.speakerLabel(message).orEmpty()
    val shape = RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)
    Column(Modifier.widthIn(max = MESSAGE_MAX_WIDTH), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
        Row(
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "$speaker, ${SupportCopy.PERSON_TAG}, $whenLabel" },
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(ds.brand), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, tint = ds.surface, modifier = Modifier.size(18.dp))
            }
            Text(speaker, style = FootnoteType, color = ds.ink)
            SpeakerTag(SupportCopy.PERSON_TAG, quiet = true)
        }
        Text(
            body, style = BodyType, color = ds.ink,
            modifier = Modifier.clip(shape).background(ds.choiceTint).border(2.dp, ds.choiceEdge, shape).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
        )
        Text(whenLabel, style = CaptionType, color = ds.inkFaint, modifier = Modifier.clearAndSetSemantics { })
    }
}

/** Miya passes the chat to the team: her hand-off pose above the server's hand-off line (she is still labelled AI). */
@Composable
private fun HandoffPose(text: String) {
    val pose = rememberFirstRunAsset("support/miya-handoff.webp")
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
        pose?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 3.5f)) }
        SystemLine(text)
    }
}

/** While she answers: her tablet pose and what she is doing, above the typing line. */
@Composable
private fun LookingUp() {
    val ds = LocalAlphonsoTokens.current
    val pose = rememberFirstRunAsset("support/miya-looking-up.webp")
    Column(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        pose?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 2.5f)) }
        Text(SupportCopy.LOOKING_UP, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center)
    }
}

@Composable
private fun SystemLine(text: String) {
    val ds = LocalAlphonsoTokens.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(
            text, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = MESSAGE_MAX_WIDTH).clip(RoundedCornerShape(AlphonsoTokens.Radius.key + 4.dp)).background(ds.sunk).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
        )
    }
}

@Composable
private fun Typing() {
    val ds = LocalAlphonsoTokens.current
    val face = rememberFirstRunAsset("support/miya-help-head.webp")
    Column(Modifier.widthIn(max = MESSAGE_MAX_WIDTH), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
        Row(
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "${SupportCopy.AI} ${SupportCopy.IS_WRITING}"; liveRegion = LiveRegionMode.Polite },
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(ds.choiceTint).border(2.dp, ds.line, CircleShape)) {
                face?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            }
            Text("${SupportCopy.AI} ${SupportCopy.AI_TAG} ${SupportCopy.IS_WRITING}", style = FootnoteType, color = ds.ink)
        }
        val shape = RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)
        Row(
            Modifier.clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s4).clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2 - 2.dp),
        ) {
            listOf(1f, 0.65f, 0.35f).forEach { a -> Box(Modifier.size(AlphonsoTokens.Space.s2).clip(CircleShape).background(ds.inkFaint.copy(alpha = a))) }
        }
    }
}

@Composable
private fun ErrorCard(text: String, onRetry: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(ds.wrongTint).border(2.dp, ds.wrong, shape).padding(AlphonsoTokens.Space.s3)
            .semantics { liveRegion = LiveRegionMode.Assertive },
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Text(text, style = FootnoteType, color = ds.wrongInk)
        DsCompactButton(SupportCopy.TRY_AGAIN, onRetry, primary = true)
    }
}

@Composable
private fun DailyLimit() {
    val ds = LocalAlphonsoTokens.current
    val pose = rememberFirstRunAsset("support/alphonso-sleepy-night.webp")
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 3)) }
        Text(SupportCopy.DAILY_LIMIT, style = FootnoteType, color = ds.ink, textAlign = TextAlign.Center)
        Text(SupportCopy.DAILY_LIMIT_NOTE, style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Composer(value: String, onChange: (String) -> Unit, placeholder: String, fine: String, fieldEnabled: Boolean, canSend: Boolean, onSend: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(
        Modifier.fillMaxWidth().background(ds.surface).border(1.dp, ds.line).padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s3),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            val shape = RoundedCornerShape(AlphonsoTokens.Radius.sheet)
            BasicTextField(
                value = value, onValueChange = onChange, enabled = fieldEnabled, minLines = 1, maxLines = 5,
                textStyle = BodyType.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                modifier = Modifier.weight(1f).heightIn(min = AlphonsoTokens.Space.minTouch).clip(shape).background(if (fieldEnabled) ds.card else ds.sunk)
                    .border(2.dp, ds.line, shape).padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3)
                    .semantics { contentDescription = SupportCopy.PLACEHOLDER },
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) Text(placeholder, style = BodyType, color = ds.inkFaint)
                        inner()
                    }
                },
            )
            Box(
                Modifier.size(AlphonsoTokens.Space.minTouch).clip(CircleShape).background(if (canSend) ds.action else ds.action.copy(alpha = 0.4f))
                    .clickable(enabled = canSend, role = Role.Button, onClick = onSend)
                    .semantics { contentDescription = SupportCopy.SEND_LABEL },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Filled.Send, null, tint = ds.onAction, modifier = Modifier.size(AlphonsoTokens.Space.s5)) }
        }
        if (fine.isNotEmpty()) Text(fine, style = CaptionType, color = ds.inkFaint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}
