package com.obsidianmedia.learnwithalphonso.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.logic.AskingAlphonsoLayout
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * A question's prompt as Alphonso asking it: his portrait beside a speech bubble (web and iPhone: `AskingAlphonso`).
 * The portrait is decorative (the bubble says it all) and is dropped on a short screen or at a large font scale, where
 * the answer options must stay on screen; the bubble then takes the full width. Static on purpose, so Reduce Motion
 * has nothing to switch off.
 */
@Composable
fun AskingAlphonso(prompt: String, modifier: Modifier = Modifier, hasMedia: Boolean = false) {
    val palette = AlphonsoColor.palette
    val config = LocalConfiguration.current
    // Three steps (AskingAlphonsoLayout, tested in core): none at 640 dp and under or from font scale 1.3, a 56 dp avatar
    // in the middle, a 120 dp figure from 720 dp; a long prompt or a media card caps him at the avatar, both remove him.
    // Only the base Alphonso image exists on Android, no poses.
    val mascotSize = AskingAlphonsoLayout.portraitSizeDp(config.screenHeightDp, config.fontScale, prompt.length, hasMedia)?.dp
    val shape = RoundedCornerShape(AlphonsoRadius.lg)
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (mascotSize != null) {
            Image(
                painterResource(R.drawable.mascot_alphonso),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(mascotSize).clip(RoundedCornerShape(AlphonsoRadius.lg)).border(2.dp, palette.ember, RoundedCornerShape(AlphonsoRadius.lg)),
            )
        }
        Text(
            prompt,
            style = MaterialTheme.typography.titleLarge,
            color = palette.ink,
            modifier = Modifier.weight(1f).clip(shape).background(palette.surface).border(1.dp, palette.hairline, shape).padding(horizontal = 14.dp, vertical = 10.dp),
        )
    }
}
