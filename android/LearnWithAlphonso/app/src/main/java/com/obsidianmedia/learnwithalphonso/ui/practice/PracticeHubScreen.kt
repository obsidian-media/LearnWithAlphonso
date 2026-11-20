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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.ui.text.style.TextAlign
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
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

internal data class PracticeTarget(val scenario: Scenario? = null, val campaign: Campaign? = null, val sceneIndex: Int = 0) {
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
            Column(verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Practice", style = Type.display.toTextStyle(), color = ds.ink, modifier = Modifier.weight(1f, fill = false).semantics { heading() })
                    if (data != null) {
                        val tally = PracticeHub.tally(rows, scenarios, campaigns)
                        Text("★ ${tally.first} / ${tally.second}", style = Type.caption.toTextStyle(), color = ds.xpText,
                            modifier = Modifier.clip(CircleShape).background(ds.xpTint).padding(horizontal = Space.s3, vertical = Space.s1)
                                .clearAndSetSemantics { contentDescription = "${tally.first} of ${tally.second} stars earned" })
                    }
                }
                Text(greeting, style = Type.caption.toTextStyle(), color = ds.inkSoft)
            }
        }
        if (data != null) {
            // The call cards: where the learner left off, then Today's picks (the core's rule).
            item {
                val cards = heroCards(data, scenarios, campaigns)
                HeroCarousel(cards, onCall = { mode = "call"; target = it.target }, onChat = { mode = "chat"; target = it.target })
            }
        } else item {
            if (failed) { Text("Could not load Practice.", color = ds.ink); HubButton("Try again", onRetry) }
            else CircularProgressIndicator()
        }
        item { HubHeading("Conversations") }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                PracticeHub.levels.forEach { l -> HubChoiceChip(l, level == l, { level = l }, Modifier.testTag("practice-level-$l")) }
            }
        }
        items(PracticeHub.filtered(scenarios, level).chunked(columns)) { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                row.forEach { scenario ->
                    val n = PracticeHub.stars(rows, "scenario", scenario.id)
                    Box(Modifier.weight(1f)) {
                        PracticeTile(scenario.id, scenario.level, scenario.title, stars = if (data != null) n else null, mastered = n >= 3,
                            modifier = Modifier.testTag("practice-tile-${scenario.id}"), onClick = { target = PracticeTarget(scenario = scenario) })
                    }
                }
                if (row.size < columns) Spacer(Modifier.weight(1f))
            }
        }
        // Campaigns: a rail, each with its own room, how far in, and a dot per scene. The scene stars are in the campaign's detail.
        item { HubHeading("Campaigns · ${campaigns.size} stories") }
        item {
            LazyRow(Modifier.testTag("practice-campaign-rail").fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                items(campaigns, key = { "c-${it.id}" }) { c ->
                    PracticeTile(PracticeHub.room(c.id, c.scenes.first().id), "${c.level} · ${c.scenes.size} scenes", c.title, stars = null, mastered = false,
                        progress = if (data != null) PracticeHub.progress(c, rows) else null,
                        modifier = Modifier.width(Space.s12 * 3 + Space.s4).testTag("practice-campaign-${c.id}"),
                        onClick = { target = PracticeTarget(campaign = c, sceneIndex = PracticeHub.nextScene(c, rows)) })
                }
            }
        }
        item { HubHeading("Quick practice") }
        item {
            DrillCard("Say the picture", "See a picture and say the word. A miss shows you the word and how it sounds.", "practice-say-picture", onSayPicture) {
                Column(Modifier.fillMaxSize().background(ds.choiceTint).padding(Space.s2), verticalArrangement = Arrangement.spacedBy(Space.s1), horizontalAlignment = Alignment.CenterHorizontally) {
                    val context = LocalContext.current
                    listOf(listOf("hot_beverage", "airplane"), listOf("stethoscope", "spaghetti")).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(Space.s1)) {
                            pair.forEach { name ->
                                val icon by produceState<ImageBitmap?>(null, name) { value = withContext(Dispatchers.IO) { loadAsset(context, "icons3d/$name.png") } }
                                Box(Modifier.size(Space.s8)) { icon?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize()) } }
                            }
                        }
                    }
                }
            }
        }
        item {
            DrillCard("Say it right", "Hear a word you have learned, say it, and find out how clearly you were understood. A miss teaches, it never punishes.", "practice-say-it-right", onSayItRight) {
                Box(Modifier.fillMaxSize().background(ds.rightTint), contentAlignment = Alignment.Center) { Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = ds.rightEdge, modifier = Modifier.size(Space.s12)) }
            }
        }
        // Hector: Pro's one feature, quiet and last; same entitlement entry point as the Hector tab.
        if (showHector) item {
            val context = LocalContext.current
            val face by produceState<ImageBitmap?>(null) { value = withContext(Dispatchers.IO) { loadAsset(context, "firstrun/hector-happy.webp") } }
            Row(Modifier.testTag("practice-hector-card").fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.hero).clickable(role = Role.Button, onClick = onHector).padding(Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s3)) {
                face?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.size(Space.s12 + Space.s3)) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                    Text("Practice speaking with Hector · Pro", style = Type.headline.toTextStyle(), color = ds.onHero)
                    Text("A voice tutor that remembers your level and weak spots. Part of Alphonso Pro.", style = Type.caption.toTextStyle(), color = ds.onHeroSoft)
                }
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
                if (t.campaign != null) item {
                    Column(Modifier.testTag("practice-campaign-scenes").fillMaxWidth().background(ds.card, RoundedCornerShape(AlphonsoTokens.Radius.control)).padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
                        Text("Scenes in this campaign", style = Type.overline.toTextStyle(), color = ds.ink)
                        t.campaign.scenes.forEachIndexed { i, scene ->
                            val n = PracticeHub.stars(rows, "scene", "${t.campaign.id}/${scene.id}")
                            Row(Modifier.clearAndSetSemantics { contentDescription = "Scene ${i + 1}, ${scene.title}, ${PracticeHub.starLabel(n)}" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                                PracticeRoomThumbnail(PracticeHub.room(t.campaign.id, scene.id))
                                Text("${i + 1}. ${scene.title}", style = Type.caption.toTextStyle(), color = ds.ink, modifier = Modifier.weight(1f))
                                PracticeStars(n)
                            }
                        }
                    }
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
/** One call card: a scenario picked for the learner, or the campaign scene they were in the middle of. */
internal data class PracticeHeroCard(val id: String, val kicker: String, val title: String, val subtitle: String, val reason: String, val room: String, val stars: Int, val isContinue: Boolean, val scenario: Scenario? = null, val campaign: Campaign? = null, val sceneIndex: Int = 0)

/** Where the learner left off (if anywhere), then Today's picks, three in all (the core's rule). */
internal fun heroCards(data: PracticeHubData, scenarios: List<Scenario>, campaigns: List<Campaign>): List<PracticeHeroCard> {
    val rows = data.stars
    val out = mutableListOf<PracticeHeroCard>()
    val resume = PracticeHub.resume(rows, campaigns)
    val c = campaigns.firstOrNull { it.id == resume?.campaignId }
    if (resume != null && c != null) {
        val scene = c.scenes[resume.sceneIndex]
        out += PracticeHeroCard("continue:${c.id}:${resume.sceneIndex}", "Continue", scene.title, "${c.title} · Scene ${resume.sceneIndex + 1} of ${c.scenes.size}", "Pick up where you left off",
            PracticeHub.room(c.id, scene.id), PracticeHub.stars(rows, "scene", "${c.id}/${scene.id}"), isContinue = true, campaign = c, sceneIndex = resume.sceneIndex)
    }
    var first = true
    for (pick in PracticeHub.picks(data, scenarios).take((PracticeHub.HERO_CARDS - out.size).coerceAtLeast(0))) {
        val s = scenarios.firstOrNull { it.id == pick.scenarioId } ?: continue
        out += PracticeHeroCard("pick:${s.id}", if (first) "Today's pick" else "Also for you", s.title, s.level, PracticeHub.reason(pick, s.level, first),
            s.id, PracticeHub.stars(rows, "scenario", s.id), isContinue = false, scenario = s)
        first = false
    }
    return out
}

internal val PracticeHeroCard.target get() = PracticeTarget(scenario = scenario, campaign = campaign, sceneIndex = sceneIndex)

/** The swipeable call cards with page dots. The dots are buttons, so it works without a swipe (TalkBack, switch access); it never advances by itself. */
@Composable
internal fun HeroCarousel(cards: List<PracticeHeroCard>, onCall: (PracticeHeroCard) -> Unit, onChat: (PracticeHeroCard) -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val pager = rememberPagerState(pageCount = { cards.size })
    val scope = rememberCoroutineScope()
    val reduce = rememberReduceMotion()
    Column(Modifier.testTag("practice-hero").fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
        HorizontalPager(pager, Modifier.fillMaxWidth(), contentPadding = PaddingValues(end = if (cards.size > 1) Space.s8 else 0.dp), pageSpacing = Space.s3, verticalAlignment = Alignment.Top) { i ->
            HeroCardView(cards[i], i + 1, cards.size, { onCall(cards[i]) }, { onChat(cards[i]) }, Modifier.testTag("practice-hero-card-$i"))
        }
        if (cards.size > 1) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            cards.indices.forEach { i ->
                val on = pager.currentPage == i
                Box(
                    Modifier.size(Space.minTouch).testTag("practice-hero-dot-$i")
                        .clickable(role = Role.Button, onClickLabel = "Show call ${i + 1} of ${cards.size}") { scope.launch { if (reduce) pager.scrollToPage(i) else pager.animateScrollToPage(i) } }
                        .semantics { contentDescription = "Show call ${i + 1} of ${cards.size}"; selected = on },
                    contentAlignment = Alignment.Center,
                ) { Box(Modifier.size(width = if (on) Space.s5 else Space.s2 - 2.dp, height = Space.s2 - 2.dp).clip(CircleShape).background(if (on) ds.choice else ds.line)) }
            }
        }
    }
}

/** The incoming-call treatment: the scene behind, the full Alphonso, a "ready" cue and the round Call / Chat answers. */
@Composable
private fun HeroCardView(card: PracticeHeroCard, position: Int, count: Int, onCall: () -> Unit, onChat: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val room by produceState<ImageBitmap?>(null, card.room) { value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/${card.room}.webp") } }
    val figure by produceState<ImageBitmap?>(null) { value = withContext(Dispatchers.IO) { loadAsset(context, "lesson/talk.webp") } }
    val bigText = androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.3f
    Box(modifier.fillMaxWidth().heightIn(min = Space.s12 * 7).clip(RoundedCornerShape(AlphonsoTokens.Radius.sheet)).background(ds.hero).semantics { contentDescription = "$position of $count: ${card.title}" }) {
        room?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(ds.heroB.copy(alpha = 0.6f), ds.heroB.copy(alpha = 0.1f), ds.heroB.copy(alpha = 0.15f), ds.heroB.copy(alpha = 0.85f), ds.heroB))))
        Column(Modifier.fillMaxWidth().padding(Space.s4), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Column(Modifier.semantics(mergeDescendants = true) {}, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s1)) {
                Text("${card.kicker} · $position of $count", style = Type.overline.toTextStyle(), color = ds.onHeroKick, textAlign = TextAlign.Center)
                Text(card.title, style = Type.questionSmall.toTextStyle(), color = ds.onHero, textAlign = TextAlign.Center)
                Row(horizontalArrangement = Arrangement.spacedBy(Space.s2), verticalAlignment = Alignment.CenterVertically) {
                    Text(card.subtitle, style = Type.caption.toTextStyle(), color = ds.onHeroSoft, textAlign = TextAlign.Center, modifier = Modifier.weight(1f, fill = false))
                    PracticeStars(card.stars)
                }
                Text(card.reason, style = Type.caption.toTextStyle(), color = ds.onHero, textAlign = TextAlign.Center,
                    modifier = Modifier.clip(CircleShape).background(ds.onHero.copy(alpha = 0.15f)).padding(horizontal = Space.s3, vertical = Space.s1))
            }
            if (!bigText) figure?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.height(Space.s12 * 3)) } ?: Spacer(Modifier.height(Space.s12 * 3))
            Text("Alphonso is ready", style = Type.caption.toTextStyle(), color = ds.callMint, modifier = Modifier.clearAndSetSemantics {})
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s8), verticalAlignment = Alignment.Top) {
                HeroAnswer("Call", Icons.Filled.Mic, gold = true, label = "Call Alphonso: ${card.title}", onClick = onCall, modifier = if (card.isContinue) Modifier.testTag("practice-continue") else Modifier.testTag("practice-hero-call-${position - 1}"))
                HeroAnswer("Chat", Icons.Filled.ChatBubble, gold = false, label = "Chat with Alphonso: ${card.title}", onClick = onChat, modifier = Modifier.testTag("practice-hero-chat-${position - 1}"))
            }
        }
    }
}

