package com.obsidianmedia.learnwithalphonso.ui.settings

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/** "Show Alphonso while practicing": on by default, kept on this device, same key as the iOS and web settings. */
@Composable
internal fun AvatarSection(container: AppContainer) {
    val palette = AlphonsoColor.palette
    var on by remember { mutableStateOf(container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT)) }
    Section(
        "Show Alphonso while practicing",
        footer = "Alphonso (and Hector, on the Hector tab) fill the screen in a speaking conversation and move their mouths as they talk. It is only a picture: the conversation text is the same either way.",
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Show Alphonso while practicing", style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
            Switch(checked = on, onCheckedChange = { on = it; container.prefs.edit().putBoolean(AvatarPreference.KEY, it).apply() })
        }
    }
}
