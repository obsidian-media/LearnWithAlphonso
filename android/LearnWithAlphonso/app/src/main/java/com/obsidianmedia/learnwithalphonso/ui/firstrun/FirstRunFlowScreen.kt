package com.obsidianmedia.learnwithalphonso.ui.firstrun

import android.app.Activity
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.BuildConfig
import com.obsidianmedia.learnwithalphonso.auth.GoogleSignIn
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.firstrun.AgeChoice
import com.obsidianmedia.learnwithalphonso.core.firstrun.AgeOutcome
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRunStore
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerProfileLists
import com.obsidianmedia.learnwithalphonso.core.logic.LessonAnswerState
import com.obsidianmedia.learnwithalphonso.core.logic.LessonExpression
import com.obsidianmedia.learnwithalphonso.core.logic.LessonTiming
import com.obsidianmedia.learnwithalphonso.core.logic.UnitRooms
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.obsidianmedia.learnwithalphonso.ui.lesson.EdgeVariant
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonAnswerButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonEdgeButton
import com.obsidianmedia.learnwithalphonso.ui.lesson.LessonVerdictSheet
import com.obsidianmedia.learnwithalphonso.ui.lesson.rememberReduceMotion
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.Locale

/**
 * The first run (visual round 6, part 3), the web's FirstRunFlow.tsx and the iOS FirstRunFlowView on Android: the
 * counted questions, the two-question first taste, the plan from the real first units, then sign-in (new learners
 * only). Every answer stays on this device (core FirstRunStore) until the account exists. Complete your profile is the
 * same flow without the course and sign-in, saving to the account at the plan.
 *
 * Under 13 (core FirstRun.chooseAge): the answers are wiped, the device is blocked, and the kind stop screen replaces
 * the flow. [onBlocked] lets the caller silence everything that could send (crash reporting).
 */
@Composable
fun FirstRunFlowScreen(
    mode: FirstRun.Mode,
    store: FirstRunStore,
    container: AppContainer?,
    onExit: () -> Unit,
    onBlocked: () -> Unit,
    onUnder13Ok: () -> Unit,
    prefill: LearnerAnswers = LearnerAnswers(),
    course: String? = null,
    onEmail: () -> Unit = {},
    onHaveAccount: () -> Unit = {},
    /** Complete your profile's "Save my plan": returns an error message to show, or null when saved. */
    onSave: suspend (LearnerAnswers) -> String? = { null },
    startIndex: Int = 0,
) {
    val context = LocalContext.current
    val reduce = rememberReduceMotion()
    var blocked by remember { mutableStateOf(store.isBlocked()) }
    var draft by remember {
        mutableStateOf(merge(if (course != null) prefill.copy(course = course) else prefill, store.readDraft()))
    }
    val questions = remember(mode) { FirstRun.questionSteps(mode) }
    val stages = remember(mode) { questions.map { Stage.Question(it) } + listOf(Stage.Taste, Stage.Plan) + (if (mode == FirstRun.Mode.NEW) listOf(Stage.SignIn) else emptyList()) }
    var index by rememberSaveable { mutableIntStateOf(startIndex.coerceIn(0, stages.size - 1)) }
    val stage = stages[index.coerceIn(0, stages.size - 1)]

    LaunchedEffect(Unit) { if (!store.isBlocked()) com.obsidianmedia.learnwithalphonso.ui.lesson.Speech.get(context) }
    // Another path may have hit the block: check again on every step.
    LaunchedEffect(index) { if (store.isBlocked()) blocked = true }

    if (blocked) {
        Under13StopScreen(onOk = onUnder13Ok)
        return
    }

    val update: ((LearnerAnswers) -> LearnerAnswers) -> Unit = { change ->
        val next = change(draft)
        draft = next
        store.writeDraft(next)
    }
    val next: () -> Unit = { index = (index + 1).coerceAtMost(stages.size - 1) }
    val back: () -> Unit = { if (index == 0) onExit() else index -= 1 }
    val currentCourse = draft.course ?: course ?: "en"
    val speakCourse = Course.entries.firstOrNull { it.code == currentCourse } ?: Course.ENGLISH
    val ctx = StepContext(
        draft = draft, update = update, next = next, back = back, mode = mode, questions = questions,
        index = index, currentCourse = currentCourse,
        speak = { text -> FirstRunDevice.speak(context, text) },
        speakCourse = { text -> FirstRunDevice.speak(context, text, speakCourse) },
    )

    AnimatedContent(
        targetState = stage,
        transitionSpec = {
            if (reduce) fadeIn(tween(AlphonsoTokens.Motion.REDUCED_MAX_MS)) togetherWith fadeOut(tween(AlphonsoTokens.Motion.REDUCED_MAX_MS))
            else (slideInHorizontally(tween(AlphonsoTokens.Motion.SELECT_MS)) { it / 3 } + fadeIn(tween(AlphonsoTokens.Motion.SELECT_MS))) togetherWith fadeOut(tween(AlphonsoTokens.Motion.SELECT_MS))
        },
        label = "first run step",
    ) { s ->
        when (s) {
            is Stage.Question -> when (s.step) {
                FirstRun.QuestionStep.NAME -> NameStep(ctx)
                FirstRun.QuestionStep.COURSE -> CourseStep(ctx)
                FirstRun.QuestionStep.ABOUT -> AboutStep(ctx)
                FirstRun.QuestionStep.GOAL -> GoalStep(ctx)
                FirstRun.QuestionStep.LEVEL -> LevelStep(ctx)
                FirstRun.QuestionStep.TIME -> TimeStep(ctx)
                FirstRun.QuestionStep.AGE -> AgeStep(ctx, store) {
                    draft = LearnerAnswers()
                    onBlocked()
                    blocked = true
                }
                FirstRun.QuestionStep.INTERESTS -> InterestsStep(ctx)
            }
            Stage.Taste -> TasteStep(ctx)
            Stage.Plan -> FirstRunPlanStep(draft, currentCourse, ctx.name, container, onBack = back, onSave = if (mode == FirstRun.Mode.COMPLETE) onSave else null, onNext = next)
            Stage.SignIn -> FirstRunSignInStep(draft, currentCourse, ctx.name, container, onBack = back, onEmail = onEmail, onHaveAccount = onHaveAccount)
        }
    }
}

