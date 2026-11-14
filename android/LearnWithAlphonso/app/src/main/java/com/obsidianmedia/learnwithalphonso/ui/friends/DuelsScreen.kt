package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.DuelsPresentation
import com.obsidianmedia.learnwithalphonso.ui.components.DsBackBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsChip
import com.obsidianmedia.learnwithalphonso.ui.components.DsChipRow
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDivider
import com.obsidianmedia.learnwithalphonso.ui.components.DsGlassTitle
import com.obsidianmedia.learnwithalphonso.ui.components.DsOverline
import com.obsidianmedia.learnwithalphonso.ui.components.DsPill
import com.obsidianmedia.learnwithalphonso.ui.components.DsPillTone
import com.obsidianmedia.learnwithalphonso.ui.components.DsProgressBar
import com.obsidianmedia.learnwithalphonso.ui.components.DsScene
import com.obsidianmedia.learnwithalphonso.ui.components.DsSceneScreen
import com.obsidianmedia.learnwithalphonso.ui.components.DsSegmented
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.NumeralType
import com.obsidianmedia.learnwithalphonso.ui.learn.displayName
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.social.AvatarCircle
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * Duels (the batch-1 redesign, the same screen as iOS DuelsView.swift): the same five sections and actions on the
 * stage scene, the two pickers as friend and course chips, the toggle as the DS switch, and the head-to-head as a card.
 */
