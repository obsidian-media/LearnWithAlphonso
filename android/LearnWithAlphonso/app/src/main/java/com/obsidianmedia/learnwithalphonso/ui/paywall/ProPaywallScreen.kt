package com.obsidianmedia.learnwithalphonso.ui.paywall

import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.Analytics
import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.billing.BillingPackage
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.logic.PaywallPeriod
import com.obsidianmedia.learnwithalphonso.core.logic.PaywallPlan
import com.obsidianmedia.learnwithalphonso.core.logic.PaywallPlanOption
import com.obsidianmedia.learnwithalphonso.core.logic.PaywallTextSizes
import com.obsidianmedia.learnwithalphonso.core.logic.PaywallWhenLine
import com.obsidianmedia.learnwithalphonso.core.logic.ProPaywall
import com.obsidianmedia.learnwithalphonso.core.logic.ProPaywallCopy
import com.obsidianmedia.learnwithalphonso.core.net.fetchNameStatus
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.firstrun.BodyType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.CaptionType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.FootnoteType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.HeadlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.OverlineType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.TitleType
import com.obsidianmedia.learnwithalphonso.ui.firstrun.rememberFirstRunAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.toTextStyle
import kotlinx.coroutines.launch
import java.time.LocalDate

// The round-6 Alphonso Pro paywall (the approved "Mix: A's story, B's card"; the web twin is
// src/components/paywall/PaywallParts.tsx and the iPhone twin is ProPaywallParts.swift). Every colour, space and type
// size is a design-system token; no price, currency, trial, saving or daily number is typed here: they come from the
// store packages through core ProPaywall, and the daily allowance is "a long conversation every day".

private val DisplayXLType by lazy { AlphonsoTokens.Type.displayXL.toTextStyle() }
private const val CARD_TILT = -6f
private const val BANNER_TILT = -2f
private const val MAX_CONTENT_WIDTH_DP = 480
private const val ROOM_MAX_HEIGHT_DP = 430

/** The learner's first name for the card: only a name they chose, never a generated handle. */
@Composable
private fun rememberCardName(container: AppContainer): String? {
    val name by produceState<String?>(null) {
        value = runCatching { container.progressClient.fetchNameStatus() }.getOrNull()
            ?.takeIf { it.nameConfirmed }?.displayName?.let { ProPaywallCopy.cardFirstName(it) }
    }
    return name
}

private fun BillingPackage.toPlan(): PaywallPlan? {
    val unit = periodUnit ?: return null
    return PaywallPlan(id, priceString, priceMicros, currencyCode, PaywallPeriod(unit, periodValue), PaywallPeriod.parseIso(freeTrialPeriod))
}

@Composable
fun ProPaywallScreen(container: AppContainer, source: String = "hector_tab", onPurchaseStarted: () -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    val store = container.entitlements
    val state by store.state.collectAsState()
    val course by container.activeCourse.course.collectAsState()
    val name = rememberCardName(container)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    var selectedId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { store.loadOffering() }
    LaunchedEffect(source) { Analytics.track(AnalyticsEvent.PAYWALL_VIEWED, mapOf("source" to source)) }
    val plans = remember(state.packages) { state.packages.mapNotNull { it.toPlan() } }
    val presentation = remember(plans, selectedId) { ProPaywall.make(plans, selectedId, LocalDate.now()) }

    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
        PaywallRoomTop(name)
        Column(
            Modifier.widthIn(max = MAX_CONTENT_WIDTH_DP.dp).padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s4),
        ) {
            PaywallHeadline()
            PaywallExampleCall(course)
            PaywallFacts()
            if (presentation != null) ProCardBanner(name)
            PaywallFreeRow()
            when {
                state.isLoading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ds.action) }
                presentation == null -> Text(
                    state.error ?: "Subscription options aren't available right now. Please try again in a moment.",
                    style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
                else -> Column(verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                    if (presentation.options.isNotEmpty()) PaywallPlanPicker(presentation.options) { selectedId = it }
                    // Price first, trial after, the price never smaller (store policy): both read the same size constants.
                    Text(presentation.priceLine, style = BodyType, fontSize = PaywallTextSizes.PRICE_SP.sp, fontWeight = FontWeight.Bold, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    presentation.trialLine?.let {
                        Text(it, style = BodyType, fontSize = PaywallTextSizes.TRIAL_SP.sp, fontWeight = FontWeight.SemiBold, color = ds.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    }
                    PaywallWhenRow(presentation.whenLine)
                    AlphonsoPrimaryButton(presentation.ctaTitle, onClick = {
                        val pkg = state.packages.firstOrNull { it.id == presentation.productId }
                        val activity = context as? Activity
                        if (pkg != null && activity != null) {
                            onPurchaseStarted()
                            Analytics.track(AnalyticsEvent.PURCHASE_STARTED, mapOf("source" to source))
                            scope.launch { store.purchase(activity, pkg) }
                        }
                    })
                }
            }
            state.error?.takeIf { presentation != null }?.let { Text(it, style = FootnoteType, color = ds.wrong, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = { onPurchaseStarted(); scope.launch { store.restorePurchases() } }) { Text("Restore Purchases", style = FootnoteType, color = ds.choice) }
                TextButton(onClick = { uriHandler.openUri("https://play.google.com/store/account/subscriptions") }) { Text("Manage Subscription", style = FootnoteType, color = ds.choice) }
            }
            Text(
                presentation?.renewal ?: "Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period.",
                style = CaptionType, color = ds.inkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/terms") }) { Text("Terms of Use", style = CaptionType, color = ds.inkSoft) }
                TextButton(onClick = { uriHandler.openUri("${BuildConfig.API_BASE_URL}/privacy") }) { Text("Privacy Policy", style = CaptionType, color = ds.inkSoft) }
            }
        }
    }
}