private sealed interface Stage {
    data class Question(val step: FirstRun.QuestionStep) : Stage
    data object Taste : Stage
    data object Plan : Stage
    data object SignIn : Stage
}

private class StepContext(
    val draft: LearnerAnswers,
    val update: ((LearnerAnswers) -> LearnerAnswers) -> Unit,
    val next: () -> Unit,
    val back: () -> Unit,
    val mode: FirstRun.Mode,
    val questions: List<FirstRun.QuestionStep>,
    val index: Int,
    val currentCourse: String,
    val speak: (String) -> Unit,
    val speakCourse: (String) -> Unit,
) {
    val name: String get() = draft.name?.trim().orEmpty()
    val room: String get() = FirstRun.room(draft.course, draft.goal)
    val courseName: String get() = FirstRun.courseName(currentCourse)
}

/** The device draft wins over the account's answers (it is newer); null fields keep the earlier value. */
private fun merge(base: LearnerAnswers, over: LearnerAnswers) = LearnerAnswers(
    name = over.name ?: base.name,
    course = over.course ?: base.course,
    nativeLanguage = over.nativeLanguage ?: base.nativeLanguage,
    country = over.country ?: base.country,
    showFlag = over.showFlag ?: base.showFlag,
    goal = over.goal ?: base.goal,
    level = over.level ?: base.level,
    dailyMinutes = over.dailyMinutes ?: base.dailyMinutes,
    ageRange = over.ageRange ?: base.ageRange,
    interests = over.interests ?: base.interests,
    heardFrom = over.heardFrom ?: base.heardFrom,
)

internal fun lessonFace(e: LessonExpression) = "lesson/${e.file}.webp"

@Composable
private fun Hud(ctx: StepContext, onSkip: (() -> Unit)? = null) {
    // The questions come first, so the step's number is its place in the flow.
    val step = if (ctx.index < ctx.questions.size) ctx.index + 1 else 0
    val backLabel = if (ctx.index == 0) (if (ctx.mode == FirstRun.Mode.COMPLETE) "Not now" else "Back to sign in") else "Back"
    FirstRunHud(step = step, total = ctx.questions.size, backLabel = backLabel, onBack = ctx.back, onSkip = onSkip)
}

