package com.obsidianmedia.learnwithalphonso.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * The 72 dp press-and-hold microphone. Press begins a turn, release ends it;
 * the engine handles everything in between. `busyLabel` replaces the button
 * while transcribing, thinking or speaking.
 */
@Composable
fun HoldToTalkButton(
    phase: TurnPhase,
    busyLabel: String?,
    tint: Color,
    hint: String,
    accessibilityLabel: String,
    enabled: Boolean = true,
    onPressBegan: () -> Unit,
    onPressEnded: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (busyLabel != null) {
            CircularProgressIndicator(color = tint)
            Text(busyLabel, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        } else {
            val recording = phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC
            Box(
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(if (recording) palette.destructive else tint)
                    .semantics { contentDescription = accessibilityLabel }
                    .pointerInput(enabled) {
                        if (!enabled) return@pointerInput
                        detectTapGestures(onPress = {
                            onPressBegan()
                            try { tryAwaitRelease() } finally { onPressEnded() }
                        })
                    },
                contentAlignment = Alignment.Center,
            ) { Text("🎤", fontSize = 26.sp) }
            Text(hint, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
        }
    }
}
