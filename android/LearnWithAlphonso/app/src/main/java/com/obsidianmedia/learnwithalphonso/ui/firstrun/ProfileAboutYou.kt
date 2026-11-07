package com.obsidianmedia.learnwithalphonso.ui.firstrun

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.firstrun.ProfileAvatars
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileIdentity
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch

/**
 * The Profile hub's "about you" card (part 3 adds only these entry points; Profile's redesign is a later part): the
 * learner's picture and name, "Change picture" (the same 16 animals or the initial) and "Edit your answers".
 */
@Composable
fun ProfileAboutYouCard(container: AppContainer, onEditAnswers: () -> Unit, initialName: String = "", initialSeed: String? = null) {
    val ds = LocalAlphonsoTokens.current
    var name by remember { mutableStateOf(initialName) }
    var seed by remember { mutableStateOf(initialSeed) }
    var picking by remember { mutableStateOf(false) }
    LaunchedEffect(container.session.userId) {
        val id = container.session.userId ?: return@LaunchedEffect
        runCatching { container.progressClient.fetchProfileIdentity(id) }.getOrNull()?.let { name = it.displayName; seed = it.avatarSeed }
    }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(AlphonsoTokens.Space.s4),
        verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            ProfileAvatar(seed, name, 64.dp)
            Column(Modifier.weight(1f)) {
                Text(name, style = TitleType, color = ds.brand)
                Text(ProfileAvatars.animalFromSeed(seed)?.label ?: "Your initial", style = CaptionType, color = ds.inkSoft)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            LessonEdgeButton("Change picture", EdgeVariant.SECONDARY, { picking = true }, Modifier.weight(1f))
            LessonEdgeButton("Edit your answers", EdgeVariant.SECONDARY, onEditAnswers, Modifier.weight(1f))
        }
    }
    if (picking) {
        AvatarPickerDialog(container, name, seed ?: "a", onClose = { picking = false }) { seed = it }
    }
}

/** The picture picker on its own (Profile and Settings): saves to profiles.avatar_seed, then closes. */
@Composable
fun AvatarPickerDialog(container: AppContainer, name: String, current: String, onClose: () -> Unit, onSaved: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    var value by remember { mutableStateOf(current) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(ds.surface).statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                Text("Your picture", style = TitleType, color = ds.brand, modifier = Modifier.weight(1f).padding(start = AlphonsoTokens.Space.s2).semantics { heading() })
                FirstRunTextButton("Close", onClose)
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = AlphonsoTokens.Space.s5),
                verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                Text("Your friends and leaderboards show it.", style = FootnoteType, color = ds.inkSoft)
                AvatarPickerGrid(value, name, ProfileAvatars.initialsSeed(current)) { value = it }
                error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
            }
            Column(Modifier.padding(AlphonsoTokens.Space.gutter)) {
                FirstRunFooter(if (busy) "Saving…" else "Save", {
                    if (value == current) { onClose(); return@FirstRunFooter }
                    busy = true; error = null
                    scope.launch {
                        if (saveAvatar(container, value)) { onSaved(value); onClose() } else error = "Couldn't save your picture. Try again."
                        busy = false
                    }
                }, enabled = !busy)
            }
        }
    }
}