@Composable
private fun Bubble(ctx: StepContext, title: String, sub: String? = null) = FirstRunBubble(title, sub) { ctx.speak(title) }

@Composable
private fun StepBody(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s1),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) { content() }
}

@Composable
private fun NameStep(ctx: StepContext) {
    val ds = LocalAlphonsoTokens.current
    FirstRunScreen(
        room = {
            FirstRunRoom("room-light", lessonFace(LessonExpression.TALK), "Alphonso, waving hello", RoomSize.TALL) {
                Hud(ctx) { ctx.update { it.copy(name = null) }; ctx.next() }
            }
            Bubble(ctx, "Hi, I'm Alphonso! What should I call you?", "Just your first name.")
        },
        footer = { FirstRunFooter("Nice to meet you", ctx.next, enabled = ctx.name.isNotEmpty()) },
    ) {
        StepBody {
            val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
            BasicTextField(
                value = ctx.draft.name.orEmpty(),
                onValueChange = { v -> ctx.update { it.copy(name = v.take(40)) } },
                singleLine = true,
                textStyle = TitleType.copy(color = ds.brand),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(ds.brand),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, autoCorrectEnabled = false, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.brand, shape)
                    .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3)
                    .semantics { contentDescription = "Your first name" },
                decorationBox = { inner ->
                    if (ctx.draft.name.isNullOrEmpty()) Text("Your first name", style = TitleType, color = ds.inkFaint)
                    inner()
                },
            )
        }
    }
}

@Composable
private fun CourseStep(ctx: StepContext) {
    val picked = ctx.draft.course
    val title = picked?.let { "${FirstRun.greeting(it, ctx.name)} ${FirstRun.courseName(it)} it is." } ?: "What do you want to learn?"
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(if (picked == null) LessonExpression.TALK else LessonExpression.HAPPY), "Alphonso", chip = picked?.let { "Now in ${FirstRun.courseName(it)}" }) { Hud(ctx) }
            Bubble(ctx, title, "Pick the language you want to learn.")
        },
        footer = { FirstRunFooter("Continue", ctx.next, enabled = picked != null) },
    ) {
        StepBody {
            FirstRun.courseOrder.forEach { c ->
                FirstRunChoiceRow(FirstRun.courseName(c), picked == c, { ctx.update { it.copy(course = c) } }) { FirstRunCourseFlag(c) }
            }
        }
    }
}

internal fun languageName(code: String): String = Locale(code).getDisplayLanguage(Locale.ENGLISH).ifEmpty { code }
internal fun countryName(code: String): String = Locale("", code).getDisplayCountry(Locale.ENGLISH).ifEmpty { code }

@Composable
private fun AboutStep(ctx: StepContext) {
    var picker by remember { mutableStateOf<String?>(null) }
    // The phone's own language and region, as a suggestion only (nothing is looked up over the network).
    LaunchedEffect(Unit) {
        val d = ctx.draft
        if (d.nativeLanguage == null || d.country == null) {
            val lang = Locale.getDefault().language
            val region = Locale.getDefault().country.uppercase()
            ctx.update {
                it.copy(
                    nativeLanguage = it.nativeLanguage ?: lang.takeIf { l -> l in LearnerProfileLists.nativeLanguages },
                    country = it.country ?: region.takeIf { r -> r in LearnerProfileLists.countries },
                )
            }
        }
    }
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.NEUTRAL), "Alphonso, listening") { Hud(ctx) }
            Bubble(ctx, "Tell me a bit about you.", "I'll use your language to explain things later.")
        },
        footer = { FirstRunFooter("Continue", ctx.next, enabled = ctx.draft.nativeLanguage != null && ctx.draft.country != null) },
    ) {
        StepBody {
            FirstRunPickerRow("I speak", ctx.draft.nativeLanguage?.let(::languageName) ?: "Choose a language", { picker = "language" }) { FirstRunIconBadge("globe") }
            FirstRunPickerRow("I'm joining from", ctx.draft.country?.let(::countryName) ?: "Choose a country", { picker = "country" }) {
                val c = ctx.draft.country
                if (c != null) FirstRunCountryChip(c) else FirstRunIconBadge("pin")
            }
            FirstRunSwitchRow(
                "Show my flag on leaderboards", "Off unless you turn it on. You can change it in Profile.",
                ctx.draft.showFlag == true,
            ) { v -> ctx.update { it.copy(showFlag = v) } }
        }
    }
    when (picker) {
        "language" -> FirstRunPickerDialog(
            "I speak", "Search languages",
            LearnerProfileLists.nativeLanguages.map { PickerItem(it, languageName(it)) }.sortedBy { it.label },
            ctx.draft.nativeLanguage, showsCode = false,
            onPick = { id -> ctx.update { it.copy(nativeLanguage = id) }; picker = null }, onClose = { picker = null },
        )
        "country" -> FirstRunPickerDialog(
            "I'm joining from", "Search countries",
            LearnerProfileLists.countries.map { PickerItem(it, countryName(it)) }.sortedBy { it.label },
            ctx.draft.country, showsCode = true,
            onPick = { id -> ctx.update { it.copy(country = id) }; picker = null }, onClose = { picker = null },
        )
    }
}

