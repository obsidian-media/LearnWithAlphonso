package com.obsidianmedia.learnwithalphonso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.core.auth.AccountSuspension
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.DisplayType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * Shown instead of the app for a suspended (banned) account (backlog item 87): after a banned sign-in, or when a ban
 * ends the session. The words are the web SuspendedScreen's (AccountSuspension); iOS's SuspendedView is the twin.
 * Replaces the app rather than covering it, so TalkBack cannot reach anything underneath. Scrolls, and its text is
 * sp-sized, so it holds at the largest font scale. [reason] is null today: the API sends none.
 */
@Composable
fun SuspendedScreen(onSignOut: () -> Unit, reason: String? = null) {
    val ds = LocalAlphonsoTokens.current
    val uriHandler = LocalUriHandler.current
    val reasonLine = AccountSuspension.reasonLine(reason)
    Box(Modifier.fillMaxSize().background(ds.surface).semantics { isTraversalGroup = true }) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3, Alignment.CenterVertically),
        ) {
            Text(AccountSuspension.TITLE, modifier = Modifier.semantics { heading() }, style = DisplayType, color = ds.ink, textAlign = TextAlign.Center)
            if (reasonLine != null) Text(reasonLine, style = HeadlineType, color = ds.ink, textAlign = TextAlign.Center)
            Text(AccountSuspension.BODY, style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center)
            // One TalkBack node per button: the merged semantics carry the click action and the longer label.
            LessonEdgeButton(
                AccountSuspension.CONTACT_TITLE, EdgeVariant.PRIMARY, { runCatching { uriHandler.openUri(AccountSuspension.CONTACT_URL) } },
                Modifier.semantics(mergeDescendants = true) { contentDescription = AccountSuspension.CONTACT_LABEL },
            )
            LessonEdgeButton(
                AccountSuspension.SIGN_OUT_TITLE, EdgeVariant.SECONDARY, onSignOut,
                Modifier.semantics(mergeDescendants = true) { contentDescription = AccountSuspension.SIGN_OUT_LABEL },
            )
        }
    }
}
