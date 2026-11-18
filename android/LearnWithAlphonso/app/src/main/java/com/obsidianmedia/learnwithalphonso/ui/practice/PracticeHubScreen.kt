package com.obsidianmedia.learnwithalphonso.ui.practice

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.*
import com.obsidianmedia.learnwithalphonso.ui.components.DsField
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.content.*
import com.obsidianmedia.learnwithalphonso.core.logic.*
import com.obsidianmedia.learnwithalphonso.core.avatar.CallClock
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonRoom
import com.obsidianmedia.learnwithalphonso.ui.practice.call.loadAsset
import com.obsidianmedia.learnwithalphonso.ui.theme.*
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Space
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens.Type
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

private data class PracticeTarget(val scenario: Scenario? = null, val campaign: Campaign? = null, val sceneIndex: Int = 0) {
    val scene get() = campaign?.scenes?.get(sceneIndex)
    val title get() = scenario?.title ?: scene!!.title
    val persona get() = scenario?.persona ?: scene?.persona.orEmpty()
    val opener get() = scenario?.opener ?: scene!!.opener
    val detail get() = scenario?.level ?: "${campaign!!.level} · ${campaign.title}, scene ${sceneIndex + 1} of ${campaign.scenes.size}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PracticeScreen(container: AppContainer, onOpenScenario: (String, String) -> Unit, onOpenCampaign: (String, Int, String) -> Unit, onHector: () -> Unit) {
    val course by container.activeCourse.course.collectAsState()
    var data by remember(course) { mutableStateOf<PracticeHubData?>(null) }
    var failed by remember(course) { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    val entitlement by container.entitlements.state.collectAsState()
    var sayingPicture by rememberSaveable { mutableStateOf(false) }
    var sayingItRight by rememberSaveable { mutableStateOf(false) }
    val palette by container.themeManager.palette.collectAsState()
    val initialMode = if (container.prefs.getBoolean(com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference.KEY, com.obsidianmedia.learnwithalphonso.core.avatar.AvatarPreference.DEFAULT)) "call" else "chat"
    LaunchedEffect(course, reload) {
        runCatching { container.aiClient.practiceHub(course.code) }.onSuccess { data = it; failed = false }.onFailure { failed = true }
    }
    CompositionLocalProvider(LocalAlphonsoTokens provides AlphonsoTokens.colors(palette, false)) {
        if (sayingPicture) { SayThePictureScreen(container, course) { sayingPicture = false }; return@CompositionLocalProvider }
        if (sayingItRight) { PronunciationScreen(container, course) { sayingItRight = false }; return@CompositionLocalProvider }
        PracticeHubContent(course, container.content.scenarios(course), container.content.campaigns(course), data, failed,
            initialMode, !entitlement.isPro, { reload++ }, onOpenScenario, onOpenCampaign, onHector, onSayPicture = { sayingPicture = true }, onSayItRight = { sayingItRight = true })
    }
}

/** Rendering seam used by the offline emulator checks; no account or live API needed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PracticeHubContent(
    course: Course, scenarios: List<Scenario>, campaigns: List<Campaign>, data: PracticeHubData?, failed: Boolean,
    initialMode: String, showHector: Boolean, onRetry: () -> Unit,
    onOpenScenario: (String, String) -> Unit, onOpenCampaign: (String, Int, String) -> Unit, onHector: () -> Unit,
    onSayPicture: () -> Unit = {},
    onSayItRight: () -> Unit = {},
) {
    val ds = LocalAlphonsoTokens.current
    var level by remember { mutableStateOf("All") }
    var target by remember(course) { mutableStateOf<PracticeTarget?>(null) }
    var mode by remember { mutableStateOf(initialMode) }
    val rows = data?.stars.orEmpty()
    val columns = if (androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.3f) 1 else 2
    LazyColumn(Modifier.testTag("practice-hub").fillMaxSize().background(ds.surface), contentPadding = PaddingValues(Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.s4)) {
        item {
            val greeting = when (course) {
                Course.FRENCH -> "On pratique un peu aujourd'hui ?\nShall we practice a bit today?"
                Course.SPANISH -> "¿Practicamos un poco hoy?\nShall we practice a bit today?"
                else -> "Shall we practice a bit today?"
            }
            LessonRoom("coffee", LessonExpression.TALK, Space.s12 * 6, Space.s12 * 5, titleScrim = true, overlay = {
                Box(Modifier.fillMaxSize()) {
                    Text("Practice", style = Type.display.toTextStyle(), color = ds.onHero, modifier = Modifier.padding(Space.s4))
                    if (columns == 2) Text(greeting, style = Type.caption.toTextStyle(), color = ds.ink,
                        modifier = Modifier.align(Alignment.TopEnd).padding(top = Space.s12 + Space.s3, end = Space.s2).widthIn(max = Space.s12 * 3)
                            .background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s3))
                }
            })
            if (columns == 1) Text(greeting, style = Type.headline.toTextStyle(), color = ds.ink, modifier = Modifier.padding(Space.s3))
        }
        if (data != null) {
            item {
                val tally = PracticeHub.tally(rows, scenarios, campaigns)
                Text("★ ${tally.first} / ${tally.second}", style = Type.headline.toTextStyle(), color = ds.xpText)
            }
            val pick = PracticeHub.today(data, scenarios)
            val chosen = scenarios.firstOrNull { it.id == pick?.scenarioId }
            if (chosen != null) item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).background(ds.hero).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s3)) {
                    Text("TODAY'S PICK", style = Type.overline.toTextStyle(), color = ds.onHeroKick)
                    Text(chosen.title, style = Type.questionSmall.toTextStyle(), color = ds.onHero)
                    PracticeStars(PracticeHub.stars(rows, "scenario", chosen.id))
                    Text(pick?.weakSpot?.let { "A ${chosen.level.lowercase()} scene that makes you use ${PracticeHub.weakSpotName(it)}, your top weak spot." } ?: "A ${chosen.level.lowercase()} scene to put what you know into words.", style = Type.footnote.toTextStyle(), color = ds.onHeroSoft)
                    HubButton("Call Alphonso") { target = PracticeTarget(scenario = chosen) }
                }
            }
            val resume = PracticeHub.resume(rows, campaigns)
            val campaign = campaigns.firstOrNull { it.id == resume?.campaignId }
            if (campaign != null && resume != null) item {
                HubHeading("Continue")
                Column(Modifier.testTag("practice-continue").fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card).clickable { target = PracticeTarget(campaign = campaign, sceneIndex = resume.sceneIndex) }.padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                    Text(campaign.title, style = Type.title.toTextStyle(), color = ds.ink)
                    Text("Scene ${resume.sceneIndex + 1} of ${campaign.scenes.size} · ${campaign.scenes[resume.sceneIndex].title}", style = Type.footnote.toTextStyle(), color = ds.inkSoft)
                    SceneStars(campaign, rows)
                }
            }
        } else item {
            if (failed) { Text("Could not load Practice.", color = ds.ink); HubButton("Try again", onRetry) }
            else CircularProgressIndicator()
        }
        item { HubHeading("Campaigns · ${campaigns.size} stories") }
        items(campaigns, key = { "c-${it.id}" }) { c ->
            PictureStory(PracticeHub.room(c.id, c.scenes.first().id), c.title, "${c.level} · Campaign · ${c.scenes.size} scenes", "",
                onClick = { target = PracticeTarget(campaign = c, sceneIndex = PracticeHub.nextScene(c, rows)) }) {
                if (data != null) SceneStars(c, rows)
            }
        }
        // Same entitlement entry point as the Hector tab; no prices or trial promises invented here.
        if (showHector) item {
            val context = LocalContext.current
            val face by produceState<ImageBitmap?>(null) { value = withContext(Dispatchers.IO) { loadAsset(context, "firstrun/hector-happy.webp") } }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.hero).clickable(onClick = onHector).padding(Space.s4), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                face?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.size(Space.s12)) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                    Text("Practice speaking with Hector · Pro", style = Type.headline.toTextStyle(), color = ds.onHero)
                    Text("A voice tutor that remembers your level and weak spots. Part of Alphonso Pro.", style = Type.caption.toTextStyle(), color = ds.onHeroSoft)
                }
            }
        }
        item {
            HubHeading("Say the picture")
            Column(Modifier.testTag("practice-say-picture").fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card).clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onSayPicture).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                Text("Say the picture", style = Type.headline.toTextStyle(), color = ds.ink)
                Text("See a picture and say the word. A miss shows you the word and how it sounds.", style = Type.caption.toTextStyle(), color = ds.inkSoft)
            }
        }
        item {
            HubHeading("Say it right")
            Column(Modifier.testTag("practice-say-it-right").fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card).clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onSayItRight).padding(Space.s4), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                Text("Say it right", style = Type.headline.toTextStyle(), color = ds.ink)
                Text("Hear a word you have learned, say it, and find out how clearly you were understood. A miss teaches, it never punishes.", style = Type.caption.toTextStyle(), color = ds.inkSoft)
            }
        }
        item {
            HubHeading("Scenarios")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                PracticeHub.levels.forEach { l -> HubChoiceChip(l, level == l, { level = l }, Modifier.testTag("practice-level-$l")) }
            }
        }
        items(PracticeHub.filtered(scenarios, level).chunked(columns)) { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                row.forEach { scenario ->
                    Box(Modifier.weight(1f)) {
                        PictureStory(scenario.id, scenario.title, scenario.level, "", onClick = { target = PracticeTarget(scenario = scenario) }, compact = true) {
                            if (data != null) PracticeStars(PracticeHub.stars(rows, "scenario", scenario.id))
                        }
                    }
                }
                if (row.size < columns) Spacer(Modifier.weight(1f))
            }
        }
    }
    target?.let { t ->
        ModalBottomSheet(onDismissRequest = { target = null }, containerColor = ds.surface, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            LazyColumn(Modifier.testTag("practice-pre-call"), contentPadding = PaddingValues(Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.s3)) {
                item { TextButton(onClick = { target = null }) { Text("Close") } }
                item { Text(t.title, style = Type.questionSmall.toTextStyle(), color = ds.ink) }
                item { Text(t.detail, style = Type.caption.toTextStyle(), color = ds.inkSoft); Text(t.persona, style = Type.footnote.toTextStyle(), color = ds.ink) }
                item {
                    Text("${t.persona.substringBefore(',')} starts the ${if (mode == "call") "call" else "chat"}:", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                    Text(t.opener, style = Type.body.toTextStyle(), color = ds.ink, modifier = Modifier.fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.bubble)).padding(Space.s3))
                }
                item { HubHeading("How to earn stars") }
                items(PracticeHub.starRules(chat = mode == "chat").withIndex().toList()) { (i, line) ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.s3)) { PracticeStars(i + 1); Text(line, style = Type.caption.toTextStyle(), color = ds.ink, modifier = Modifier.weight(1f)) }
                }
                item {
                    if (columns == 1) Column {
                        HubChoiceChip("Call (speak)", mode == "call", { mode = "call" })
                        HubChoiceChip("Chat (type)", mode == "chat", { mode = "chat" })
                    } else Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                        HubChoiceChip("Call (speak)", mode == "call", { mode = "call" }, Modifier.weight(1f))
                        HubChoiceChip("Chat (type)", mode == "chat", { mode = "chat" }, Modifier.weight(1f))
                    }
                    HubButton(if (mode == "call") "Start the call" else "Start the chat") {
                        target = null
                        if (t.scenario != null) onOpenScenario(t.scenario.id, mode) else onOpenCampaign(t.campaign!!.id, t.sceneIndex, mode)
                    }
                }
            }
        }
    }
}

@Composable private fun HubHeading(text: String) {
    Text(text, style = Type.title.toTextStyle(), color = LocalAlphonsoTokens.current.ink, modifier = Modifier.semantics { heading() })
}
@Composable internal fun HubButton(text: String, onClick: () -> Unit) { HubAction(text, false, onClick) }
@Composable internal fun HubSecondaryButton(text: String, onClick: () -> Unit) { HubAction(text, true, onClick) }
@Composable private fun HubAction(text: String, secondary: Boolean, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Button(onClick, border = if (secondary) BorderStroke(AlphonsoTokens.Edge.pressedSliver, ds.line) else null, modifier = Modifier.fillMaxWidth().heightIn(min = Space.minTouch), shape = RoundedCornerShape(AlphonsoTokens.Radius.control), colors = ButtonDefaults.buttonColors(containerColor = if (secondary) ds.card else ds.action, contentColor = if (secondary) ds.brand else ds.onAction), contentPadding = PaddingValues(Space.s3)) {
        Text(text, style = Type.answer.toTextStyle())
    }
}
@Composable internal fun PracticeStars(n: Int, prominent: Boolean = false) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.clearAndSetSemantics { contentDescription = PracticeHub.starLabel(n) }, horizontalArrangement = Arrangement.spacedBy(Space.s1)) {
        repeat(3) { i -> Icon(if (i < n) Icons.Filled.Star else Icons.Outlined.StarBorder, null, tint = if (i < n) ds.xp else ds.inkFaint, modifier = Modifier.size(if (prominent) Space.s12 else Space.s5)) }
    }
}
@Composable private fun SceneStars(c: Campaign, rows: List<PracticeStarRow>) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
        c.scenes.forEachIndexed { i, scene ->
            Column(Modifier.clearAndSetSemantics { contentDescription = "Scene ${i + 1}, ${scene.title}, ${PracticeHub.starLabel(PracticeHub.stars(rows, "scene", "${c.id}/${scene.id}"))}" }, verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                PracticeRoomThumbnail(PracticeHub.room(c.id, scene.id))
                PracticeStars(PracticeHub.stars(rows, "scene", "${c.id}/${scene.id}"))
            }
        }
    }
}
@Composable private fun PictureStory(room: String, title: String, detail: String, blurb: String, onClick: () -> Unit, compact: Boolean = false, footer: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, room) { value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/$room.webp") } }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.bubble)).background(ds.hero).clickable(onClick = onClick)) {
        image?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        Column {
            Spacer(Modifier.height(Space.s12))
            Column(Modifier.fillMaxWidth().background(ds.hero).padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                Text(detail, style = Type.overline.toTextStyle(), color = ds.onHeroKick)
                Text(title, style = (if (compact) Type.footnote else Type.questionSmall).toTextStyle(), color = ds.onHero)
                if (blurb.isNotEmpty()) Text(blurb, style = Type.footnote.toTextStyle(), color = ds.onHeroSoft)
                footer()
            }
        }
    }
}
/**
 * The chat-mode reply bar (Round 13, mock 2b): one docked glass row with a pill field ("Your reply", multiline up to 4 lines) and a
 * round gold send button (arrow up). Send is dimmed and inert while the field is empty or a reply is pending
 * ([PracticeHub.canSendReply]); the focused field takes the choice border. Chat mode is typed only, so there is no mic.
 */
@Composable internal fun PracticeTextComposer(vm: BaseConversationViewModel) {
    var input by remember { mutableStateOf("") }
    val state by vm.state.collectAsState()
    val canSend = PracticeHub.canSendReply(input, pending = state.phase != ConversationPhase.IDLE)
    PracticeReplyBar(input, { input = it }, canSend) { vm.sendText(input); input = "" }
}

/** The bar itself, stateless: [canSend] is [PracticeHub.canSendReply] of the typed text and the conversation phase. */
@Composable internal fun PracticeReplyBar(input: String, onInput: (String) -> Unit, canSend: Boolean, onSend: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    val body = Type.body.toTextStyle()
    Row(
        Modifier.fillMaxWidth().background(ds.card.copy(alpha = 0.82f)).padding(horizontal = Space.s4, vertical = Space.s2),
        verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.s2),
    ) {
        BasicTextField(
            value = input, onValueChange = onInput, maxLines = 4, textStyle = body.copy(color = ds.ink), cursorBrush = SolidColor(ds.choice),
            modifier = Modifier.weight(1f).heightIn(min = Space.minTouch).onFocusChanged { focused = it.isFocused }
                .clip(shape).background(ds.card).border(2.dp, if (focused) ds.choice else ds.line, shape)
                .padding(horizontal = Space.s4, vertical = Space.s3)
                .semantics { contentDescription = if (input.isEmpty()) "Your reply" else "Your reply, $input" },
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (input.isEmpty()) Text("Your reply", style = body, color = ds.inkFaint)
                    inner()
                }
            },
        )
        Box(
            Modifier.size(Space.minTouch).alpha(if (canSend) 1f else 0.4f).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(ds.actionHi, ds.action)))
                .clickable(enabled = canSend, role = androidx.compose.ui.semantics.Role.Button, onClickLabel = "Send", onClick = onSend)
                .semantics { contentDescription = "Send" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.ArrowUpward, null, tint = ds.onAction) }
    }
}