/** The welcome after buying: Hector in his room, three openers, "Call Hector". */
@Composable
fun ProWelcomeScreen(container: AppContainer, onCall: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val course by container.activeCourse.course.collectAsState()
    val name = rememberCardName(container)
    Column(Modifier.fillMaxSize().background(ds.surface).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
        PaywallRoomTop(name)
        Column(
            Modifier.widthIn(max = MAX_CONTENT_WIDTH_DP.dp).padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s4),
            verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
        ) {
            Text(ProPaywallCopy.WELCOME_EYEBROW.uppercase(), style = OverlineType, color = ds.actionText)
            Text(ProPaywallCopy.welcomeGreeting(name), style = DisplayXLType, color = ds.ink, modifier = Modifier.semantics { heading() })
            Text(ProPaywallCopy.WELCOME_READY, style = TitleType, color = ds.brand)
            Text(ProPaywallCopy.WELCOME_BODY, style = BodyType, color = ds.inkSoft)
            Text(ProPaywallCopy.OPENERS_TITLE, style = HeadlineType, color = ds.ink)
            ProPaywallCopy.openers(course).forEach { opener ->
                Text(opener, style = BodyType, color = ds.ink, modifier = Modifier.fillMaxWidth().tile(RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(AlphonsoTokens.Space.s3))
            }
            AlphonsoPrimaryButton(ProPaywallCopy.CALL_HECTOR, onClick = onCall)
        }
    }
}

@Composable
private fun Modifier.tile(shape: RoundedCornerShape, dashed: Boolean = false): Modifier {
    val ds = LocalAlphonsoTokens.current
    // A dashed edge is drawn by the same 2 dp warm border; Compose has no dashed BorderStroke, so the "when" row uses the soft fill.
    return this.background(if (dashed) ds.sunk else ds.card, shape).border(BorderStroke(AlphonsoTokens.Space.s1 / 2, ds.line), shape)
}

/** The navy card face: the hero gradient with a gold rule inside the edge, Hector peeking from the corner. */
@Composable
private fun ProCardFace(name: String?, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    val hector = rememberFirstRunAsset("firstrun/hector-happy.webp")
    BoxWithConstraints(
        modifier.shadow(AlphonsoTokens.Space.s2, shape).clip(shape)
            .background(Brush.radialGradient(listOf(ds.heroA, ds.hero, ds.heroB)))
            .border(BorderStroke(AlphonsoTokens.Space.s1 / 2, ds.onHeroKick.copy(alpha = 0.85f)), shape),
    ) {
        hector?.let {
            Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.align(Alignment.BottomEnd).offset(x = AlphonsoTokens.Space.s2, y = AlphonsoTokens.Space.s3).size(maxHeight))
        }
        Text(ProPaywallCopy.KICKER.uppercase(), style = OverlineType, color = ds.onHeroKick, modifier = Modifier.align(Alignment.TopStart).padding(AlphonsoTokens.Space.s3))
        name?.let { Text(it, style = TitleType, color = ds.onHero, maxLines = 1, modifier = Modifier.align(Alignment.BottomStart).padding(AlphonsoTokens.Space.s3)) }
    }
}

