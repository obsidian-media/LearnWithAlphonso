package com.obsidianmedia.learnwithalphonso.ui.settings

import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.components.DsSwitch
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectsPreference

/** "Sound effects": on by default, kept on this device, same key as the iOS setting. Off is completely silent. */
@Composable
internal fun SoundEffectsSection(container: AppContainer) {
    val ds = LocalAlphonsoTokens.current
    var on by remember { mutableStateOf(container.prefs.getBoolean(SoundEffectsPreference.KEY, SoundEffectsPreference.DEFAULT)) }
    Section(
        "Sound effects",
        footer = "Short sounds for a right or wrong answer, a finished lesson and a call. They never play over Alphonso or Hector, and silent mode silences them. Turn them off and the light vibrations stop too.",
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Sound effects", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
            DsSwitch(
                checked = on,
                onChange = { on = it; container.prefs.edit().putBoolean(SoundEffectsPreference.KEY, it).apply() },
                modifier = Modifier.semantics { contentDescription = "Sound effects" },
            )
        }
    }
}