@Composable
private fun TwoColumn(items: List<FirstRun.Choice>, selected: (String) -> Boolean, onPick: (String) -> Unit) {
    items.chunked(2).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { c -> FirstRunChoiceTile(c.icon, c.label, selected(c.id), { onPick(c.id) }, Modifier.weight(1f)) }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun GoalStep(ctx: StepContext) {
    val chip = FirstRun.goalChoices.firstOrNull { it.id == ctx.draft.goal }?.sub
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.TALK), "Alphonso", chip = chip) { Hud(ctx) }
            Bubble(ctx, "Why are you learning ${ctx.courseName}?")
        },
        footer = { FirstRunFooter("Continue", ctx.next, enabled = ctx.draft.goal != null) },
    ) {
        StepBody { TwoColumn(FirstRun.goalChoices, { it == ctx.draft.goal }) { id -> ctx.update { it.copy(goal = id) } } }
    }
}

@Composable
private fun LevelStep(ctx: StepContext) {
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.NEUTRAL), "Alphonso, listening") { Hud(ctx) }
            Bubble(ctx, "How much ${ctx.courseName} do you know?")
        },
        footer = { FirstRunFooter("Continue", ctx.next, enabled = ctx.draft.level != null) },
    ) {
        StepBody {
            FirstRun.levelChoices.forEach { c ->
                val on = ctx.draft.level == c.id
                FirstRunChoiceRow(c.label, on, { ctx.update { it.copy(level = c.id) } }, sub = c.sub) { FirstRunIconBadge(c.icon, on) }
            }
            FirstRun.levelHint(ctx.draft.level, ctx.mode)?.let { FirstRunHint(it) }
        }
    }
}

@Composable
private fun TimeStep(ctx: StepContext) {
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.TALK), "Alphonso") { Hud(ctx) }
            Bubble(ctx, "How much time a day feels right?", "You can change it any time.")
        },
        footer = { FirstRunFooter("Continue", ctx.next, enabled = ctx.draft.dailyMinutes != null) },
    ) {
        StepBody {
            FirstRun.timeChoices.forEach { (minutes, sub) ->
                val on = ctx.draft.dailyMinutes == minutes
                FirstRunChoiceRow("$minutes minutes", on, { ctx.update { it.copy(dailyMinutes = minutes) } }, sub = sub) { FirstRunIconBadge("clock", on) }
            }
        }
    }
}

