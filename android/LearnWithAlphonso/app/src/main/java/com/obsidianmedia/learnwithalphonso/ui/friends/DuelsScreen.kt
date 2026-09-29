package com.obsidianmedia.learnwithalphonso.ui.friends

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRowCard
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.learn.displayName
import com.obsidianmedia.learnwithalphonso.ui.league.ScreenHeader
import com.obsidianmedia.learnwithalphonso.ui.league.SectionCard
import com.obsidianmedia.learnwithalphonso.ui.social.BlockConfirmDialog
import com.obsidianmedia.learnwithalphonso.ui.social.ReportSheet
import com.obsidianmedia.learnwithalphonso.ui.social.SocialSafetyMenu
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

@Composable
fun DuelsScreen(container: AppContainer, onBack: () -> Unit) {
    val palette = AlphonsoColor.palette
    val vm: DuelsViewModel = viewModel { DuelsViewModel(container.progressClient, container.session.userId) }
    val state by vm.state.collectAsState()
    var challengeFriend by remember { mutableStateOf("") }
    var challengeCourse by remember { mutableStateOf(Course.ENGLISH) }
    var openCourse by remember { mutableStateOf(Course.ENGLISH) }
    var matchByLevel by remember { mutableStateOf(true) }
    var blockTarget by remember { mutableStateOf<SocialTarget?>(null) }
    var reportTarget by remember { mutableStateOf<SocialTarget?>(null) }

    Column(Modifier.fillMaxSize().background(palette.surface)) {
        ScreenHeader("Duels", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            state.error?.let { Text(it, color = palette.destructive, style = MaterialTheme.typography.bodySmall) }
            if (vm.pending.isNotEmpty()) {
                SectionCard("Pending challenges") {
                    vm.pending.forEach { d ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Challenge (${d.course})", color = palette.ink, modifier = Modifier.weight(1f))
                            AlphonsoPrimaryButton("Accept", onClick = { vm.respond(d, true) }, fullWidth = false)
                            AlphonsoSecondaryButton("Decline", onClick = { vm.respond(d, false) }, fullWidth = false)
                            SocialSafetyMenu(onBlock = { blockTarget = SocialTarget(vm.opponentId(d), "this opponent") }, onReport = { reportTarget = SocialTarget(vm.opponentId(d), "this opponent") })
                        }
                    }
                }
            }
            SectionCard("Active duels") {
                when {
                    state.isLoading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = palette.moss) }
                    vm.active.isEmpty() -> Text("No active duels right now.", color = palette.inkSoft, style = MaterialTheme.typography.bodySmall)
                    else -> vm.active.forEach { d ->
                        Column {
                            Text(d.course, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("You: +${vm.myDelta(d)}", style = MaterialTheme.typography.titleMedium, color = palette.ink, modifier = Modifier.weight(1f))
                                Text("Them: +${vm.theirDelta(d)}", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                                SocialSafetyMenu(onBlock = { blockTarget = SocialTarget(vm.opponentId(d), "this opponent") }, onReport = { reportTarget = SocialTarget(vm.opponentId(d), "this opponent") })
                            }
                        }
                    }
                }
            }
            SectionCard("Challenge a friend") {
                var open by remember { mutableStateOf(false) }
                val chosen = state.friends.firstOrNull { it.userId == challengeFriend }
                TextButton(onClick = { open = true }) { Text(chosen?.displayName ?: "Choose a friend…", color = palette.moss) }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    state.friends.forEach { f -> DropdownMenuItem(text = { Text(f.displayName) }, onClick = { challengeFriend = f.userId; open = false }) }
                }
                CoursePickerRow(challengeCourse) { challengeCourse = it }
                AlphonsoSecondaryButton("Send challenge", onClick = { vm.challenge(challengeFriend, challengeCourse.code); challengeFriend = "" }, enabled = challengeFriend.isNotEmpty())
            }
            SectionCard("Open duel") {
                Text("Get matched with another learner at your level.", color = palette.inkSoft, style = MaterialTheme.typography.bodySmall)
                CoursePickerRow(openCourse) { openCourse = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Match me with someone at my level", color = palette.ink, modifier = Modifier.weight(1f))
                    Switch(checked = matchByLevel, onCheckedChange = { matchByLevel = it })
                }
                if (state.waitingInQueue) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Waiting for an opponent…", color = palette.inkSoft, modifier = Modifier.weight(1f))
                        AlphonsoSecondaryButton("Cancel", onClick = vm::leaveQueue, fullWidth = false)
                    }
                } else {
                    AlphonsoPrimaryButton(if (state.queueing) "Finding a match…" else "Find an open duel", onClick = { vm.joinQueue(openCourse.code, matchByLevel) }, busy = state.queueing)
                }
            }
            if (vm.finished.isNotEmpty()) {
                SectionCard("Past duels") { vm.finished.forEach { d -> AlphonsoRowCard(d.course, vm.resultLabel(d)) } }
            }
        }
    }
    BlockConfirmDialog(blockTarget, onConfirm = { vm.block(it.id); blockTarget = null }, onDismiss = { blockTarget = null })
    ReportSheet(reportTarget, container, onDismiss = { reportTarget = null })
}

@Composable
fun CoursePickerRow(selected: Course, onSelect: (Course) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        Course.entries.forEachIndexed { i, c ->
            SegmentedButton(selected = selected == c, onClick = { onSelect(c) }, shape = SegmentedButtonDefaults.itemShape(i, Course.entries.size)) { Text(c.displayName) }
        }
    }
}
