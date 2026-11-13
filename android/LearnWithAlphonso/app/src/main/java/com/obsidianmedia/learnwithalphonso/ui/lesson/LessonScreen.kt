package com.obsidianmedia.learnwithalphonso.ui.lesson

import com.obsidianmedia.learnwithalphonso.audio.rememberHaptics
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.R
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy
import com.obsidianmedia.learnwithalphonso.ui.explain.ExplainInMyLanguage
import com.obsidianmedia.learnwithalphonso.core.logic.LessonFinishCopy
import com.obsidianmedia.learnwithalphonso.core.logic.LessonStage
import com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming
import com.obsidianmedia.learnwithalphonso.core.logic.LessonXp
import com.obsidianmedia.learnwithalphonso.core.logic.OutOfHeartsModel
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPermission
import com.obsidianmedia.learnwithalphonso.core.logic.ReminderPromptPolicy
import com.obsidianmedia.learnwithalphonso.core.logic.UnitRooms
import com.obsidianmedia.learnwithalphonso.core.logic.VocabItem
import com.obsidianmedia.learnwithalphonso.core.logic.correctAnswerText
import com.obsidianmedia.learnwithalphonso.core.logic.formatElapsed
import com.obsidianmedia.learnwithalphonso.core.logic.promptText
import com.obsidianmedia.learnwithalphonso.core.logic.typeKey
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoPrimaryButton
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoRadius
import com.obsidianmedia.learnwithalphonso.ui.components.AlphonsoSectionHeader
import com.obsidianmedia.learnwithalphonso.ui.learn.LeagueTierPalette
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoColor
import com.obsidianmedia.learnwithalphonso.ui.word.SaveWordHost
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun LessonScreen(container: AppContainer, course: Course, lessonId: String, onExit: () -> Unit, onReviewInstead: () -> Unit = onExit) {
    val palette = AlphonsoColor.palette
    val found = container.content.findLesson(lessonId, course)
    if (found == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Lesson not found", color = palette.ink) }
        return
    }
    val vm: LessonViewModel = viewModel(key = "lesson-$lessonId") {
        LessonViewModel(
            lesson = found.second, course = course, content = container.content, client = container.progressClient,
            translation = container.translationGrading, syncStore = container.syncStore,
            isConnected = { container.connectivity.isConnected.value },
            lastKnownTier = { container.tierCache.lastKnownTier },
            rememberTier = { container.tierCache.lastKnownTier = it },
            hasAiConsent = { container.aiConsent.isGranted },
            ownerUserId = { container.session.userId },
            isPro = { container.entitlements.isPro },
        )
    }
    val state by vm.state.collectAsState()
    LaunchedEffect(vm) { vm.onScreenShown() }
    // The lesson's sound effects and haptics: each moment arrives once, as an event, so a recomposition cannot repeat it.
    val haptics = rememberHaptics()
    // Each moment's cues run in this screen's scope: leaving the lesson cancels any still to come (XP, achievement).
    LaunchedEffect(vm) { vm.soundEffects.collect { request -> launch { container.soundEffects.play(request, haptics) } } }
    // The lesson's time counts only while the app is in front.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, vm) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> vm.onAppVisible(false)
                Lifecycle.Event.ON_START -> vm.onAppVisible(true)
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val finished = state.phase as? LessonPhase.Finished
    LaunchedEffect(finished?.result?.progress?.lastActiveDate, finished != null) {
        if (finished != null) {
            // Reschedule today's streak reminder. Never asks for permission here: a cold dialog over the first
            // celebration gets permanent refusals. The ask lives behind the reminder card's "Remind me".
            container.reminders.onLessonFinished(finished.result.progress.lastActiveDate)
        }
    }
    var showReminderCard by remember { mutableStateOf(false) }
    LaunchedEffect(finished != null) {
        if (finished == null) return@LaunchedEffect
        val permission = container.notificationPermission.status()
        val cheap = permission == ReminderPermission.UNDETERMINED && container.reminderPromptStore.load().dismissals < ReminderPromptPolicy.MAX_DISMISSALS
        if (!cheap) return@LaunchedEffect
        val completed = runCatching { container.progressClient.fetchCompletedLessonIds(course.code) }.getOrDefault(emptyList()).toSet().size
        showReminderCard = ReminderPromptPolicy.shouldShowCard(completed, permission, container.reminderPromptStore.load(), System.currentTimeMillis())
    }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val themeId by container.themeManager.theme.collectAsState()
    val paletteId by container.themeManager.palette.collectAsState()
    val unitRooms = remember { runCatching { UnitRooms.fromJson(context.assets.open("content/unit-rooms.json").bufferedReader().use { it.readText() }) }.getOrDefault(emptyMap()) }
    val timing = remember { runCatching { LessonTiming.fromJson(context.assets.open("content/lesson-timing.json").bufferedReader().use { it.readText() }) }.getOrNull() }
    val unit = container.content.findLesson(state.lesson.id, course)?.first
    // The unit's own room from the room map (Alphonso's study by day for a unit it does not know).
    val roomId = LessonStage.roomId(unit?.id, unitRooms)
    val unitIndex = unit?.let { u -> container.content.bundle(course).units.indexOfFirst { it.id == u.id } } ?: -1
    val unitLine = if (unit != null && unitIndex >= 0) "Unit ${unitIndex + 1} · ${unit.title}" else state.lesson.subtitle
    // Hearts for the HUD: null (shown as ∞) for Alphonso Pro.
    val pro = container.entitlements.isPro
    val hearts by produceState<Int?>(if (pro) null else HeartsEconomy.MAX_HEARTS, pro, state.heartsSpent) {
        value = if (pro) null else container.syncStore.lastKnownProgress()?.hearts ?: HeartsEconomy.MAX_HEARTS
    }

    SaveWordHost(container) {
        LessonLightScope(themeId, paletteId) {
            val gate = state.outOfHearts
            val phase = state.phase
            val onStage = gate == null && (phase == LessonPhase.Overview || phase == LessonPhase.Vocab || phase == LessonPhase.Quiz || phase is LessonPhase.Finished)
            Column(Modifier.fillMaxSize().background(lessonSurface())) {
                if (!onStage) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onExit) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.moss) }
                        Text(state.lesson.title, style = MaterialTheme.typography.titleMedium, color = palette.ink)
                    }
                }
                if (gate != null) {
                    OutOfHeartsContent(
                        model = gate, isOnline = container.connectivity.isConnected.collectAsState().value,
                        buying = state.buyingHeart, buyMessage = state.buyMessage,
                        onBuy = vm::buyHeart, onRefillDue = vm::onRefillDue, onReviewInstead = onReviewInstead,
                    )
                } else when (phase) {
                    LessonPhase.Overview -> {
                        val words = vm.vocab
                        val total = state.total
                        // "About N min" from the same rules as the web (lesson-timing.json).
                        val minutes = timing?.estimateMinutes(state.lesson.questions.map { it.typeKey }, words.size) ?: 1
                        val sample = words.take(3).map { it.term.trimEnd('.', '!', '?', '…') }
                        val steps = buildList {
                            if (words.isNotEmpty()) add(LessonStartStep(R.drawable.ds_book, "${words.size} new word${if (words.size == 1) "" else "s"}", sample.joinToString(", ") + if (words.size > sample.size) "…" else ""))
                            add(LessonStartStep(R.drawable.ds_check, "Practice", "$total question${if (total == 1) "" else "s"}: pick, listen, say it back"))
                            add(LessonStartStep(R.drawable.ds_star, "Review", "Anything you miss comes back later"))
                        }
                        LessonStart(
                            roomId, unitLine, state.lesson.title,
                            "About $minutes min · $total question${if (total == 1) "" else "s"} · Up to ${LessonXp.maxXp(total)} XP",
                            steps, hearts, onClose = onExit, onStart = vm::begin,
                        )
                    }
                    LessonPhase.Vocab -> if (androidx.compose.ui.platform.LocalDensity.current.fontScale >= 1.5f) {
                        // At the largest text sizes a fixed card would clip its words, so the words stay one scrolling list.
                        Column {
                            Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp)) { LessonHud(0f, hearts, onExit, onLight = true) }
                            VocabScreen(container, state.lesson, vm.vocab, course, onStart = vm::startPractice)
                        }
                    } else {
                        LessonWordDeck(
                            overline = "Vocabulary \u00B7 ${state.lesson.subtitle}", title = state.lesson.title, items = vm.vocab,
                            hearts = hearts, onClose = onExit, onSpeak = { Speech.get(context).speak(it, course) },
                            image = { VocabImage(it, height = 160.dp) }, onStart = vm::startPractice,
                            extra = { item -> ExplainInMyLanguage(container, ExplainRules.word(item.term, item.example, course.code)) },
                        )
                    }
                    LessonPhase.Quiz -> QuizStage(vm, state, course, container, roomId, hearts, onExit)
                    is LessonPhase.Finished -> {
                        val result = phase.result
                        val correct = state.correctCount
                        val total = state.total
                        val headline = if (total > 0) "${LessonFinishCopy.headline(correct, total)} You got $correct of $total." else LessonFinishCopy.GOOD
                        val tiles = buildList {
                            add(TileKind.XP to "+${result.xpGain}")
                            if (result.progress.streak > 0) add(TileKind.STREAK to "${result.progress.streak}")
                            if (total > 0) add(TileKind.ACCURACY to "${Math.round(correct * 100.0 / total)}%")
                            state.elapsedMs?.let { add(TileKind.TIME to formatElapsed(it)) }
                        }
                        val unlocked = result.newlyUnlocked.mapNotNull { id -> container.content.achievements.firstOrNull { it.id == id } }
                        LessonComplete(
                            roomId = roomId, headline = headline, onHearHeadline = { Speech.get(context).speak(headline, Course.ENGLISH) },
                            tiles = tiles,
                            // The XP lines use the server's own count of right answers, and add up to the award.
                            xpLines = LessonXp.breakdown(result.correct ?: correct, total, result.xpGain),
                            correct = correct, total = total, heartsBonus = result.heartsBonus,
                            achievements = unlocked.map { it.title to it.description }, missed = state.missed,
                            continueLabel = if (vm.nextLessonId != null) "Continue to next lesson" else "Back to Learn",
                            onContinue = { if (vm.nextLessonId != null) vm.continueToNextLesson() else onExit() },
                        ) {
                            if (phase.isLeaguePromotion) LeagueUpCard(result.progress.leagueTier)
                            if (showReminderCard) {
                                LessonReminderCard(
                                    onRemindMe = {
                                        showReminderCard = false
                                        scope.launch {
                                            if (container.notificationPermission.requestIfUndetermined()) {
                                                container.reminders.onLessonFinished(phase.result.progress.lastActiveDate)
                                                container.pushRegistrar.registerIfAuthorized()
                                            }
                                        }
                                    },
                                    onNotNow = {
                                        container.reminderPromptStore.recordNotNow(System.currentTimeMillis())
                                        showReminderCard = false
                                    },
                                )
                            }
                            GeneratedPracticeSection(container, state.lesson.id, course)
                        }
                    }
                    is LessonPhase.QueuedOffline -> OfflineFinishScreen(phase.message, phase.pending.optimisticXpEstimate, state.correctCount, state.total)
                    is LessonPhase.SaveFailed -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
                        Text(phase.message, style = MaterialTheme.typography.titleMedium, color = palette.ink, textAlign = TextAlign.Center)
                        phase.supportLine?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center) }
                        AlphonsoPrimaryButton("Back", onClick = onExit, fullWidth = false)
                    }
                    is LessonPhase.Error -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text(phase.message, color = palette.ink, textAlign = TextAlign.Center) }
                }
            }
        }
    }
}

