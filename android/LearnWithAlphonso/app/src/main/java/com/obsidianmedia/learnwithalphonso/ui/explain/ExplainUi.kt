package com.obsidianmedia.learnwithalphonso.ui.explain

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCopy
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainCopy
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainDirection
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainFlow
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainKind
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainOffer
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainPhase
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRequest
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
import com.obsidianmedia.learnwithalphonso.core.net.ExplainErrors
import com.obsidianmedia.learnwithalphonso.core.net.Explanation
import com.obsidianmedia.learnwithalphonso.core.net.reportAiResponse
import com.obsidianmedia.learnwithalphonso.ui.ai.AiConsentDialog
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// "Explain in my language" (BACKLOG 0.0-bc, approved round 8 mock, feature 1). Built on the design system tokens only.

private val BodyStyle by lazy { AlphonsoTokens.Type.body.toTextStyle() }
private val FootnoteStyle by lazy { AlphonsoTokens.Type.footnote.toTextStyle() }
private val CaptionStyle by lazy { AlphonsoTokens.Type.caption.toTextStyle() }
private val OverlineStyle by lazy { AlphonsoTokens.Type.overline.toTextStyle() }

/** U+200E LEFT-TO-RIGHT MARK: keeps a quoted course-language phrase, and its punctuation, left to right inside right-to-left text. */
private const val LRM = '‎'

/**
 * The small "AI" label every AI-written text carries: "AI" or, for a text in a language the learner chose, "AI - Persian".
 * The one shared AI label (the round 8 mock's "AI · Persian"); TalkBack reads it as words, not as a bare dot.
 */
@Composable
fun AiLabel(language: String? = null, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val spoken = if (language.isNullOrEmpty()) "AI-written" else "AI-written, $language"
    Row(
        modifier.clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(ds.choiceTint).border(1.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.key))
            .padding(horizontal = 6.dp, vertical = 2.dp).clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(ds.choice))
        Text(ExplainCopy.aiLabel(language), style = CaptionStyle, color = ds.brand)
    }
}

/** A part of Alphonso's face (the lesson art), cropped to a circle like the verdict sheet's. */
@Composable
private fun ExplainFace(file: String, size: Dp, background: Color) {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, file) { value = withContext(Dispatchers.IO) { loadAsset(context, "lesson/$file.webp") } }
    Box(Modifier.size(size).clip(CircleShape).background(background).clearAndSetSemantics {}) {
        image?.let {
            Image(
                it, null, contentScale = ContentScale.Crop, alignment = BiasAlignment(0f, -0.52f),
                modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = 1.9f; scaleY = 1.9f; transformOrigin = TransformOrigin(0.5f, 0.24f) },
            )
        }
    }
}

/**
 * The explanation text. Right to left for the languages written that way, set in this block only (never the whole
 * screen), with quoted course-language phrases kept left to right and in the brand colour.
 */
@Composable
private fun ExplanationText(result: Explanation, color: Color, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val rtl = result.direction == ExplainDirection.RTL
    val brand = ds.brand
    val text: AnnotatedString = remember(result, brand) {
        if (!rtl) {
            AnnotatedString(result.explanation)
        } else {
            buildAnnotatedString {
                for (run in ExplainRules.splitDirectionRuns(result.explanation)) {
                    if (run.ltr) {
                        append(LRM)
                        withStyle(SpanStyle(color = brand, fontWeight = FontWeight.ExtraBold)) { append(run.text) }
                        append(LRM)
                    } else {
                        append(run.text)
                    }
                }
            }
        }
    }
    val style: TextStyle = BodyStyle.copy(
        textAlign = TextAlign.Start,
        textDirection = if (rtl) TextDirection.Rtl else TextDirection.Ltr,
        localeList = LocaleList(result.language),
    )
    CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        Text(text, modifier = modifier.fillMaxWidth(), style = style, color = color)
    }
}

private sealed interface ReportState {
    data object Idle : ReportState
    data object Sending : ReportState
    data object Sent : ReportState
    data object Failed : ReportState
}