/** Neutral: never pre-picked, never remembered from an earlier visit. */
@Composable
private fun AgeStep(ctx: StepContext, store: FirstRunStore, onBlocked: () -> Unit) {
    var picked by remember { mutableStateOf<AgeChoice?>(null) }
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.NEUTRAL), "Alphonso, listening") { Hud(ctx) }
            Bubble(ctx, "How old are you?", "So we keep the app right for you.")
        },
        footer = {
            FirstRunFooter("Continue", {
                val choice = picked ?: return@FirstRunFooter
                if (FirstRun.chooseAge(store, choice) == AgeOutcome.BLOCKED) {
                    onBlocked()
                } else {
                    ctx.update { store.readDraft() }
                    ctx.next()
                }
            }, enabled = picked != null)
        },
    ) {
        StepBody {
            AgeChoice.entries.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { c -> FirstRunAgeCard(c, picked == c, { picked = c }, Modifier.weight(1f)) }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsStep(ctx: StepContext) {
    val chosen = ctx.draft.interests.orEmpty()
    FirstRunScreen(
        room = {
            FirstRunRoom(ctx.room, lessonFace(LessonExpression.HAPPY), "Alphonso, smiling") {
                Hud(ctx) { ctx.update { it.copy(interests = emptyList()) }; ctx.next() }
            }
            Bubble(ctx, "What do you love talking about?", "Pick as many as you like.")
        },
        footer = { FirstRunFooter("Continue", ctx.next) },
    ) {
        StepBody {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                FirstRun.interestChoices.forEach { c ->
                    FirstRunInterestChip(c.icon, c.label, c.id in chosen) {
                        ctx.update { d -> val list = d.interests.orEmpty(); d.copy(interests = if (c.id in list) list - c.id else list + c.id) }
                    }
                }
            }
        }
    }
}

@Composable
private fun TasteStep(ctx: StepContext) {
    val items = FirstRun.miniLessons[ctx.currentCourse] ?: FirstRun.miniLessons.getValue("en")
    var n by remember { mutableIntStateOf(0) }
    var picked by remember { mutableStateOf<Int?>(null) }
    var checked by remember { mutableStateOf(false) }
    val q = items[n.coerceAtMost(items.size - 1)]
    val right = picked == q.answer
    val expression = when {
        checked -> if (right) LessonExpression.HAPPY else LessonExpression.HMM
        picked == null -> LessonExpression.TALK
        else -> LessonExpression.NEUTRAL
    }
    val ds = LocalAlphonsoTokens.current
    FirstRunScreen(
        footerPadded = !checked,
        room = {
            FirstRunRoom(FirstRun.room(ctx.currentCourse, null), lessonFace(expression), expression.description) {
                FirstRunHud(showCounter = false, onBack = ctx.back)
            }
            FirstRunBubble(q.prompt, "First taste · ${n + 1} of ${items.size}", playLabel = "Hear it") { ctx.speakCourse(q.say) }
        },
        footer = {
            if (checked) {
                LessonVerdictSheet(
                    correct = right,
                    title = if (right) FirstRun.praise(ctx.currentCourse, ctx.name) else "Not quite",
                    xp = null, correctAnswer = q.choices[q.answer], onHearAnswer = { ctx.speakCourse(q.say) },
                    continueLabel = "Next",
                    onContinue = {
                        if (n + 1 < items.size) { n += 1; picked = null; checked = false } else ctx.next()
                    },
                ) { Text(q.why, style = BodyType, color = ds.ink) }
            } else {
                FirstRunFooter("Check", { checked = true }, enabled = picked != null)
            }
        },
    ) {
        StepBody {
            q.choices.forEachIndexed { i, choice ->
                val state = when {
                    !checked -> if (picked == i) LessonAnswerState.SELECTED else LessonAnswerState.IDLE
                    i == q.answer -> LessonAnswerState.CORRECT
                    i == picked -> LessonAnswerState.INCORRECT
                    else -> LessonAnswerState.DIMMED
                }
                LessonAnswerButton(i, choice, state, { if (!checked) picked = i }, enabled = !checked)
            }
        }
    }
}

// ---------------------------------------------------------------- plan

@Composable
internal fun FirstRunPlanStep(
    draft: LearnerAnswers, course: String, name: String, container: AppContainer?, onBack: () -> Unit,
    onSave: (suspend (LearnerAnswers) -> String?)?, onNext: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val plan = remember(draft.level, draft.dailyMinutes, course) {
        val units = container?.content?.bundle(Course.entries.firstOrNull { it.code == course } ?: Course.ENGLISH)?.units.orEmpty()
        val timing = runCatching { LessonTiming.fromJson(context.assets.open("content/lesson-timing.json").bufferedReader().use { it.readText() }) }.getOrNull()
        val rooms = runCatching { UnitRooms.fromJson(context.assets.open("content/unit-rooms.json").bufferedReader().use { it.readText() }) }.getOrDefault(emptyMap())
        FirstRun.plan(units, draft.level, draft.dailyMinutes, Instant.now(), timing, rooms)
    }
    val title = (if (name.isEmpty()) "Here's" else "$name, here's") + " your ${FirstRun.courseName(course)} plan!"
    FirstRunScreen(
        room = {
            Column(Modifier.fillMaxWidth().statusBarsPadding()) {
                Box(Modifier.padding(horizontal = AlphonsoTokens.Space.gutter, vertical = AlphonsoTokens.Space.s2)) { FirstRunHud(showCounter = false, onBack = onBack) }
                Spacer(Modifier.height(AlphonsoTokens.Space.s12))
                FirstRunBubble(title) { FirstRunDevice.speak(context, title) }
            }
        },
        footer = {
            FirstRunFooter(if (busy) "Saving…" else "Save my plan", {
                val save = onSave
                if (save == null) onNext() else {
                    busy = true; error = null
                    scope.launch { error = save(draft); busy = false }
                }
            }, enabled = !busy)
        },
    ) {
        StepBody {
            FirstRunPlanPath(plan.nodes)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(AlphonsoTokens.Radius.control)).background(ds.hero)
                    .semantics(mergeDescendants = true) {}
                    .padding(horizontal = AlphonsoTokens.Space.s4, vertical = AlphonsoTokens.Space.s3),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
            ) {
                FirstRunIcon("cal", ds.action, 24.dp)
                Column {
                    Text("${plan.goalUnitTitle} by ${FirstRun.formatDay(plan.goalDate)}", style = HeadlineType, color = ds.card)
                    Text("${draft.dailyMinutes ?: 10} minutes a day", style = CaptionType, color = ds.onHeroSoft)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TeamMate(lessonFace(LessonExpression.HAPPY), "Alphonso", "Daily lessons", false, Modifier.weight(1f))
                TeamMate("firstrun/hector-happy.webp", "Hector", "Real conversations", true, Modifier.weight(1f))
            }
            error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
        }
    }
}