/**
 * The question in the unit's room: the room and HUD on top, Alphonso's bubble over his robe, the answers below. It
 * scrolls; Check and the verdict sheet are pinned at the foot.
 */
@Composable
private fun QuizStage(vm: LessonViewModel, state: LessonUiState, course: Course, container: AppContainer, roomId: String, hearts: Int?, onExit: () -> Unit) {
    val context = LocalContext.current
    val question = state.currentQuestion
    val layout = LessonStage.layout(LocalConfiguration.current.screenHeightDp, question.promptText)
    var started by remember(state.isReinforcing, question.id) { mutableStateOf(false) }
    val answered = state.checked
    val correct = if (answered) vm.isCurrentCorrect() else false
    val expression = LessonStage.expression(picked = !state.picked.isNullOrBlank() || started, verdict = if (answered) correct else null)
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            LessonRoom(roomId, expression, layout.roomHeight.dp, layout.alphonsoWidth.dp) {
                Box(Modifier.padding(16.dp)) {
                    LessonHud((state.idx + if (answered) 1 else 0).toFloat() / maxOf(1, state.total), hearts, onExit, valueText = "Question ${state.idx + 1} of ${state.total}")
                }
            }
            Box(Modifier.padding(horizontal = 16.dp).offset(y = if (layout.size == LessonStage.Size.SMALL) (-36).dp else (-44).dp)) {
                key(state.isReinforcing, question.id) {
                    LessonStageQuestion(
                        container = container, question = question, course = course, vocabImages = container.content.vocabImages,
                        checked = answered, isCorrect = correct, isReinforcing = state.isReinforcing,
                        compact = layout.size == LessonStage.Size.SMALL, picked = state.picked, onPick = vm::pick,
                        onStarted = { started = it }, translationVerdict = state.translationVerdict,
                    )
                }
            }
        }
        when {
            state.isSubmitting -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.isChecking -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { Text("Checking...") }
            !answered -> Box(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                LessonEdgeButton("Check", EdgeVariant.PRIMARY, { vm.check() }, enabled = !state.picked.isNullOrBlank())
            }
            else -> {
                val more = state.isReinforcing || state.pendingReinforcement != null || state.idx < state.total - 1
                LessonVerdictSheet(
                    correct = correct, title = if (correct) "Exactly!" else "Not quite",
                    // Only XP the server will pay: a replay pays past the best earlier score only.
                    xp = vm.answerXp(),
                    correctAnswer = question.correctAnswerText,
                    onHearAnswer = { Speech.get(context).speak(question.correctAnswerText, course) },
                    continueLabel = if (more) (if (correct) "Continue" else "Got it") else "Finish",
                    onContinue = vm::continueOrFinish,
                    explanation = {
                        // The sheet already says right or wrong with Alphonso's face: only the one-line why here.
                        Explanation(container, correct, question.explanation, course, question, inSheet = true)
                    },
                    // A wrong answer can be explained in the learner's own language; a right one has nothing to explain.
                    extra = {
                        if (!correct) {
                            val request = remember(question.id, state.picked, course.code) {
                                ExplainRules.wrongAnswer(question.promptText, state.picked.orEmpty(), question.correctAnswerText, course.code)
                            }
                            ExplainInMyLanguage(container, request)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun LeagueUpCard(tier: String) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.xl)).background(LeagueTierPalette.color(tier).copy(alpha = 0.15f)).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("League up!", style = MaterialTheme.typography.headlineMedium, color = palette.ink)
        Text("You've been promoted to ${tier.replaceFirstChar { it.uppercase() }}!", color = palette.ink)
    }
}

@Composable
private fun VocabScreen(container: AppContainer, lesson: Lesson, items: List<VocabItem>, course: Course, onStart: () -> Unit) {
    val palette = AlphonsoColor.palette
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AlphonsoSectionHeader("Vocabulary · ${lesson.subtitle}")
        Text(lesson.title, style = MaterialTheme.typography.headlineMedium, color = palette.ink)
        Text("${items.size} word${if (items.size == 1) "" else "s"} to learn before you practice.", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items.forEach { item ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoRadius.lg)).background(palette.parchment).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    item.image?.let { VocabImage(it) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(item.term, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                        TextButton(onClick = { Speech.get(context).speak(item.term, course) }) { Text("🔊", color = palette.inkSoft) }
                    }
                    if (item.meaning.isNotEmpty()) {
                        Text(item.meaning, style = MaterialTheme.typography.bodySmall, color = palette.inkSoft)
                    }
                    if (item.example.isNotEmpty()) {
                        Text(item.example, style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic), color = palette.inkSoft)
                    }
                    ExplainInMyLanguage(container, ExplainRules.word(item.term, item.example, course.code))
                }
            }
        }
        AlphonsoPrimaryButton("Start practice", onClick = onStart)
    }
}