@Composable
private fun HeroAnswer(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, gold: Boolean, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val ds = LocalAlphonsoTokens.current
    val d = Space.s12 + if (gold) Space.s3 else Space.s1
    Column(modifier.clickable(role = Role.Button, onClick = onClick).clearAndSetSemantics { contentDescription = label }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.s1)) {
        Box(Modifier.size(d).clip(CircleShape).background(if (gold) ds.action else ds.onHero.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = if (gold) ds.onAction else ds.onHero, modifier = Modifier.size(Space.s6))
        }
        Text(title, style = Type.caption.toTextStyle(), color = ds.onHero)
    }
}

/** A scenario or campaign in its painted room: level, title, stars (or progress dots) and a gold Mastered badge at three stars. */
@Composable
internal fun PracticeTile(room: String, overline: String, title: String, stars: Int?, mastered: Boolean, modifier: Modifier = Modifier, progress: PracticeCampaignProgress? = null, onClick: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val image by produceState<ImageBitmap?>(null, room) { value = withContext(Dispatchers.IO) { loadAsset(context, "scenes/$room.webp") } }
    Box(modifier.fillMaxWidth().heightIn(min = Space.s12 * 3).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.hero).clickable(role = Role.Button, onClick = onClick)) {
        image?.let { Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0.3f to ds.heroB.copy(alpha = 0f), 0.62f to ds.heroB.copy(alpha = 0.78f), 1f to ds.heroB.copy(alpha = 0.92f))))
        Column(Modifier.fillMaxWidth().padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (mastered) Row(Modifier.clip(CircleShape).background(ds.action).padding(horizontal = Space.s2, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Icon(Icons.Filled.Check, contentDescription = null, tint = ds.onAction, modifier = Modifier.size(12.dp))
                    Text("Mastered", style = Type.overline.toTextStyle(), color = ds.onAction)
                }
            }
            Spacer(Modifier.height(Space.s12))
            Text(overline, style = Type.overline.toTextStyle(), color = ds.onHeroKick)
            Text(title, style = Type.footnote.toTextStyle(), color = ds.onHero)
            if (stars != null) PracticeStars(stars)
            if (progress != null) Row(Modifier.clearAndSetSemantics { contentDescription = "${progress.done} of ${progress.total} scenes done" }, horizontalArrangement = Arrangement.spacedBy(Space.s2), verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) { progress.scenes.forEach { done -> Box(Modifier.size(width = Space.s3, height = Space.s1).clip(CircleShape).background(if (done) ds.action else ds.onHero.copy(alpha = 0.35f))) } }
                Text(PracticeHub.progressLabel(progress), style = Type.overline.toTextStyle(), color = ds.onHeroSoft)
            }
        }
    }
}

/** A featured drill: its own thumbnail, title, line and a Start button. The whole card is one button. */
@Composable
private fun DrillCard(title: String, detail: String, tag: String, onClick: () -> Unit, thumb: @Composable () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    Row(Modifier.testTag(tag).fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.card).border(2.dp, ds.line, RoundedCornerShape(AlphonsoTokens.Radius.control)).clickable(role = Role.Button, onClick = onClick)) {
        Box(Modifier.width(Space.s12 * 2).fillMaxHeight().clearAndSetSemantics {}) { thumb() }
        Column(Modifier.weight(1f).padding(Space.s3), verticalArrangement = Arrangement.spacedBy(Space.s1)) {
            Text(title, style = Type.headline.toTextStyle(), color = ds.ink)
            Text(detail, style = Type.caption.toTextStyle(), color = ds.inkSoft)
            Text("Start", style = Type.caption.toTextStyle(), color = ds.onChoice, modifier = Modifier.padding(top = Space.s1).clip(CircleShape).background(ds.choice).padding(horizontal = Space.s3, vertical = Space.s2))
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