/** The footer's "Not clear?": picks a reason and files the explanation as an AI response report (surface "explain"). */
@Composable
private fun NotClear(container: AppContainer, result: Explanation, course: String, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    var state by remember(result) { mutableStateOf<ReportState>(ReportState.Idle) }
    var picking by remember(result) { mutableStateOf(false) }
    when (state) {
        ReportState.Sent -> Text(AiConsentCopy.reportThanks, style = CaptionStyle, color = ds.inkSoft, modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite })
        ReportState.Sending -> Text("Sending...", style = CaptionStyle, color = ds.inkSoft, modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite })
        else -> Column(modifier) {
            Text(
                ExplainCopy.NOT_CLEAR, style = CaptionStyle.copy(textDecoration = TextDecoration.Underline), color = ds.inkSoft,
                modifier = Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClickLabel = AiConsentCopy.reportAction) { picking = true }
                    .padding(vertical = AlphonsoTokens.Space.s3).semantics { contentDescription = AiConsentCopy.reportAction },
            )
            if (state == ReportState.Failed) Text(AiConsentCopy.reportFailed, style = CaptionStyle, color = ds.wrongInk, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
    }
    if (picking) {
        AlertDialog(
            onDismissRequest = { picking = false },
            title = { Text(AiConsentCopy.reportAction) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
                    Text(AiConsentCopy.reportReviewNote, style = CaptionStyle, color = ds.inkSoft)
                    AiResponseReportReason.entries.forEach { reason ->
                        TextButton(onClick = {
                            picking = false
                            state = ReportState.Sending
                            val report = AiReplyReports.explain(result.explanation, course, reason)
                            // On the app's scope: scrolling the card away must not lose the report.
                            container.appLifetimeScope.launch {
                                state = try {
                                    container.progressClient.reportAiResponse(report)
                                    ReportState.Sent
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    ReportState.Failed
                                }
                            }
                        }) { Text(reason.label, color = ds.ink) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel", color = ds.inkSoft) } },
        )
    }
}

@Composable
private fun TextLink(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Text(
        text, style = CaptionStyle.copy(textDecoration = TextDecoration.Underline), color = ds.choice,
        modifier = modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clickable(role = Role.Button, onClick = onClick).padding(vertical = AlphonsoTokens.Space.s3),
    )
}

/**
 * "Explain in <language>": one quiet chip that fetches a short WHY in the learner's own language, only when tapped (or
 * straight away for "Always show"). Shows nothing when the learner chose target language only, has no native language
 * on file, or it equals the course's, and nothing until the settings have been read. The explanation is labelled as AI
 * and can be reported with "Not clear?".
 *
 *  - wrong answer: a bordered card under the verdict with Alphonso at its head.
 *  - word: a tinted "IN <LANGUAGE>" block on the word card.
 *  - message: "Say that in <language>", the translation set right under the bubble.
 *
 * [request] is null when there is nothing to explain (a skipped question). Build it with the [ExplainRules] builders; a
 * Hector message is built with `hector = true`, which spends Hector's own Pro allowance.
 */
@Composable
fun ExplainInMyLanguage(container: AppContainer, request: ExplainRequest?, modifier: Modifier = Modifier) {
    val settings by container.explainSettings.state.collectAsState()
    LaunchedEffect(Unit) { container.explainSettings.ensureLoaded() }
    if (request == null || !settings.loaded) return
    val offer = ExplainRules.offer(settings.mode, settings.nativeLanguage, request.course)
    if (offer == ExplainOffer.HIDDEN) return
    val language = ExplainRules.languageName(settings.nativeLanguage!!)
    // A different item (the next question) starts again from the chip, even if the caller rebuilt an equal request.
    val key = remember(request) { request.toJson().toString() }
    ExplainItem(container, request, key, offer, language, modifier)
}

@Composable
private fun ExplainItem(container: AppContainer, request: ExplainRequest, key: String, offer: ExplainOffer, language: String, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val scope = rememberCoroutineScope()
    val flow = remember(key) {
        ExplainFlow(request, { container.explainClient.explain(it) }, container.aiConsent, { container.session.currentAccessToken() != null }, scope)
    }
    val phase by flow.phase.collectAsState()
    // "Always show": ask as soon as the item is on screen, once. Hiding it afterwards does not ask again.
    var autoAsked by remember(key) { mutableStateOf(false) }
    LaunchedEffect(key, offer) {
        if (offer == ExplainOffer.AUTO && !autoAsked && flow.phase.value == ExplainPhase.Idle) {
            autoAsked = true
            flow.run()
        }
    }

    val shown = phase as? ExplainPhase.Shown
    if (shown != null) {
        val result = shown.result
        when (request.kind) {
            ExplainKind.WRONG_ANSWER -> Column(
                modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card)
                    .border(2.dp, ds.brand, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(AlphonsoTokens.Space.s3),
            ) {
                Row(Modifier.padding(bottom = AlphonsoTokens.Space.s2), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    ExplainFace("talk", 30.dp, ds.choiceTint)
                    Text(ExplainCopy.ALPHONSO_EXPLAINS, style = FootnoteStyle, color = ds.ink, modifier = Modifier.weight(1f).semantics { heading() })
                    AiLabel(language)
                }
                ExplanationText(result, ds.ink)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    NotClear(container, result, request.course)
                    TextLink(ExplainCopy.SHOW_IN_ENGLISH) { flow.hide() }
                }
            }
            ExplainKind.WORD -> Column(
                modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.choiceTint).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
            ) {
                Row(Modifier.fillMaxWidth().padding(bottom = AlphonsoTokens.Space.s1), verticalAlignment = Alignment.CenterVertically) {
                    Text(ExplainCopy.inLanguage(language), style = OverlineStyle, color = ds.brand, modifier = Modifier.weight(1f))
                    AiLabel()
                }
                ExplanationText(result, ds.brand)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    NotClear(container, result, request.course)
                    TextLink(ExplainCopy.HIDE) { flow.hide() }
                }
            }
            ExplainKind.MESSAGE -> Column(
                modifier.widthIn(max = AlphonsoTokens.Space.s12 * 6).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.choiceTint).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
            ) {
                ExplanationText(result, ds.ink)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    AiLabel(language)
                    NotClear(container, result, request.course)
                    Spacer(Modifier.weight(1f))
                    TextLink(ExplainCopy.HIDE) { flow.hide() }
                }
            }
        }
        return
    }

    val loading = phase == ExplainPhase.Loading
    val error = (phase as? ExplainPhase.Failed)?.kind
    val label = when {
        loading -> ExplainCopy.EXPLAINING
        request.kind == ExplainKind.MESSAGE -> ExplainCopy.sayThat(language)
        else -> ExplainCopy.chip(language)
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
        Row(
            Modifier.heightIn(min = AlphonsoTokens.Space.minTouch).clip(RoundedCornerShape(AlphonsoTokens.Radius.key)).background(ds.choiceTint)
                .border(2.dp, if (loading || (error != null && !error.isRetryable)) ds.line else ds.brand, RoundedCornerShape(AlphonsoTokens.Radius.key))
                .clickable(enabled = !loading && (error == null || error.isRetryable), role = Role.Button) { flow.run() }
                .padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1)
                .semantics { if (loading) liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (request.kind != ExplainKind.MESSAGE) ExplainFace("hmm", 22.dp, ds.card)
            Text(label, style = FootnoteStyle, color = if (loading) ds.inkSoft else ds.brand)
        }
        if (error != null) {
            Text(ExplainErrors.copy(error), style = CaptionStyle, color = ds.wrongInk, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        }
    }
    if (phase == ExplainPhase.NeedsConsent) {
        AiConsentDialog(container.aiConsent, onNotNow = flow::declineConsent, onAllowed = { flow.run() })
    }
}
