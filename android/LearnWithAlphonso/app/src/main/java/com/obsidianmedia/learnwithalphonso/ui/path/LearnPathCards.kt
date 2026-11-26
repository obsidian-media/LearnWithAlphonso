package com.obsidianmedia.learnwithalphonso.ui.path

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.path.LearningPath
import com.obsidianmedia.learnwithalphonso.core.path.PathFixCard
import com.obsidianmedia.learnwithalphonso.core.path.PathItem
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSecondaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch

/** What Learn shows between the map and the For you rail for a path; the count is also the list items it adds. */
internal fun learnPathCardCount(path: LearningPath?): Int =
    if (path == null) 0 else (if (path.goalIsSuggested) 1 else 0) + (if (path.today.items.isNotEmpty()) 1 else 0) + (if (path.fix?.items?.isNotEmpty() == true) 1 else 0)

/**
 * Learn's path cards: "Your path is ready" while the goal is only a suggestion, "Today" with the normal plan and
 * "Fix before it sticks" with the weak-spot items. Every word is the server's (web and iOS print the same text); this
 * lays it out with the existing rows and tokens.
 */
@Composable
fun LearnPathCards(
    vm: PathViewModel,
    container: AppContainer,
    course: Course,
    onBuild: () -> Unit,
    onOpenRef: (com.obsidianmedia.learnwithalphonso.core.path.PathItemRef) -> Unit,
    onOpenReview: () -> Unit,
) {
    val ui by vm.ui.collectAsState()
    val path = (ui as? PathUi.Ready)?.path ?: return
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var saveFailed by remember { mutableStateOf(false) }
    fun open(item: PathItem) {
        if (item.state == "done") return
        val ref = item.ref ?: return
        if (ref.kind == "review") onOpenReview() else onOpenRef(ref)
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
        if (path.goalIsSuggested) {
            DsCard(padding = AlphonsoTokens.Space.s3) {
                Text("YOUR PATH IS READY", style = OverlineType, color = ds.rightInk)
                Text(path.goalLabel, style = TitleType, color = ds.ink)
                path.goal?.built?.let { Text(it, style = FootnoteType, color = ds.inkSoft) }
                Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                    AlphonsoPrimaryButton("Looks good", enabled = !saving, fullWidth = false, onClick = {
                        saving = true
                        saveFailed = false
                        scope.launch {
                            val ok = runCatching { container.goalClient.save(course.code, path.progress.targetLevel, path.progress.targetDate) }.isSuccess
                            saving = false
                            saveFailed = !ok
                            if (ok) vm.reload(quiet = true)
                        }
                    })
                    AlphonsoSecondaryButton("Change target", onClick = onBuild, fullWidth = false)
                }
                if (saveFailed) Text("Couldn't save that. Try again.", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = FootnoteType, color = ds.wrongInk)
            }
        }
        if (path.today.items.isNotEmpty()) {
            val done = path.today.items.count { it.state == "done" }
            DsCard(padding = AlphonsoTokens.Space.s3) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Today", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
                    Text("$done of ${path.today.items.size} · ${path.today.items.sumOf { it.minutes }} min", style = CaptionType, color = ds.inkSoft)
                }
                path.today.items.forEach { item -> PathItemRow(item, onClick = item.ref?.let { { open(item) } }) }
            }
        }
        path.fix?.takeIf { it.items.isNotEmpty() }?.let { fix -> FixCard(fix, ::open) }
    }
}

@Composable
private fun FixCard(fix: PathFixCard, open: (PathItem) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    DsCard(padding = AlphonsoTokens.Space.s3) {
        Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.Top) {
            // Alphonso's face: his mascot art, cropped to the head in a circle.
            Image(
                painterResource(R.drawable.mascot_alphonso), contentDescription = null,
                modifier = Modifier.size(48.dp).clip(CircleShape).background(ds.sunk),
                contentScale = ContentScale.Crop, alignment = Alignment.TopCenter,
            )
            Column {
                Text(fix.overline.uppercase(), style = OverlineType, color = ds.heartText)
                Text(fix.title, style = HeadlineType, color = ds.ink)
            }
        }
        fix.items.forEach { item -> PathItemRow(item, onClick = item.ref?.let { { open(item) } }) }
        AlphonsoPrimaryButton("Fix them now", onClick = { open(fix.items.first()) })
    }
}