/** Hector in his library fading into the screen colour, the small tilted Pro card pinned top left. */
@Composable
private fun PaywallRoomTop(name: String?) {
    val ds = LocalAlphonsoTokens.current
    val room = rememberFirstRunAsset("scenes/library.webp")
    val hector = rememberFirstRunAsset("firstrun/hector-talk.webp")
    BoxWithConstraints(Modifier.fillMaxWidth().heightIn(max = ROOM_MAX_HEIGHT_DP.dp)) {
        val side = minOf(maxWidth, ROOM_MAX_HEIGHT_DP.dp)
        Box(Modifier.size(side).align(Alignment.TopCenter)) {
            room?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to ds.heroB.copy(alpha = 0.18f), 0.3f to Color.Transparent, 0.62f to Color.Transparent, 0.97f to ds.surface)))
            hector?.let {
                Image(
                    it, contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.align(Alignment.BottomCenter).width(side * 0.77f).semantics { contentDescription = ProPaywallCopy.ROOM_LABEL; role = Role.Image },
                )
            }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.74f to Color.Transparent, 0.92f to ds.surface.copy(alpha = 0.85f), 1f to ds.surface)))
            ProCardFace(name, Modifier.align(Alignment.TopStart).padding(start = AlphonsoTokens.Space.s4, top = AlphonsoTokens.Space.s12).width(side * 0.4f).height(side * 0.25f).graphicsLayer { rotationZ = CARD_TILT }.clearAndSetSemantics { })
        }
    }
}

/** The card leading the plans: wide, tilted a little, the learner's name on it. */
@Composable
private fun ProCardBanner(name: String?) {
    ProCardFace(name, Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1).height(AlphonsoTokens.Space.s12 * 2).graphicsLayer { rotationZ = BANNER_TILT }.clearAndSetSemantics { })
}

@Composable
private fun PaywallHeadline() {
    val ds = LocalAlphonsoTokens.current
    Text(
        buildAnnotatedString {
            append(ProPaywallCopy.HEADLINE_LEAD)
            withStyle(SpanStyle(textDecoration = TextDecoration.Underline, background = ds.actionTint)) { append(ProPaywallCopy.HEADLINE_MARK) }
            append(ProPaywallCopy.HEADLINE_END)
        },
        style = DisplayXLType, color = ds.ink, modifier = Modifier.fillMaxWidth().semantics { heading() },
    )
}

/** One real-looking moment: Hector remembering last week's mistake. Labelled as an example, honestly. */
@Composable
private fun PaywallExampleCall(course: Course) {
    val ds = LocalAlphonsoTokens.current
    val call = ProPaywallCopy.exampleCall(course)
    val bubble = RoundedCornerShape(AlphonsoTokens.Space.s4)
    val spoken = "${ProPaywallCopy.EXAMPLE_LABEL}. Hector: ${call.before}${call.recalled}${call.after} You: ${call.reply} Hector: ${call.praise}"
    Box(Modifier.padding(top = AlphonsoTokens.Space.s2).clearAndSetSemantics { contentDescription = spoken }) {
        Column(Modifier.fillMaxWidth().tile(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(AlphonsoTokens.Space.s3), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.Top) {
                HectorDot()
                Text(
                    buildAnnotatedString {
                        append(call.before)
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = ds.actionText, background = ds.actionTint)) { append(call.recalled) }
                        append(call.after)
                    },
                    style = BodyType, color = ds.ink, modifier = Modifier.background(ds.choiceTint, bubble).padding(AlphonsoTokens.Space.s3),
                )
            }
            Text(call.reply, style = BodyType, color = ds.onHero, modifier = Modifier.align(Alignment.End).background(ds.brand, bubble).padding(AlphonsoTokens.Space.s3))
            Row(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalAlignment = Alignment.Top) {
                HectorDot()
                Text(call.praise, style = BodyType, color = ds.ink, modifier = Modifier.background(ds.choiceTint, bubble).padding(AlphonsoTokens.Space.s3))
            }
        }
        Text(
            ProPaywallCopy.EXAMPLE_LABEL.uppercase(), style = CaptionType, color = ds.inkSoft,
            modifier = Modifier.align(Alignment.TopStart).offset(x = AlphonsoTokens.Space.s3, y = -AlphonsoTokens.Space.s3).background(ds.surface).padding(horizontal = AlphonsoTokens.Space.s2),
        )
    }
}

