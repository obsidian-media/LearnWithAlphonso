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
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference

/** "Show Alphonso while practicing": on by default, kept on this device, same key as the iOS and web settings. */
@Composable
internal fun AvatarSection(container: AppContainer) {
    val ds = LocalAlphonsoTokens.current
    var on by remember { mutableStateOf(container.prefs.getBoolean(AvatarPreference.KEY, AvatarPreference.DEFAULT)) }
    Section(
        "Show Alphonso while practicing",
        footer = "Alphonso (and Hector, on the Hector tab) fill the screen in a speaking conversation and move their mouths as they talk. It is only a picture: the conversation text is the same either way.",
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Show Alphonso while practicing", style = HeadlineType, color = ds.ink, modifier = Modifier.weight(1f))
            DsSwitch(checked = on, onChange = { on = it; container.prefs.edit().putBoolean(AvatarPreference.KEY, it).apply() })
        }
    }
}