@Composable
private fun TeamMate(face: String, name: String, job: String, pro: Boolean, modifier: Modifier) {
    val ds = LocalAlphonsoTokens.current
    val art = rememberFirstRunAsset(face)
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        modifier.clip(shape).background(ds.card).border(2.dp, ds.line, shape).semantics(mergeDescendants = true) {}
            .padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(ds.sunk).clearAndSetSemantics {}) {
            art?.let {
                Image(
                    it, null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = 1.75f; scaleY = 1.75f; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 0.16f) },
                )
            }
        }
        Column {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(name, style = FootnoteType, color = ds.brand)
                if (pro) Text("PRO", style = OverlineType, color = ds.onAction, modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(ds.action).padding(horizontal = 4.dp, vertical = 1.dp))
            }
            Text(job, style = CaptionType, color = ds.inkSoft)
        }
    }
}

/** The first three units as rooms on a dotted path, the second lower in the middle. */
@Composable
private fun FirstRunPlanPath(nodes: List<FirstRun.PlanNode>) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
    BoxWithConstraints(
        Modifier.fillMaxWidth().height(224.dp).clip(shape).background(ds.card).border(2.dp, ds.line, shape)
            .semantics { contentDescription = "Your first units" },
    ) {
        val w = maxWidth
        val h = maxHeight
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics {}) {
            val path = Path().apply {
                moveTo(size.width * 0.16f, size.height * 0.3f)
                cubicTo(size.width * 0.41f, size.height * 0.3f, size.width * 0.37f, size.height * 0.7f, size.width * 0.5f, size.height * 0.7f)
                cubicTo(size.width * 0.63f, size.height * 0.7f, size.width * 0.75f, size.height * 0.3f, size.width * 0.84f, size.height * 0.3f)
            }
            drawPath(path, ds.action, style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 9.dp.toPx()))))
        }
        val spots = listOf(0.2f to 0.32f, 0.5f to 0.62f, 0.8f to 0.32f)
        nodes.take(3).forEachIndexed { k, node ->
            val (fx, fy) = spots[k]
            Column(
                Modifier.width(100.dp).offset(x = w * fx - 50.dp, y = h * fy - 42.dp + 20.dp)
                    .semantics(mergeDescendants = true) { contentDescription = "Unit ${k + 1}, ${node.title}" },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                FirstRunPlanNode(node.room, if (k == 0) ds.brand else if (k == 1) ds.action else ds.line, muted = k == 2)
                Text("${k + 1} · ${node.title}", style = CaptionType, color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.clearAndSetSemantics {})
            }
        }
    }
}

