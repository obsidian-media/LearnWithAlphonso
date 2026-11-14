package com.obsidianmedia.learnwithalphonso.ui.ai

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.obsidianmedia.learnwithalphonso.ui.components.DsCard
import com.obsidianmedia.learnwithalphonso.ui.components.DsCompactButton
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialog
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogBody
import com.obsidianmedia.learnwithalphonso.ui.components.DsDialogTitle
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentGate
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentGatePresentation
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentGatePrompt
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStore
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Whole-screen consent wall, only for screens that ARE AI (`AiConsentPolicy.blocksWholeScreen`): Hector, practice
 * conversations, campaigns. Never on lessons, review or placement. Port of AIDisclosureGateModifier in
 * AIDisclosureSheet.swift; every decision about what is on screen is `AiConsentGate.presentation` (core, tested).
 *
 * - The screen is never mounted before consent has been seen (nothing may record, speak or send on its behalf), but
 *   once shown it is never unmounted: if consent is withdrawn elsewhere, or a read fails, the prompt covers the live
 *   screen, so a conversation in progress keeps its transcript.
 * - A setting that could not be read is "unavailable" with a retry, never "AI is off".
 *
 * [onDecline] runs when the learner taps "Not now" before the screen was ever shown (a pushed screen goes back).
 */
@Composable
fun AiConsentGate(container: AppContainer, onDecline: () -> Unit = {}, content: @Composable () -> Unit) {
    val store = container.aiConsent
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    val consentState by store.state.collectAsState()
    val status = store.statusOf(consentState)
    val isConnected by container.connectivity.isConnected.collectAsState()
    // Saveable: MainActivity handles no configuration changes, so a rotation recreates the composition. Losing
    // `hasBeenShown` would turn a covered live conversation into a spinner and a first-visit prompt, where "Not now"
    // goes back and throws the conversation away.
    var hasBeenShown by rememberSaveable { mutableStateOf(false) }
    var didRefresh by rememberSaveable { mutableStateOf(false) }
    var showDisclosure by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(status) { if (status == AiConsentStatus.GRANTED) hasBeenShown = true }
    LaunchedEffect(Unit) {
        store.refresh()
        didRefresh = true
        // First visit with a definite "no": ask straight away. Mid-session, the learner chooses.
        if (AiConsentGate.asksStraightAway(store.statusOf(), hasBeenShown)) showDisclosure = true
    }

    when (val presentation = AiConsentGate.presentation(status, hasBeenShown, didRefresh)) {
        is AiConsentGatePresentation.Content -> {
            val covered = presentation.covered
            Box(Modifier.fillMaxSize()) {
                // Covered content stays composed (a live conversation keeps its state) but is hidden from touch and TalkBack.
                Box(Modifier.fillMaxSize().then(if (covered != null) Modifier.clearAndSetSemantics { }.focusProperties { canFocus = false } else Modifier)) { content() }
                if (covered != null) {
                    Box(
                        Modifier.fillMaxSize().alpha(0.96f).background(ds.surface)
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
                    )
                    Box(Modifier.fillMaxSize()) { GatePrompt(covered, isConnected, onRetry = { scope.launch { store.refresh() } }, onReview = { showDisclosure = true }) }
                }
            }
        }
        is AiConsentGatePresentation.Prompt -> Box(Modifier.fillMaxSize().background(ds.surface)) {
            GatePrompt(presentation.prompt, isConnected, onRetry = { scope.launch { store.refresh() } }, onReview = { showDisclosure = true })
        }
        AiConsentGatePresentation.Spinner -> Box(Modifier.fillMaxSize().background(ds.surface), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = ds.choice)
        }
    }

    if (showDisclosure) {
        AiConsentDialog(
            store = store,
            onNotNow = {
                showDisclosure = false
                // Only a screen that was never shown has somewhere to back out to; a live conversation stays.
                if (!hasBeenShown) onDecline()
            },
            onAllowed = { showDisclosure = false },
        )
    }
}

@Composable
private fun GatePrompt(kind: AiConsentGatePrompt, isConnected: Boolean, onRetry: () -> Unit, onReview: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val pose = rememberFirstRunAsset("poses/alphonso-explaining-pointer.webp")
    val (title, body) = when {
        kind == AiConsentGatePrompt.CONSENT -> AiConsentCopy.gateTitle to AiConsentCopy.gateBody
        // With no connection the setting was never the problem: say "offline", not "couldn't check your AI setting".
        isConnected -> AiConsentCopy.checkFailedTitle to AiConsentCopy.checkFailedBody
        else -> AiConsentCopy.offlineTitle to AiConsentCopy.offlineBody
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AlphonsoTokens.Space.gutter),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3, Alignment.CenterVertically),
    ) {
        pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 4).clearAndSetSemantics { }) }
        DsCard {
            Text(title, style = TitleType, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().semantics { heading() })
            Text(body, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        if (kind == AiConsentGatePrompt.CONSENT) AlphonsoPrimaryButton(AiConsentCopy.gateAction, onClick = onReview)
        else AlphonsoPrimaryButton(AiConsentCopy.retry, onClick = onRetry)
    }
}

/**
 * The consent sheet: an explicit Allow / Not now choice naming the providers (Play and App Store policy), not a
 * forced "Got it". Used by the whole-screen gate and on demand (the Settings switch, "Turn on AI grading", "Use your
 * voice instead"). "Not now" just closes it. It cannot be dismissed any other way, so the choice is always made.
 */
@Composable
fun AiConsentDialog(store: AiConsentStore, onNotNow: () -> Unit, onAllowed: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var saving by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    val pose = rememberFirstRunAsset("poses/alphonso-explaining-pointer.webp")

    DsDialog(onDismiss = { }, dismissible = false) {
        pose?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(AlphonsoTokens.Space.s12 * 2).clearAndSetSemantics { }) }
        DsDialogTitle(AiConsentCopy.sheetTitle)
        Column(Modifier.fillMaxWidth().heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            DsDialogBody(AiConsentCopy.sheetBody)
        }
        TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }) { Text(AiConsentCopy.privacyLink, style = FootnoteType, color = ds.choice) }
        error?.let { Text(it, style = FootnoteType, color = ds.wrongInk, textAlign = TextAlign.Center) }
        Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            DsCompactButton(AiConsentCopy.notNow, onNotNow, enabled = !saving)
            AlphonsoPrimaryButton(
                AiConsentCopy.allow, busy = saving, fullWidth = false,
                onClick = {
                    saving = true; error = null
                    scope.launch {
                        try {
                            store.set(true)
                            onAllowed()
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = AiConsentCopy.saveFailed
                        } finally {
                            saving = false
                        }
                    }
                },
            )
        }
    }
}
