package com.obsidianmedia.learnwithalphonso.ui.firstrun

import com.obsidianmedia.learnwithalphonso.core.analytics.AnalyticsEvent
import com.obsidianmedia.learnwithalphonso.Analytics
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.firstrun.CompleteProfileSkip
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRunStore
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerProfile
import com.obsidianmedia.learnwithalphonso.core.firstrun.ProfileAvatars
import com.obsidianmedia.learnwithalphonso.core.logic.LessonExpression
import com.obsidianmedia.learnwithalphonso.core.net.LearnerProfileClient
import com.obsidianmedia.learnwithalphonso.core.net.LearnerProfileError
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileCountry
import com.obsidianmedia.learnwithalphonso.core.net.fetchProfileIdentity
import com.obsidianmedia.learnwithalphonso.core.net.updateProfileAvatarSeed
import com.obsidianmedia.learnwithalphonso.firstrun.FirstRunDevice
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * After sign-in, never before (the web's AfterSignIn.tsx, the iOS AfterSignInView): the profile picture, "how did
 * you hear about me" (skippable), then Meet Hector with a trial line read from the store's offer and a clear Not now.
 */
@Composable
fun AfterSignInScreen(
    container: AppContainer, name: String, course: String, interests: List<String>, avatarSeed: String,
    onFinish: (FirstRun.FinishTarget) -> Unit,
) {
    // 0 is the optional-analytics choice: only in a build that has a PostHog key and only for a learner who has not
    // answered yet. Everything else is unchanged.
    var step by remember { mutableStateOf(if (Analytics.isAvailable && !Analytics.hasAnswered) 0 else 1) }
    // Only the step name leaves the device, never an answer. The choice itself is not counted: nothing is asked of
    // the learner before they answer it.
    LaunchedEffect(step) {
        val name = when (step) { 1 -> "avatar"; 2 -> "heard"; 3 -> "meet_hector"; else -> null }
        if (name != null) Analytics.track(AnalyticsEvent.ONBOARDING_STEP, mapOf("step" to name))
    }
    when (step) {
        0 -> FirstRunUsageStep(course) { step = 1 }
        1 -> FirstRunAvatarStep(name, avatarSeed, save = { seed -> saveAvatar(container, seed) }) { step = 2 }
        2 -> FirstRunHeardStep(container, course) { step = 3 }
        else -> MeetHectorScreen(container, name, course, interests, onFinish = onFinish)
    }
}

/**
 * A neutral, two-button choice (no pre-selected answer, no reward attached): share anonymous usage data or not.
 * Settings > Share anonymous usage data changes it any time. Nothing is sent before an answer.
 */
@Composable
internal fun FirstRunUsageStep(course: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val title = "Help improve Alphonso?"
    val note = "Share anonymous usage data: which lessons and screens are used. Never what you type or say, and never your name or email. Change it any time in Settings."
    FirstRunScreen(
        room = {
            FirstRunRoom(FirstRun.room(course, null), lessonFace(LessonExpression.NEUTRAL), "Alphonso, asking")
            FirstRunBubble(title, sub = note) { FirstRunDevice.speak(context, title) }
        },
        footer = {
            FirstRunFooter(
                "Share anonymous usage data",
                { Analytics.setConsent(true); onDone() },
                secondaryLabel = "No thanks",
                onSecondary = { Analytics.setConsent(false); onDone() },
            )
        },
    ) {}
}

/** True when the picture was saved to profiles.avatar_seed (an animal from the list, or the old colour seed). */
internal suspend fun saveAvatar(container: AppContainer, seed: String): Boolean {
    val userId = container.session.userId ?: return false
    if (!ProfileAvatars.isAllowedSeed(seed)) return false
    return runCatching { container.progressClient.updateProfileAvatarSeed(seed, userId) }.isSuccess
}

@Composable
internal fun FirstRunAvatarStep(name: String, seed: String, save: suspend (String) -> Boolean, onDone: () -> Unit) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var value by remember { mutableStateOf(seed) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val title = if (name.isEmpty()) "Pick your picture." else "Pick your picture, $name."
    FirstRunScreen(
        room = {
            FirstRunRoom("room-light", lessonFace(LessonExpression.HAPPY), "Alphonso, smiling")
            FirstRunBubble(title, "Your friends and leaderboards show it. Change it any time in Profile.") { FirstRunDevice.speak(context, title) }
        },
        footer = {
            FirstRunFooter(if (busy) "Saving…" else "Continue", {
                if (value == seed) { onDone(); return@FirstRunFooter }
                busy = true; error = null
                scope.launch {
                    if (save(value)) onDone() else error = "Couldn't save your picture. Try again, or keep your initial for now."
                    busy = false
                }
            }, enabled = !busy, secondaryLabel = "Keep my initial", onSecondary = onDone)
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s5).padding(top = AlphonsoTokens.Space.s1), verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3)) {
            AvatarPickerGrid(value, name, ProfileAvatars.initialsSeed(seed)) { value = it }
            error?.let { Text(it, style = FootnoteType, color = ds.wrongInk) }
        }
    }
}

