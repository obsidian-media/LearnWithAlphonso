package com.obsidianmedia.learnwithalphonso.ui.firstrun

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.obsidianmedia.learnwithalphonso.AppContainer
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRun
import com.obsidianmedia.learnwithalphonso.core.firstrun.FirstRunStore
import com.obsidianmedia.learnwithalphonso.core.firstrun.InMemoryFirstRunKeyValue
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import com.obsidianmedia.learnwithalphonso.ui.theme.LocalAlphonsoTokens

/**
 * DEBUG builds only (RootScreen checks BuildConfig.DEBUG): one after-sign-in or Complete-your-profile screen with a
 * made-up learner ("Sam", learning Spanish), for screenshots without an account. Nothing here saves: the store is in
 * memory, Meet Hector has no store connection (so no trial line unless "hector-trial" stands one in), and the
 * picture's save always "succeeds" without a call.
 */
@Composable
fun FirstRunHarness(screen: String, container: AppContainer) {
    val sam = LearnerAnswers(
        name = "Sam", nativeLanguage = "en", country = "GB", showFlag = false, goal = "travel", level = "some",
        dailyMinutes = 10, ageRange = "25-34", interests = listOf("food", "music", "travel"),
    )
    val store = FirstRunStore(InMemoryFirstRunKeyValue(), InMemoryFirstRunKeyValue())
    when (screen) {
        "avatar" -> FirstRunAvatarStep("Sam", "a", save = { true }) {}
        "heard" -> FirstRunHeardStep(null, "es") {}
        "hector" -> MeetHectorScreen(null, "Sam", "es", sam.interests.orEmpty()) {}
        "hector-trial" -> MeetHectorScreen(null, "Sam", "es", sam.interests.orEmpty(), trialDaysOverride = 7) {}
        "complete-hello" -> FirstRunFlowScreen(FirstRun.Mode.COMPLETE, store, container, onExit = {}, onBlocked = {}, onUnder13Ok = {}, prefill = sam, course = "es")
        "complete-about" -> FirstRunFlowScreen(FirstRun.Mode.COMPLETE, store, container, onExit = {}, onBlocked = {}, onUnder13Ok = {}, prefill = sam, course = "es", startIndex = 1)
        "avatar-profile" -> AvatarPickerDialog(container, "Sam", "animal:fox", onClose = {}, onSaved = {})
        else -> Column(Modifier.fillMaxSize().background(LocalAlphonsoTokens.current.surface).statusBarsPadding().padding(AlphonsoTokens.Space.gutter)) {
            ProfileAboutYouCard(container, onEditAnswers = {}, initialName = "Sam", initialSeed = "animal:fox")
        }
    }
}