@Composable
private fun HectorDot() {
    val ds = LocalAlphonsoTokens.current
    val hector = rememberFirstRunAsset("firstrun/hector-happy.webp")
    Box(Modifier.size(AlphonsoTokens.Space.s8 - AlphonsoTokens.Space.s1).clip(CircleShape).background(ds.sunk)) {
        hector?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize()) }
    }
}

/** The three facts: any topic, remembers your weak spots, a long conversation every day. */
@Composable
private fun PaywallFacts() {
    val ds = LocalAlphonsoTokens.current
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Max).clearAndSetSemantics { contentDescription = ProPaywallCopy.FACTS_SPOKEN },
        horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        ProPaywallCopy.facts.forEach { (title, detail) ->
            Column(
                Modifier.weight(1f).fillMaxSize().tile(RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(vertical = AlphonsoTokens.Space.s3, horizontal = AlphonsoTokens.Space.s1),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1),
            ) {
                Box(Modifier.size(AlphonsoTokens.Space.s6).clip(CircleShape).background(ds.choiceTint))
                Text(title, style = HeadlineType, color = ds.ink, textAlign = TextAlign.Center)
                Text(detail, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
            }
        }
    }
}

/** "Everything else stays free": lessons, Alphonso calls, audio, review. */
@Composable
private fun PaywallFreeRow() {
    val ds = LocalAlphonsoTokens.current
    Column(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "${ProPaywallCopy.FREE_LABEL}: ${ProPaywallCopy.freeItems.joinToString(", ")}. ${ProPaywallCopy.FREE_NOTE}" },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s1)) {
            ProPaywallCopy.freeItems.forEach {
                Text("✓ $it", style = FootnoteType, color = ds.rightInk, modifier = Modifier.background(ds.rightTint, CircleShape).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1))
            }
        }
        Text(ProPaywallCopy.FREE_NOTE, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
    }
}

/** Yearly and monthly side by side, the selected one marked. */
@Composable
private fun PaywallPlanPicker(options: List<PaywallPlanOption>, onSelect: (String) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max).padding(top = AlphonsoTokens.Space.s2).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
        options.forEach { option ->
            val spoken = listOfNotNull(option.title, option.priceLine, option.perMonthLine, option.savingsLine, option.trialNote).joinToString(", ")
            Box(Modifier.weight(1f).fillMaxSize()) {
                Column(
                    Modifier.fillMaxSize().heightIn(min = AlphonsoTokens.Space.s12 * 2).clip(shape)
                        .background(if (option.isSelected) ds.choiceTint else ds.card, shape)
                        .border(BorderStroke(AlphonsoTokens.Space.s1 / 2, if (option.isSelected) ds.brand else ds.line), shape)
                        .selectable(selected = option.isSelected, role = Role.RadioButton, onClick = { onSelect(option.id) })
                        .clearAndSetSemantics { contentDescription = spoken }
                        .padding(horizontal = AlphonsoTokens.Space.s2, vertical = AlphonsoTokens.Space.s3),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Text(option.title, style = FootnoteType, color = ds.inkSoft)
                    Text(option.priceLine, style = HeadlineType, color = ds.ink, textAlign = TextAlign.Center)
                    Text(option.perMonthLine, style = FootnoteType, color = ds.inkSoft, textAlign = TextAlign.Center)
                    option.trialNote?.let { Text(it, style = FootnoteType, color = ds.actionText, textAlign = TextAlign.Center) }
                }
                option.savingsLine?.let {
                    Text(it, style = CaptionType, color = ds.onAction, modifier = Modifier.align(Alignment.TopCenter).offset(y = -AlphonsoTokens.Space.s2).background(ds.action, RoundedCornerShape(AlphonsoTokens.Radius.key)).padding(horizontal = AlphonsoTokens.Space.s2))
                }
            }
        }
    }
}

/** The "when do I pay" row: the exact first-payment date, and that cancelling before it costs nothing. */
@Composable
private fun PaywallWhenRow(line: PaywallWhenLine) {
    val ds = LocalAlphonsoTokens.current
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = ds.ink)) { append(line.lead) }
            append(" ${line.rest}")
        },
        style = BodyType, color = ds.inkSoft,
        modifier = Modifier.fillMaxWidth().tile(RoundedCornerShape(AlphonsoTokens.Radius.control), dashed = true).padding(AlphonsoTokens.Space.s3)
            .clearAndSetSemantics { contentDescription = "${line.lead} ${line.rest}" },
    )
}