@Composable
internal fun FirstRunHeardStep(container: AppContainer?, course: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var picked by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val title = "One last thing: how did you hear about me?"
    FirstRunScreen(
        room = {
            FirstRunRoom(FirstRun.room(course, null), lessonFace(LessonExpression.NEUTRAL), "Alphonso, listening") {
                FirstRunHud(showCounter = false, onSkip = onDone)
            }
            FirstRunBubble(title) { FirstRunDevice.speak(context, title) }
        },
        footer = {
            FirstRunFooter("Continue", {
                val choice = picked ?: return@FirstRunFooter
                busy = true
                scope.launch {
                    // Optional and only for us: never hold the learner up over it.
                    runCatching { container?.learnerProfileClient?.save(LearnerAnswers(heardFrom = choice)) }
                    onDone()
                }
            }, enabled = picked != null && !busy)
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s1), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FirstRun.heardChoices.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { c -> FirstRunChoiceTile(c.icon, c.label, picked == c.id, { picked = c.id }, Modifier.weight(1f)) }
                }
            }
        }
    }
}

/** Hector, his three promises, and the trial line only when Google Play offers THIS learner a free trial. */
@Composable
fun MeetHectorScreen(
    container: AppContainer?, name: String, course: String, interests: List<String>,
    /** The screenshot harness only (a stand-in offer); null everywhere else. */
    trialDaysOverride: Int? = null,
    onFinish: (FirstRun.FinishTarget) -> Unit,
) {
    val ds = LocalAlphonsoTokens.current
    val context = LocalContext.current
    val packages = container?.entitlements?.state?.collectAsState()?.value?.packages.orEmpty()
    LaunchedEffect(Unit) { container?.entitlements?.loadOffering() }
    // From Play Billing through RevenueCat: Play lists only the offers this account can take. Null hides the line.
    val trial = FirstRun.trialLine(trialDaysOverride ?: FirstRun.trialDays(packages.map { it.freeTrialPeriod }))
    val title = "${FirstRun.greeting(course, name)} I'm Hector."
    FirstRunScreen(
        room = {
            FirstRunRoom("hotel", "firstrun/hector-talk.webp", "Hector, Alphonso's friend and tutor", RoomSize.HERO) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(
                        "MEET YOUR TUTOR", style = OverlineType, color = ds.onAction,
                        modifier = Modifier.clip(CircleShape).background(ds.action).padding(horizontal = AlphonsoTokens.Space.s3, vertical = AlphonsoTokens.Space.s1),
                    )
                }
            }
            FirstRunBubble(title, "When you want to really talk, call me. I remember what you find hard.", playLabel = "Hear Hector") { FirstRunDevice.speak(context, title) }
        },
        footer = {
            FirstRunFooter(
                FirstRun.hectorButton(trial != null), { onFinish(FirstRun.FinishTarget.HECTOR) }, note = trial,
                secondaryLabel = "Not now", onSecondary = { onFinish(FirstRun.FinishTarget.LESSON) },
            )
        },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.gutter).padding(top = AlphonsoTokens.Space.s1), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Benefit("chat", "Real conversations", FirstRun.hectorTopics(interests))
            Benefit("brain", "He remembers you", "Your level and your weak spots")
            Benefit("heartc", "Kind corrections", "One fix at a time, never a lecture")
        }
    }
}

@Composable
private fun Benefit(icon: String, title: String, sub: String) {
    val ds = LocalAlphonsoTokens.current
    val shape = RoundedCornerShape(AlphonsoTokens.Radius.control)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(ds.card).border(2.dp, ds.line, shape).semantics(mergeDescendants = true) {}
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s3),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(ds.xpTint), contentAlignment = Alignment.Center) { FirstRunIcon(icon, ds.xpText) }
        Column {
            Text(title, style = HeadlineType, color = ds.brand)
            Text(sub, style = CaptionType, color = ds.inkSoft)
        }
    }
}

/** A plain waiting or failed page, in the first run's colours. */
@Composable
private fun FirstRunStatus(title: String?, body: String? = null, retry: (() -> Unit)? = null) {
    val ds = LocalAlphonsoTokens.current
    FirstRunScreen(
        room = { Spacer(Modifier.height(AlphonsoTokens.Space.s12 * 3)) },
        footer = { retry?.let { FirstRunFooter("Try again", it) } },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = AlphonsoTokens.Space.s6),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(AlphonsoTokens.Space.s2),
        ) {
            if (title == null) CircularProgressIndicator(color = ds.brand, modifier = Modifier.semantics { contentDescription = "Loading" })
            else Text(title, style = TitleType, color = ds.brand, textAlign = TextAlign.Center)
            body?.let { Text(it, style = BodyType, color = ds.inkSoft, textAlign = TextAlign.Center) }
        }
    }
}