@Composable
fun DuelsScreen(container: AppContainer, onBack: () -> Unit, seededVm: DuelsViewModel? = null) {
    val ds = LocalAlphonsoTokens.current
    val vm: DuelsViewModel = seededVm ?: viewModel { DuelsViewModel(container.progressClient, container.session.userId) }
    val state by vm.state.collectAsState()
    var challengeFriend by remember { mutableStateOf("") }
    var challengeCourse by remember { mutableStateOf(Course.ENGLISH) }
    var openCourse by remember { mutableStateOf(Course.ENGLISH) }
    var matchByLevel by remember { mutableStateOf(true) }
    var blockTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }
    val courseOptions = Course.entries.map { it to it.displayName }

    DsSceneScreen(DsScene.COMPLETE) {
        Column(Modifier.fillMaxWidth()) {
            DsBackBar("Friends", onBack)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.gutter).padding(bottom = AlphonsoTokens.Space.s6),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                DsGlassTitle("Duels", DuelsPresentation.summary(vm.pending.size, vm.active.size, vm.finished.size))
                state.error?.let { DsCard { Text(it, style = FootnoteType, color = ds.wrongInk) } }
                if (vm.pending.isNotEmpty()) {
                    DsOverline("Pending challenges")
                    vm.pending.forEach { d ->
                        DsCard {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                                Icon(painterResource(R.drawable.ds_bolt_solid), null, tint = ds.flame, modifier = Modifier.size(AlphonsoTokens.Space.s8 + AlphonsoTokens.Space.s2))
                                Text("Challenge (${d.course})", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                                SocialSafetyMenu(onBlock = { blockTarget = SocialTarget(vm.opponentId(d), "this opponent") }, onReport = { reportTarget = SocialTarget(vm.opponentId(d), "this opponent") })
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                                DsCompactButton("Accept", { vm.respond(d, true) }, primary = true)
                                DsCompactButton("Decline", { vm.respond(d, false) })
                            }
                        }
                    }
                }
                DsOverline("Active duels")
                when {
                    state.isLoading -> DsCard { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.choice) } }
                    vm.active.isEmpty() -> DsCard { Text("No active duels right now.", style = FootnoteType, color = ds.inkSoft) }
                    else -> vm.active.forEach { d ->
                        val mine = vm.myDelta(d)
                        val theirs = vm.theirDelta(d)
                        DsCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                DsPill(d.course, DsPillTone.INFO)
                                Box(Modifier.weight(1f))
                                SocialSafetyMenu(onBlock = { blockTarget = SocialTarget(vm.opponentId(d), "this opponent") }, onReport = { reportTarget = SocialTarget(vm.opponentId(d), "this opponent") })
                            }
                            Column(
                                Modifier.semantics(mergeDescendants = true) { contentDescription = "${d.course} duel. You: +$mine. Them: +$theirs." },
                                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
                            ) {
                                Row(Modifier.fillMaxWidth().clearAndSetSemantics { }, verticalAlignment = Alignment.Bottom) {
                                    Column(Modifier.weight(1f)) {
                                        Text("You", style = CaptionType, color = ds.inkSoft)
                                        Text("+$mine", style = NumeralType, color = ds.choice)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("Them", style = CaptionType, color = ds.inkSoft)
                                        Text("+$theirs", style = NumeralType, color = ds.inkSoft)
                                    }
                                }
                                DsProgressBar(DuelsPresentation.share(mine, theirs), tint = ds.choice)
                                Text("You: +$mine  ·  Them: +$theirs", style = FootnoteType, color = ds.inkSoft, modifier = Modifier.clearAndSetSemantics { })
                            }
                        }
                    }
                }
                DsOverline("Challenge a friend")
                DsCard {
                    Text("Friend", style = CaptionType, color = ds.inkSoft)
                    if (state.friends.isEmpty()) {
                        Text("No friends yet. Share your invite link to get started.", style = FootnoteType, color = ds.inkSoft)
                    } else {
                        DsChipRow {
                            state.friends.forEach { f ->
                                DsChip(f.displayName, challengeFriend == f.userId, onClick = { challengeFriend = f.userId }, leading = { AvatarCircle(f.avatarSeed, f.displayName, AlphonsoTokens.Space.s6 + AlphonsoTokens.Space.s1) })
                            }
                        }
                    }
                    Text("Course", style = CaptionType, color = ds.inkSoft)
                    DsSegmented(courseOptions, challengeCourse, { challengeCourse = it }, "Course")
                    LessonEdgeButton("Send challenge", EdgeVariant.PRIMARY, { vm.challenge(challengeFriend, challengeCourse.code); challengeFriend = "" }, enabled = challengeFriend.isNotEmpty())
                }
                DsOverline("Open duel")
                DsCard {
                    Text("Get matched with another learner at your level.", style = FootnoteType, color = ds.inkSoft)
                    DsSegmented(courseOptions, openCourse, { openCourse = it }, "Course")
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).semantics(mergeDescendants = true) { },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Match me with someone at my level", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                        DsSwitch(matchByLevel, { matchByLevel = it })
                    }
                    if (state.waitingInQueue) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
                            Text("Waiting for an opponent…", style = FootnoteType, color = ds.inkSoft, modifier = Modifier.weight(1f))
                            DsCompactButton("Cancel", vm::leaveQueue)
                        }
                    } else {
                        LessonEdgeButton(if (state.queueing) "Finding a match…" else "Find an open duel", EdgeVariant.PRIMARY, { vm.joinQueue(openCourse.code, matchByLevel) }, enabled = !state.queueing)
                    }
                }
                if (vm.finished.isNotEmpty()) {
                    DsOverline("Past duels")
                    DsCard(spacing = 0.dp) {
                        vm.finished.forEachIndexed { index, d ->
                            val result = vm.result(d)
                            if (index > 0) DsDivider()
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = AlphonsoTokens.Space.minTouch).semantics(mergeDescendants = true) { },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(d.course, style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                                DsPill(
                                    result.label,
                                    when (result.tone) {
                                        DuelsPresentation.ResultTone.WON -> DsPillTone.GOOD
                                        DuelsPresentation.ResultTone.LOST -> DsPillTone.BAD
                                        DuelsPresentation.ResultTone.TIED, DuelsPresentation.ResultTone.DECLINED -> DsPillTone.NEUTRAL
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    BlockConfirmDialog(blockTarget, onConfirm = { vm.block(it.id); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
}

@Composable
fun CoursePickerRow(selected: Course, onSelect: (Course) -> Unit) {
    DsSegmented(Course.entries.map { it to it.displayName }, selected, onSelect, "Course")
}