// ---------------------------------------------------------------- sign in

/** "Let's save your plan": the plan card, then Google and email as the sign-in screen has them. */
@Composable
internal fun FirstRunSignInStep(
    draft: LearnerAnswers, course: String, name: String, container: AppContainer?, onBack: () -> Unit,
    onEmail: () -> Unit, onHaveAccount: () -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val title = if (name.isEmpty()) "Let's save your plan." else "Let's save your plan, $name."
    val lines = FirstRun.planSummary(draft, course)
    val icons = listOf("target", "clock", "food")
    val busy = container?.session?.isBusy?.collectAsState()?.value ?: false
    val error = container?.session?.errorMessage?.collectAsState()?.value
    FirstRunScreen(
        room = {
            FirstRunRoom(FirstRun.room(course, null), lessonFace(LessonExpression.TALK), "Alphonso") { FirstRunHud(showCounter = false, onBack = onBack) }
            FirstRunBubble(title, "So it follows you to any device.") { FirstRunDevice.speak(context, title) }
        },
        footer = {},
    ) {
        StepBody {
            val shape = RoundedCornerShape(AlphonsoTokens.Radius.bubble)
            Column(
                Modifier.fillMaxWidth().clip(shape).background(ds.card)
                    .dashedBorder(ds.action, AlphonsoTokens.Radius.bubble)
                    .semantics(mergeDescendants = true) { contentDescription = "Your plan. " + lines.joinToString(". ") }
                    .padding(horizontal = 14.dp, vertical = AlphonsoTokens.Space.s3),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("YOUR PLAN", style = OverlineType, color = ds.actionText)
                lines.forEachIndexed { k, line ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2)) {
                        FirstRunIcon(icons[k.coerceAtMost(icons.size - 1)], ds.actionText, 18.dp)
                        Text(line, style = FootnoteType, color = ds.brand)
                    }
                }
            }
            Spacer(Modifier.height(AlphonsoTokens.Space.s1))
            if (container != null) {
                LessonEdgeButton("Continue with Google", EdgeVariant.SECONDARY, {
                    val url = container.session.beginGoogleSignIn(BuildConfig.SUPABASE_URL, GoogleSignIn.REDIRECT_URI)
                    (context as? Activity)?.let { GoogleSignIn.launch(it, url) }
                }, enabled = !busy)
            }
            LessonEdgeButton("Continue with email", EdgeVariant.SECONDARY, onEmail)
            FirstRunTextButton("I already have an account", onHaveAccount)
            error?.let { Text(it, style = FootnoteType, color = ds.wrongInk, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
            Text(
                "By continuing you agree to our Terms and Privacy Policy.", style = CaptionType, color = ds.inkSoft,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = AlphonsoTokens.Space.s1),
            )
        }
    }
}

private fun Modifier.dashedBorder(color: androidx.compose.ui.graphics.Color, radius: androidx.compose.ui.unit.Dp): Modifier =
    this.drawWithContent {
        drawContent()
        val stroke = 2.dp.toPx()
        drawRoundRect(
            color = color, topLeft = Offset(stroke / 2, stroke / 2),
            size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius.toPx()),
            style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
        )
    }

// ---------------------------------------------------------------- under 13

/**
 * The kind stop for a learner who said they are under 13 (the owner-approved wording). No account, nothing stored but
 * the device's own note that keeps this screen up, and nothing sent. There is no way back into the questions.
 */
@Composable
fun Under13StopScreen(onOk: () -> Unit = {}) {
    val ds = LocalAlphonsoTokens.current
    FirstRunScreen(
        room = { FirstRunRoom("room-light", lessonFace(LessonExpression.NEUTRAL), "Alphonso", RoomSize.TALL) },
        footer = { FirstRunFooter("OK", onOk) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s6).padding(top = AlphonsoTokens.Space.s8),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(FirstRun.UNDER_13_TITLE, style = DisplayType, color = ds.brand, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
            Text(FirstRun.UNDER_13_BODY, style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center)
        }
    }
}