/**
 * Right after sign-in from the first run (the web's /hello): the answers kept on this device are saved to the account
 * once, then the picture, how you heard about us, and Meet Hector.
 */
@Composable
fun FirstRunHelloScreen(
    container: AppContainer, answers: LearnerAnswers, store: FirstRunStore,
    onFinish: (FirstRun.Destination) -> Unit, placementTaken: suspend () -> Boolean,
) {
    val scope = rememberCoroutineScope()
    var phase by remember { mutableStateOf<String?>("saving") }
    var seed by remember { mutableStateOf("a") }
    val save: suspend () -> Unit = {
        phase = "saving"
        phase = try {
            container.learnerProfileClient.save(answers, LearnerProfileClient.Mark.COMPLETED)
            store.clearDraft()
            container.session.userId?.let { id -> runCatching { container.progressClient.fetchProfileIdentity(id) }.getOrNull()?.avatarSeed }?.let { seed = it }
            null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            "failed"
        }
    }
    LaunchedEffect(Unit) { save() }
    when (phase) {
        null -> AfterSignInScreen(container, answers.name.orEmpty(), answers.course ?: "en", answers.interests.orEmpty(), seed) { target ->
            scope.launch { onFinish(FirstRun.destination(target, answers.level, placementTaken())) }
        }
        "failed" -> FirstRunStatus("Your plan didn't save", "Your answers are still on this device. Check your connection and try again.") { scope.launch { save() } }
        else -> FirstRunStatus("Saving your plan…")
    }
}

/**
 * "Complete your profile": the first run once more for learners who signed up before it existed (or from Profile, to
 * change the answers), skipping the course and sign-in. Not now ends it for good.
 */
@Composable
fun CompleteProfileScreen(
    container: AppContainer, course: String, edit: Boolean, store: FirstRunStore,
    onFinish: (FirstRun.Destination?) -> Unit, onBlocked: () -> Unit, onUnder13Ok: () -> Unit,
    placementTaken: suspend () -> Boolean,
) {
    val scope = rememberCoroutineScope()
    var prefill by remember { mutableStateOf<LearnerAnswers?>(null) }
    var avatarSeed by remember { mutableStateOf("a") }
    var saved by remember { mutableStateOf<LearnerAnswers?>(null) }
    LaunchedEffect(Unit) {
        val userId = container.session.userId
        coroutineScope {
            val profile = async { runCatching { container.learnerProfileClient.fetch() }.getOrDefault(LearnerProfile()) }
            val identity = async { userId?.let { runCatching { container.progressClient.fetchProfileIdentity(it) }.getOrNull() } }
            val country = async { userId?.let { runCatching { container.progressClient.fetchProfileCountry(it) }.getOrNull() } }
            val i = identity.await()
            avatarSeed = i?.avatarSeed ?: "a"
            prefill = FirstRun.completeProfilePrefill(profile.await(), i?.displayName, country.await())
        }
    }
    val done = saved
    val start = prefill
    when {
        done != null -> AfterSignInScreen(container, done.name.orEmpty(), course, done.interests.orEmpty(), avatarSeed) { target ->
            scope.launch {
                if (edit && target == FirstRun.FinishTarget.LESSON) onFinish(null)
                else onFinish(FirstRun.destination(target, done.level, placementTaken()))
            }
        }
        start != null -> FirstRunFlowScreen(
            mode = FirstRun.Mode.COMPLETE, store = store, container = container, prefill = start, course = course,
            onExit = {
                scope.launch {
                    if (!edit) {
                        // Skipped for this launch even if the save below fails, so the gate cannot loop back here.
                        CompleteProfileSkip.skipThisLaunch()
                        runCatching { container.learnerProfileClient.save(LearnerAnswers(), LearnerProfileClient.Mark.DISMISSED) }
                    }
                    onFinish(null)
                }
            },
            onBlocked = onBlocked, onUnder13Ok = onUnder13Ok,
            onSave = { draft ->
                val patch = FirstRun.cleanAnswers(draft.copy(course = course)) ?: LearnerAnswers()
                try {
                    container.learnerProfileClient.save(patch, LearnerProfileClient.Mark.COMPLETED)
                    store.clearDraft()
                    saved = draft
                    null
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: LearnerProfileError.Failed) {
                    e.serverMessage ?: "Couldn't save. Try again."
                } catch (e: Exception) {
                    "Couldn't save. Try again."
                }
            },
        )
        else -> FirstRunStatus(null)
    }
}

/** Under 13 chosen while signed in (Complete your profile): end the session on this device only, sending nothing. */
fun signOutBlockedDevice(container: AppContainer) {
    container.session.endLocally()
}
