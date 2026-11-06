package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.core.net.AppUpdateGate
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor

/**
 * Shown over the whole app when the server says this build is below the lowest one it still supports
 * (AppUpdateGate, `GET /api/app-config`). Off unless the owner sets a minimum.
 */
@Composable
fun UpdateRequiredScreen(requirement: AppUpdateGate.Requirement) {
    val p = AlphonsoColor.palette
    val uriHandler = LocalUriHandler.current
    Column(
        Modifier
            .fillMaxSize()
            .background(p.surface)
            // Swallows every touch so nothing underneath can be used.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .semantics { isTraversalGroup = true }
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Please update Alphonso", color = p.ink, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Text(
            "This version of the app is no longer supported. Update to the latest version to keep learning. Your progress is saved to your account.",
            color = p.inkSoft, fontSize = 15.sp, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        val store = requirement.storeUrl
        if (store != null) {
            AlphonsoPrimaryButton("Update in Google Play", onClick = { runCatching { uriHandler.openUri(store) } })
        } else {
            Text("Open Google Play and update Learn with Alphonso.", color = p.ink, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        }
    }
}
