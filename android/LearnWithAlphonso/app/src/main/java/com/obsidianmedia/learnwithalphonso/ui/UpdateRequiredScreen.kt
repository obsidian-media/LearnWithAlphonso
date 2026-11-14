package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.core.net.AppUpdateGate
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * Shown instead of the whole app when the server says this build is below the lowest one it still supports
 * (AppUpdateGate, `GET /api/app-config`). Off unless the owner sets a minimum. The batch-2 design (screen 27): the
 * garden fading into the page, Alphonso at the door, the same words, and the store button (or the plain fallback line).
 */
@Composable
fun UpdateRequiredScreen(requirement: AppUpdateGate.Requirement) {
    val ds = LocalAlphonsoTokens.current
    val uriHandler = LocalUriHandler.current
    val scene = rememberFirstRunAsset("screen-scenes/learn.jpg")
    val pose = rememberFirstRunAsset("poses/alphonso-welcome-door.webp")
    Box(Modifier.fillMaxSize().background(ds.surface).semantics { isTraversalGroup = true }) {
        Box(Modifier.fillMaxWidth().height(AlphonsoTokens.Space.s12 * 6)) {
            scene?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, 1f to ds.surface)))
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3, Alignment.CenterVertically),
        ) {
            pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 5).clearAndSetSemantics { }) }
            Text("Please update Alphonso", modifier = Modifier.semantics { heading() }, style = DisplayType, color = ds.brand, textAlign = TextAlign.Center)
            Text(
                "This version of the app is no longer supported. Update to the latest version to keep learning. Your progress is saved to your account.",
                style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center,
            )
            val store = requirement.storeUrl
            if (store != null) {
                LessonEdgeButton("Update in Google Play", EdgeVariant.PRIMARY, { runCatching { uriHandler.openUri(store) } })
            } else {
                DsCard { Text("Open Google Play and update Learn with Alphonso.", style = HeadlineType, color = ds.ink, textAlign = TextAlign.Center) }
            }
        }
    }
}