@Composable
private fun OfflineFinishScreen(message: String, estimate: Int, correct: Int, total: Int) {
    val palette = AlphonsoColor.palette
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
        Text("☁️", style = MaterialTheme.typography.displayMedium, modifier = Modifier.clearAndSetSemantics {})
        Text(message, style = MaterialTheme.typography.headlineSmall, color = palette.ink, textAlign = TextAlign.Center)
        // "Up to", as on iOS: a replay earns only past its best, which this screen may not know offline.
        Text("Up to +$estimate XP once it syncs", style = MaterialTheme.typography.headlineMedium, color = palette.ember, textAlign = TextAlign.Center)
        Text("A lesson you've already finished only earns XP for a better score.", style = MaterialTheme.typography.bodySmall, color = palette.inkSoft, textAlign = TextAlign.Center)
        Text("$correct/$total correct", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
    }
}

/**
 * Shown instead of the lesson when it cannot start at 0 hearts, matching iOS OutOfHeartsSheet and the web's
 * HeartsModal: a live countdown to the refill, "Use 50 XP for a heart" (online only) and "Review instead",
 * because review and practice never cost hearts. Every path leads somewhere.
 */
@Composable
private fun OutOfHeartsContent(
    model: OutOfHeartsModel,
    isOnline: Boolean,
    buying: Boolean,
    buyMessage: String?,
    onBuy: () -> Unit,
    onRefillDue: () -> Unit,
    onReviewInstead: () -> Unit,
) {
    val palette = AlphonsoColor.palette
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(model) {
        var refillHandled = false
        while (true) {
            now = System.currentTimeMillis()
            if (!refillHandled && model.isRefillDue(now)) {
                refillHandled = true
                onRefillDue()
            }
            delay(1_000)
        }
    }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text("💔", style = MaterialTheme.typography.displaySmall, modifier = Modifier.clearAndSetSemantics {})
        Text(OutOfHeartsModel.TITLE, style = MaterialTheme.typography.headlineSmall, color = palette.ink)
        Text(
            model.message(now), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, textAlign = TextAlign.Center,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        if (model.showsBuy(isOnline)) {
            if (buying) CircularProgressIndicator(color = palette.moss)
            else AlphonsoPrimaryButton(OutOfHeartsModel.BUY_TITLE, onClick = onBuy)
        }
        buyMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = palette.destructive, textAlign = TextAlign.Center) }
        TextButton(onClick = onReviewInstead) { Text(OutOfHeartsModel.REVIEW_INSTEAD_TITLE, color = palette.moss) }
    }
}
