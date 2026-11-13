package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerProfileLists
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainCopy
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainMode
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Settings > Explain in my language (round 8 mock 1e). Which language the explanations come in (what first run guessed,
 * changeable here) and how they appear: tap to explain (the default), always show, or target language only. Saved on the
 * account in the learner profile next to the first-run answers, so it follows the learner to web and iPhone.
 */
@Composable
internal fun ExplainSection(container: AppContainer) {
    val palette = AlphonsoColor.palette
    val store = container.explainSettings
    val settings by store.state.collectAsState()
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    val languages = remember { LearnerProfileLists.nativeLanguages.map { it to ExplainRules.languageName(it) }.sortedBy { it.second } }

    LaunchedEffect(Unit) {
        store.ensureLoaded(force = true)
        loadFailed = !store.state.value.loaded
    }
    fun save(language: String? = null, mode: ExplainMode? = null) {
        saving = true; error = null
        scope.launch {
            try {
                store.update(nativeLanguage = language, mode = mode)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = ExplainCopy.SAVE_FAILED
            } finally {
                saving = false
            }
        }
    }

    Section(ExplainCopy.SETTINGS_TITLE, footer = "${ExplainCopy.ABOUT_HEADING} ${ExplainCopy.ABOUT_NOTE}") {
        if (!settings.loaded) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (loadFailed) ExplainCopy.SAVE_FAILED else "Loading...", style = MaterialTheme.typography.bodyLarge, color = palette.inkSoft, modifier = Modifier.weight(1f))
                if (loadFailed) TextButton(onClick = { loadFailed = false; scope.launch { store.ensureLoaded(force = true); loadFailed = !store.state.value.loaded } }) { Text(ExplainCopy.RETRY, color = palette.moss) }
            }
            return@Section
        }
        val languageName = settings.nativeLanguage?.let(ExplainRules::languageName) ?: "your language"
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(ExplainCopy.MY_LANGUAGE, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
            Box {
                TextButton(enabled = !saving, onClick = { picking = true }, modifier = Modifier.semantics { contentDescription = "${ExplainCopy.MY_LANGUAGE}, ${settings.nativeLanguage?.let(ExplainRules::languageName) ?: "not chosen"}" }) {
                    Text(settings.nativeLanguage?.let(ExplainRules::languageName) ?: "Choose a language", color = palette.moss)
                }
                DropdownMenu(expanded = picking, onDismissRequest = { picking = false }, modifier = Modifier.heightIn(max = 360.dp)) {
                    languages.forEach { (code, name) ->
                        DropdownMenuItem(
                            text = { Text(name, color = if (code == settings.nativeLanguage) palette.moss else palette.ink) },
                            onClick = { picking = false; if (code != settings.nativeLanguage) save(language = code) },
                        )
                    }
                }
            }
        }
        Text(ExplainCopy.FROM_FIRST_RUN, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        Column(Modifier.fillMaxWidth().selectableGroup().padding(top = 8.dp)) {
            ExplainMode.entries.forEach { mode ->
                val (title, body) = when (mode) {
                    ExplainMode.TAP -> ExplainCopy.TAP_TITLE to ExplainCopy.tapBody(languageName)
                    ExplainMode.ALWAYS -> ExplainCopy.ALWAYS_TITLE to ExplainCopy.alwaysBody(languageName)
                    ExplainMode.OFF -> ExplainCopy.OFF_TITLE to ExplainCopy.OFF_BODY
                }
                val on = settings.mode == mode
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        .selectable(selected = on, enabled = !saving, role = Role.RadioButton, onClick = { if (!on) save(mode = mode) })
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    RadioButton(selected = on, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = palette.moss, unselectedColor = palette.inkSoft))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(title, style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                            if (mode == ExplainMode.DEFAULT) Text(ExplainCopy.DEFAULT_BADGE, style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                        }
                        Text(body, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    }
                }
            }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive) }
    }
}