/** A star still to earn on a call that earned none: a dashed gold outline, not a dead grey one. */
@Composable private fun EmptyStarOutline(size: androidx.compose.ui.unit.Dp) {
    val edge = LocalAlphonsoTokens.current.actionEdge
    Canvas(Modifier.size(size)) {
        val s = this.size.minDimension / 24f
        val points = listOf(12f to 2.8f, 14.8f to 8.7f, 21.2f to 9.6f, 16.5f to 14.1f, 17.7f to 20.5f, 12f to 17.4f, 6.3f to 20.5f, 7.5f to 14.1f, 2.8f to 9.6f, 9.2f to 8.7f)
        val path = Path().apply {
            points.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x * s, y * s) else lineTo(x * s, y * s) }
            close()
        }
        val dash = 2.6f * s
        drawPath(path, edge.copy(alpha = 0.75f), alpha = 1f, style = Stroke(width = 1.4f * s, join = androidx.compose.ui.graphics.StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash))))
    }
}

/** A call that came back without a score (offline): the learner stays on the scene, is told why, and can try it again. */
@Composable internal fun PracticeUnscoredScreen(retry: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Column(Modifier.testTag("practice-unscored").fillMaxSize().background(ds.surface).padding(Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.s4, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(PracticeHub.UNSCORED_NOTICE, style = Type.headline.toTextStyle(), color = ds.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        HubButton("Try again", retry)
    }
}

/** The 0-star hint card: the hint in a gold-tint card with a meter of replies given of replies needed. */
@Composable private fun ZeroStarHint(result: PracticeResult) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(Modifier.fillMaxWidth().clip(shape).background(ds.actionTint).border(2.dp, ds.line, shape).padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        Text(result.hint, style = Type.footnote.toTextStyle(), color = ds.ink, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        result.repliesMeter?.let { meter ->
            Row(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "${meter.given} of ${meter.needed} replies" }, horizontalArrangement = Arrangement.spacedBy(Space.s1 + Space.s1 / 2)) {
                repeat(meter.needed) { i ->
                    val seg = RoundedCornerShape(AlphonsoTokens.Radius.pill)
                    Box(Modifier.weight(1f).height(Space.s2).clip(seg).background(if (i < meter.given) ds.action else ds.sunk).then(if (i < meter.given) Modifier else Modifier.border(1.5.dp, ds.line, seg)))
                }
            }
        }
    }
}

/**
 * The result screen (Practice hub v3 plus the 0-star refinement). [context] picks the buttons ([PracticeResultButtons]);
 * [forward] is the right-hand button: Next scene, Finish campaign or Done.
 */
@Composable internal fun PracticeResultScreen(
    result: PracticeResult, room: String, course: String, seconds: Int, slip: Pair<String, String>?, context: PracticeResultContext, retry: () -> Unit, forward: () -> Unit,
    /** The call recap: it takes the slip's slot while pending or ready; with none (a short call, offline, an AI error) the slip shows as before. */
    recap: CallRecapController.Ui? = null, onSpeakPhrase: (String) -> Unit = {}, onReviewRecap: () -> Unit = {}, onOpenMemory: () -> Unit = {},
) {
    val ds = LocalAlphonsoTokens.current
    val largeText = androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.3f
    val buttons = result.buttons(context)
    LazyColumn(Modifier.testTag("practice-result").fillMaxSize().background(ds.surface), contentPadding = PaddingValues(Space.gutter), verticalArrangement = Arrangement.spacedBy(Space.s3)) {
        item { LessonRoom(room, if (result.stars >= 2) LessonExpression.HAPPY else LessonExpression.NEUTRAL, Space.s12 * 6, Space.s12 * 5) }
        item {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                if (result.displayedStars == 0) Row(Modifier.clearAndSetSemantics { contentDescription = PracticeHub.starLabel(0) }, horizontalArrangement = Arrangement.spacedBy(Space.s1)) { repeat(3) { EmptyStarOutline(Space.s12) } }
                else PracticeStars(result.displayedStars, prominent = true)
            }
        }
        item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { HubHeading(result.headline(course)) } }
        item {
            if (result.displayedStars == 0) ZeroStarHint(result)
            else Text(result.hint + if (result.bestBefore > 0 && result.bestAfter > result.bestBefore) " A new best for this room." else "", style = Type.footnote.toTextStyle(), color = ds.inkSoft, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        item {
            val stats = listOf("${result.rightReplies}/${result.replies}" to "replies right", CallClock.format(seconds) to "on the call", "${result.replies - result.shortReplies}/${result.replies}" to "full sentences")
            if (largeText) Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                stats.forEach { (value, label) -> ResultStat(value, label) }
            } else Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                stats.forEach { (value, label) -> Box(Modifier.weight(1f)) { ResultStat(value, label) } }
            }
        }
        val recapShowing = recap != null && recap.status != CallRecapController.Status.OFF
        if (recapShowing) item { RecapSection(recap!!, onSpeakPhrase, onReviewRecap, onOpenMemory) }
        val shownSlip = if (recapShowing) null else result.slipToShow(slip)
        if (shownSlip != null) item {
            val slipShape = RoundedCornerShape(AlphonsoTokens.Radius.control)
            Column(Modifier.fillMaxWidth().clip(slipShape).background(ds.card).border(2.dp, ds.line, slipShape).padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                Text("Your slip", style = Type.caption.toTextStyle(), color = ds.inkSoft)
                Text(shownSlip.first, textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough, style = Type.footnote.toTextStyle(), color = ds.wrongInk)
                Text("Alphonso: ${shownSlip.second}", style = Type.footnote.toTextStyle(), color = ds.rightInk)
            }
        }
        item {
            val retryButton = buttons.retry
            val face: @Composable (PracticeResultButton, () -> Unit) -> Unit = { b, click -> if (b.gold) HubButton(b.label, click) else HubSecondaryButton(b.label, click) }
            if (largeText || retryButton == null) Column(verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                if (retryButton != null) face(retryButton, retry)
                face(buttons.forward, forward)
            } else Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                Box(Modifier.weight(1f)) { face(retryButton, retry) }
                Box(Modifier.weight(1f)) { face(buttons.forward, forward) }
            }
        }
    }
}

@Composable private fun PracticeRoomThumbnail(room: String) {
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, room) { value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/$room.webp") } }
    Box(Modifier.size(Space.s12).clip(RoundedCornerShape(AlphonsoTokens.Radius.key))) {
        image?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

@Composable private fun ResultStat(value: String, label: String) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Column(Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape).padding(Space.s2), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = Type.numeral.toTextStyle(), color = ds.ink)
        Text(label, style = Type.caption.toTextStyle(), color = ds.inkSoft)
    }
}

@Composable private fun HubChoiceChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    FilterChip(selected, onClick, modifier = modifier, label = { Text(label, style = Type.footnote.toTextStyle()) },
        border = BorderStroke(AlphonsoTokens.Edge.pressedSliver, if (selected) ds.brand else ds.line),
        colors = FilterChipDefaults.filterChipColors(containerColor = ds.card, labelColor = ds.inkSoft, selectedContainerColor = ds.choiceTint, selectedLabelColor = ds.brand))
}
